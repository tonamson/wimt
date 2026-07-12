import { getStore } from "./runtime-store";
import { normalizeUsage, normalizeUsageFromSse } from "./usage";

type Provider = "openai" | "anthropic";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export async function proxyAiRequest(
  request: Request,
  pathParts: string[],
): Promise<Response> {
  const started = Date.now();
  const store = getStore();
  const settings = store.getSettings();
  const requestPath = `/v1/${pathParts.join("/")}`;
  const requestUrl = new URL(request.url);
  const provider = pickProvider(request, requestPath, settings.defaultProvider);
  const upstreamBaseUrl =
    provider === "anthropic"
      ? settings.anthropicUpstreamBaseUrl
      : settings.openaiUpstreamBaseUrl;
  const upstreamUrl = joinUpstreamUrl(upstreamBaseUrl, requestPath);
  upstreamUrl.search = requestUrl.search;

  const requestText = await request.text();
  const model = readModel(requestText);
  const sessionId = readCliSessionId(requestText) ?? "unknown";

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: buildForwardHeaders(request.headers, provider),
      body: request.method === "GET" || request.method === "HEAD" ? undefined : requestText,
    });
    const responseHeaders = stripResponseHeaders(upstreamResponse.headers);
    const contentType = upstreamResponse.headers.get("content-type") ?? "";
    const isStream =
      contentType.includes("text/event-stream") ||
      request.headers.get("accept")?.includes("text/event-stream");

    if (isStream) {
      const body = upstreamResponse.body;
      const [clientBody, logBody] = body ? body.tee() : [null, null];
      const requestId = store.insertRequest({
        sessionId,
        providerSchema: provider,
        upstreamBaseUrl,
        requestPath,
        method: request.method,
        model,
        statusCode: upstreamResponse.status,
        inputTokens: null,
        outputTokens: null,
        cacheWriteTokens: null,
        cacheReadTokens: null,
        totalCacheTokens: null,
        totalTokens: null,
        usageMissing: true,
        rawUsageJson: null,
        requestJson: sanitizeJsonText(requestText, null),
        responseJson: "[stream logging...]",
        error: null,
        latencyMs: Date.now() - started,
      });

      void logStreamUsage(logBody, requestId, provider, started).catch(() => {});

      return new Response(clientBody, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    if (!contentType.includes("application/json")) {
      store.insertRequest({
        sessionId,
        providerSchema: provider,
        upstreamBaseUrl,
        requestPath,
        method: request.method,
        model,
        statusCode: upstreamResponse.status,
        inputTokens: null,
        outputTokens: null,
        cacheWriteTokens: null,
        cacheReadTokens: null,
        totalCacheTokens: null,
        totalTokens: null,
        usageMissing: true,
        rawUsageJson: null,
        requestJson: sanitizeJsonText(requestText, null),
        responseJson: null,
        error: null,
        latencyMs: Date.now() - started,
      });

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    const responseText = await upstreamResponse.text();
    const parsedResponse = parseJson(responseText);
    const normalized = normalizeUsage(parsedResponse);

    store.insertRequest({
      sessionId,
      providerSchema: normalized.schema === "unknown" ? provider : normalized.schema,
      upstreamBaseUrl,
      requestPath,
      method: request.method,
      model: readModel(responseText) ?? model,
      statusCode: upstreamResponse.status,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens,
      cacheWriteTokens: normalized.cacheWriteTokens,
      cacheReadTokens: normalized.cacheReadTokens,
      totalCacheTokens: normalized.totalCacheTokens,
      totalTokens: normalized.totalTokens,
      usageMissing: normalized.usageMissing,
      rawUsageJson:
        normalized.rawUsage === null ? null : JSON.stringify(normalized.rawUsage),
      requestJson: sanitizeJsonText(requestText, null),
      responseJson: sanitizeJsonText(responseText),
      error: upstreamResponse.ok ? null : responseText.slice(0, 500),
      latencyMs: Date.now() - started,
    });

    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "proxy error";

    store.insertRequest({
      sessionId,
      providerSchema: provider,
      upstreamBaseUrl,
      requestPath,
      method: request.method,
      model,
      statusCode: 502,
      inputTokens: null,
      outputTokens: null,
      cacheWriteTokens: null,
      cacheReadTokens: null,
      totalCacheTokens: null,
      totalTokens: null,
      usageMissing: true,
      rawUsageJson: null,
      requestJson: sanitizeJsonText(requestText, null),
      responseJson: null,
      error: message,
      latencyMs: Date.now() - started,
    });

    return Response.json({ error: message }, { status: 502 });
  }
}

async function logStreamUsage(
  body: ReadableStream<Uint8Array> | null,
  requestId: number,
  provider: Provider,
  started: number,
) {
  if (!body) {
    return;
  }

  const text = await new Response(body).text();
  const normalized = normalizeUsageFromSse(text);

  getStore().updateRequestUsage(requestId, {
    providerSchema: normalized.schema === "unknown" ? provider : normalized.schema,
    inputTokens: normalized.inputTokens,
    outputTokens: normalized.outputTokens,
    cacheWriteTokens: normalized.cacheWriteTokens,
    cacheReadTokens: normalized.cacheReadTokens,
    totalCacheTokens: normalized.totalCacheTokens,
    totalTokens: normalized.totalTokens,
    usageMissing: normalized.usageMissing,
    rawUsageJson:
      normalized.rawUsage === null ? null : JSON.stringify(normalized.rawUsage),
    responseJson: text.slice(0, 50_000),
    latencyMs: Date.now() - started,
  });
}

function pickProvider(
  request: Request,
  path: string,
  defaultProvider: string,
): Provider {
  if (defaultProvider === "openai" || defaultProvider === "anthropic") {
    return defaultProvider;
  }

  if (
    request.headers.has("anthropic-version") ||
    request.headers.has("x-api-key") ||
    path === "/v1/messages"
  ) {
    return "anthropic";
  }

  return "openai";
}

function buildForwardHeaders(headers: Headers, provider: Provider) {
  const nextHeaders = new Headers();

  headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      nextHeaders.set(key, value);
    }
  });

  if (provider === "anthropic" && !nextHeaders.has("anthropic-version")) {
    nextHeaders.set("anthropic-version", "2023-06-01");
  }

  return nextHeaders;
}

function stripResponseHeaders(headers: Headers) {
  const nextHeaders = new Headers();

  headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      nextHeaders.set(key, value);
    }
  });

  return nextHeaders;
}

function readModel(text: string) {
  const json = parseJson(text);

  if (
    json &&
    typeof json === "object" &&
    "model" in json &&
    typeof json.model === "string"
  ) {
    return json.model;
  }

  return null;
}

function parseJson(text: string): Record<string, unknown> | null {
  if (!text) {
    return null;
  }

  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function readCliSessionId(text: string) {
  const parsed = parseJson(text);
  const found = parsed ? findSessionId(parsed) : null;

  return found ?? matchSessionId(text);
}

function findSessionId(value: unknown): string | null {
  if (typeof value === "string") {
    return matchSessionId(value);
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findSessionId(child);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "session_id" && typeof child === "string" && isUuid(child)) {
      return child;
    }

    const found = findSessionId(child);
    if (found) {
      return found;
    }
  }

  return null;
}

function matchSessionId(text: string) {
  return text.match(/"session_id"\s*:\s*"([0-9a-f-]{36})"/i)?.[1] ?? null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function sanitizeJsonText(text: string, maxLength: number | null = 50_000) {
  const parsed = parseJson(text);

  if (!parsed) {
    return text ? limitText(text, maxLength) : null;
  }

  return limitText(JSON.stringify(maskSecrets(parsed), null, 2), maxLength);
}

function limitText(text: string, maxLength: number | null) {
  return maxLength === null ? text : text.slice(0, maxLength);
}

function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSecrets);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      /api[_-]?key|authorization|token|secret|password/i.test(key)
        ? "[redacted]"
        : maskSecrets(child),
    ]),
  );
}

export function joinUpstreamUrl(baseUrl: string, requestPath: string) {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/$/, "");
  const path = requestPath.replace(/^\//, "");

  base.pathname = `${basePath}/${path}`;

  return base;
}

import { bodyMaxChars, shouldLogBodies } from "./body-log";
import { getStore } from "./runtime-store";
import { createSseUsageParser, normalizeUsage } from "./usage";

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
  // Measurement window (WIMT session) — startSession() resets this without clearing logs.
  const sessionId = store.getCurrentSession().id;
  // CLI conversation id when present (Claude/Codex metadata).
  const cliSessionId = readCliSessionId(requestText);
  const requestJson = captureBodyJson(requestText, null);

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
        cliSessionId,
        providerSchema: provider,
        upstreamBaseUrl,
        requestPath,
        method: request.method,
        model,
        statusCode: upstreamResponse.status,
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCacheTokens: 0,
        totalTokens: 0,
        usageMissing: true,
        rawUsageJson: null,
        requestJson,
        responseJson: shouldLogBodies() ? "[stream logging...]" : null,
        error: null,
        latencyMs: Date.now() - started,
      });

      void logStreamUsage(logBody, requestId, provider, started).catch((error) => {
        const message = error instanceof Error ? error.message : "stream log error";
        getStore().updateRequestUsage(requestId, {
          providerSchema: provider,
          inputTokens: 0,
          outputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          totalCacheTokens: 0,
          totalTokens: 0,
          usageMissing: true,
          rawUsageJson: null,
          responseJson: null,
          latencyMs: Date.now() - started,
          error: message,
        });
      });

      return new Response(clientBody, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    if (!contentType.includes("application/json")) {
      store.insertRequest({
        sessionId,
        cliSessionId,
        providerSchema: provider,
        upstreamBaseUrl,
        requestPath,
        method: request.method,
        model,
        statusCode: upstreamResponse.status,
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCacheTokens: 0,
        totalTokens: 0,
        usageMissing: true,
        rawUsageJson: null,
        requestJson,
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
    debugUsage(provider, "response", normalized);

    store.insertRequest({
      sessionId,
      cliSessionId,
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
      requestJson,
      responseJson: captureBodyJson(responseText),
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
      cliSessionId,
      providerSchema: provider,
      upstreamBaseUrl,
      requestPath,
      method: request.method,
      model,
      statusCode: 502,
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCacheTokens: 0,
      totalTokens: 0,
      usageMissing: true,
      rawUsageJson: null,
      requestJson,
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

  const parser = createSseUsageParser();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const maxBody = bodyMaxChars();
  let responseSnippet = "";
  const captureResponse = shouldLogBodies() && maxBody > 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    parser.push(chunk);

    if (captureResponse && responseSnippet.length < maxBody) {
      const remaining = maxBody - responseSnippet.length;
      responseSnippet += chunk.slice(0, remaining);
    }
  }

  // Flush decoder tail (multi-byte chars at chunk boundary).
  const tail = decoder.decode();
  if (tail) {
    parser.push(tail);
    if (captureResponse && responseSnippet.length < maxBody) {
      responseSnippet += tail.slice(0, maxBody - responseSnippet.length);
    }
  }

  const normalized = parser.finish();
  debugUsage(provider, "stream", normalized);

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
    responseJson: captureResponse ? responseSnippet || null : null,
    latencyMs: Date.now() - started,
    error: null,
  });
}

function debugUsage(
  provider: Provider,
  source: "response" | "stream",
  usage: ReturnType<typeof normalizeUsage>,
) {
  if (process.env.WIMT_DEBUG_USAGE !== "1") {
    return;
  }

  console.debug("[wimt:usage]", {
    provider,
    source,
    schema: usage.schema,
    usageMissing: usage.usageMissing,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    cacheReadTokens: usage.cacheReadTokens,
    totalCacheTokens: usage.totalCacheTokens,
    totalTokens: usage.totalTokens,
    rawUsage: usage.rawUsage,
  });
}

export function pickProvider(
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
    if (
      !HOP_BY_HOP_HEADERS.has(key.toLowerCase()) &&
      key.toLowerCase() !== "content-encoding"
    ) {
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

export function sanitizeJsonText(text: string, maxLength: number | null = bodyMaxChars()) {
  const parsed = parseJson(text);

  if (!parsed) {
    return text ? limitText(text, maxLength) : null;
  }

  return limitText(JSON.stringify(maskSecrets(parsed), null, 2), maxLength);
}

function captureBodyJson(text: string, maxLength: number | null = bodyMaxChars()) {
  if (!shouldLogBodies()) {
    return null;
  }
  return sanitizeJsonText(text, maxLength);
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

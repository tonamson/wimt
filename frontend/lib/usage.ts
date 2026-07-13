export type ProviderSchema = "openai" | "anthropic" | "unknown";

export type NormalizedUsage = {
  schema: ProviderSchema;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCacheTokens: number;
  totalTokens: number;
  rawUsage: unknown;
  usageMissing: boolean;
};

type JsonRecord = Record<string, unknown>;

export function normalizeUsage(responseJson: unknown): NormalizedUsage {
  const usage = getUsage(responseJson);

  if (!usage) {
    return emptyUsage(true, null);
  }

  if (isNumber(usage.prompt_tokens) || isNumber(usage.completion_tokens)) {
    const details = isRecord(usage.prompt_tokens_details)
      ? usage.prompt_tokens_details
      : {};
    const cacheReadTokens = numberOrZero(details.cached_tokens);
    const cacheWriteTokens = numberOrZero(
      details.cache_write_tokens ?? details.cache_creation_tokens,
    );

    return {
      schema: "openai",
      inputTokens: numberOrZero(usage.prompt_tokens),
      outputTokens: numberOrZero(usage.completion_tokens),
      cacheWriteTokens,
      cacheReadTokens,
      totalCacheTokens: cacheWriteTokens + cacheReadTokens,
      totalTokens: numberOrZero(usage.total_tokens),
      rawUsage: usage,
      usageMissing: false,
    };
  }

  if (isNumber(usage.input_tokens) || isNumber(usage.output_tokens)) {
    const inputTokens = numberOrZero(usage.input_tokens);
    const outputTokens = numberOrZero(usage.output_tokens);
    const cacheWriteTokens = numberOrZero(usage.cache_creation_input_tokens);
    const cacheReadTokens = numberOrZero(usage.cache_read_input_tokens);

    return {
      schema: "anthropic",
      inputTokens,
      outputTokens,
      cacheWriteTokens,
      cacheReadTokens,
      totalCacheTokens: cacheWriteTokens + cacheReadTokens,
      totalTokens: inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens,
      rawUsage: usage,
      usageMissing: false,
    };
  }

  return emptyUsage(false, usage);
}

export function normalizeUsageFromSse(text: string): NormalizedUsage {
  let latest = emptyUsage(true, null);

  for (const event of text.split(/\n\n+/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");

    if (!data || data === "[DONE]") {
      continue;
    }

    const json = parseJson(data);
    if (!json) {
      continue;
    }

    const normalized = normalizeUsage(json);
    if (!normalized.usageMissing) {
      latest = normalized;
    }
  }

  return latest;
}

function getUsage(value: unknown): JsonRecord | null {
  if (!isRecord(value) || !isRecord(value.usage)) {
    return null;
  }

  return value.usage;
}

function emptyUsage(usageMissing: boolean, rawUsage: unknown): NormalizedUsage {
  return {
    schema: "unknown",
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalCacheTokens: 0,
    totalTokens: 0,
    rawUsage,
    usageMissing,
  };
}

function numberOrZero(value: unknown): number {
  return isNumber(value) ? value : 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): JsonRecord | null {
  try {
    const value = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

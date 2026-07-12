export type ProviderSchema = "openai" | "anthropic" | "unknown";

export type NormalizedUsage = {
  schema: ProviderSchema;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadTokens: number | null;
  totalCacheTokens: number | null;
  totalTokens: number | null;
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
    const cacheReadTokens = numberOrNull(details.cached_tokens);
    const cacheWriteTokens = numberOrNull(
      details.cache_write_tokens ?? details.cache_creation_tokens,
    );

    return {
      schema: "openai",
      inputTokens: numberOrNull(usage.prompt_tokens),
      outputTokens: numberOrNull(usage.completion_tokens),
      cacheWriteTokens,
      cacheReadTokens,
      totalCacheTokens: sumKnown(cacheWriteTokens, cacheReadTokens),
      totalTokens: numberOrNull(usage.total_tokens),
      rawUsage: usage,
      usageMissing: false,
    };
  }

  if (isNumber(usage.input_tokens) || isNumber(usage.output_tokens)) {
    const inputTokens = numberOrNull(usage.input_tokens);
    const outputTokens = numberOrNull(usage.output_tokens);
    const cacheWriteTokens = numberOrNull(usage.cache_creation_input_tokens);
    const cacheReadTokens = numberOrNull(usage.cache_read_input_tokens);

    return {
      schema: "anthropic",
      inputTokens,
      outputTokens,
      cacheWriteTokens,
      cacheReadTokens,
      totalCacheTokens: sumKnown(cacheWriteTokens, cacheReadTokens),
      totalTokens: sumKnown(
        inputTokens,
        outputTokens,
        cacheWriteTokens,
        cacheReadTokens,
      ),
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
    inputTokens: null,
    outputTokens: null,
    cacheWriteTokens: null,
    cacheReadTokens: null,
    totalCacheTokens: null,
    totalTokens: null,
    rawUsage,
    usageMissing,
  };
}

function numberOrNull(value: unknown): number | null {
  return isNumber(value) ? value : null;
}

function sumKnown(...values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);

  if (known.length === 0) {
    return null;
  }

  return known.reduce((total, value) => total + value, 0);
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

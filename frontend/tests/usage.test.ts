import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUsage, normalizeUsageFromSse } from "../lib/usage";

test("normalizes openai usage with cached tokens", () => {
  const result = normalizeUsage({
    usage: {
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      prompt_tokens_details: {
        cached_tokens: 40,
      },
    },
  });

  assert.equal(result.schema, "openai");
  assert.equal(result.inputTokens, 100);
  assert.equal(result.outputTokens, 25);
  assert.equal(result.cacheReadTokens, 40);
  assert.equal(result.cacheWriteTokens, 0);
  assert.equal(result.totalCacheTokens, 40);
  assert.equal(result.totalTokens, 125);
  assert.equal(result.usageMissing, false);
});

test("normalizes anthropic cache usage", () => {
  const result = normalizeUsage({
    usage: {
      input_tokens: 100,
      output_tokens: 25,
      cache_creation_input_tokens: 15,
      cache_read_input_tokens: 60,
    },
  });

  assert.equal(result.schema, "anthropic");
  assert.equal(result.inputTokens, 100);
  assert.equal(result.outputTokens, 25);
  assert.equal(result.cacheWriteTokens, 15);
  assert.equal(result.cacheReadTokens, 60);
  assert.equal(result.totalCacheTokens, 75);
  assert.equal(result.totalTokens, 200);
  assert.equal(result.usageMissing, false);
});

test("marks missing usage without guessing", () => {
  const result = normalizeUsage({ id: "resp_missing" });

  assert.equal(result.schema, "unknown");
  assert.equal(result.rawUsage, null);
  assert.equal(result.totalTokens, 0);
  assert.equal(result.usageMissing, true);
});

test("keeps unknown usage raw without mapping fields", () => {
  const result = normalizeUsage({
    usage: {
      tokens: 1000,
      vendor_cache: 300,
    },
  });

  assert.equal(result.schema, "unknown");
  assert.deepEqual(result.rawUsage, { tokens: 1000, vendor_cache: 300 });
  assert.equal(result.totalTokens, 0);
  assert.equal(result.usageMissing, false);
});

test("normalizes final usage from sse", () => {
  const result = normalizeUsageFromSse(
    [
      'event: content_block_delta\ndata: {"delta":{"text":"hi"}}',
      'event: message_delta\ndata: {"usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":2}}',
      "data: [DONE]",
    ].join("\n\n"),
  );

  assert.equal(result.schema, "anthropic");
  assert.equal(result.inputTokens, 10);
  assert.equal(result.outputTokens, 5);
  assert.equal(result.cacheReadTokens, 2);
  assert.equal(result.cacheWriteTokens, 0);
  assert.equal(result.totalTokens, 17);
  assert.equal(result.usageMissing, false);
});

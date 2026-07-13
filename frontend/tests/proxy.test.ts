import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { proxyAiRequest, readCliSessionId, sanitizeJsonText } from "../lib/proxy";

test("keeps full request json when max length is disabled", () => {
  const content = "x".repeat(60_000);
  const saved = sanitizeJsonText(JSON.stringify({ content }), null);

  assert.equal(JSON.parse(saved ?? "{}").content.length, content.length);
});

test("keeps default truncation for logged responses", () => {
  const saved = sanitizeJsonText("x".repeat(60_000));

  assert.equal(saved?.length, 50_000);
});

test("reads Claude CLI session id from nested request metadata", () => {
  const sessionId = "10c70d8e-0fb0-412f-bd60-34a6faa4dc93";
  const body = JSON.stringify({
    system: [
      {
        type: "text",
        text: JSON.stringify({ device_id: "abc", session_id: sessionId }),
      },
    ],
  });

  assert.equal(readCliSessionId(body), sessionId);
});

test("debug logs normalized usage when enabled", async () => {
  const originalFetch = globalThis.fetch;
  const originalDebug = console.debug;
  const originalEnv = process.env.WIMT_DEBUG_USAGE;
  const originalDbPath = process.env.WIMT_DB_PATH;
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-proxy-"));
  const logs: unknown[] = [];

  globalThis.fetch = async () =>
    Response.json({
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 2,
      },
    });
  console.debug = (...args: unknown[]) => logs.push(args);
  process.env.WIMT_DEBUG_USAGE = "1";
  process.env.WIMT_DB_PATH = path.join(dir, "test.sqlite");

  try {
    const response = await proxyAiRequest(
      new Request("http://wimt.test/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-test" }),
      }),
      ["messages"],
    );

    assert.equal(response.status, 200);
    assert.equal((logs[0] as unknown[])[0], "[wimt:usage]");
    assert.deepEqual((logs[0] as unknown[])[1], {
      provider: "anthropic",
      source: "response",
      schema: "anthropic",
      usageMissing: false,
      inputTokens: 10,
      outputTokens: 5,
      cacheWriteTokens: 0,
      cacheReadTokens: 2,
      totalCacheTokens: 2,
      totalTokens: 17,
      rawUsage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 2,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.debug = originalDebug;
    process.env.WIMT_DEBUG_USAGE = originalEnv;
    process.env.WIMT_DB_PATH = originalDbPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

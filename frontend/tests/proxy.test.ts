import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  pickProvider,
  proxyAiRequest,
  readCliSessionId,
  sanitizeJsonText,
} from "../lib/proxy";
import { getStore } from "../lib/runtime-store";

test("keeps full request json when max length is disabled", () => {
  const content = "x".repeat(60_000);
  const saved = sanitizeJsonText(JSON.stringify({ content }), null);

  assert.equal(JSON.parse(saved ?? "{}").content.length, content.length);
});

test("keeps default truncation for logged responses", () => {
  const previous = process.env.WIMT_LOG_BODY_MAX;
  delete process.env.WIMT_LOG_BODY_MAX;
  try {
    const saved = sanitizeJsonText("x".repeat(60_000));
    assert.equal(saved?.length, 8_000);
  } finally {
    if (previous === undefined) {
      delete process.env.WIMT_LOG_BODY_MAX;
    } else {
      process.env.WIMT_LOG_BODY_MAX = previous;
    }
  }
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

test("pickProvider respects path, headers, and manual default", () => {
  assert.equal(
    pickProvider(
      new Request("http://wimt.test/v1/messages", {
        headers: { "content-type": "application/json" },
      }),
      "/v1/messages",
      "auto",
    ),
    "anthropic",
  );
  assert.equal(
    pickProvider(
      new Request("http://wimt.test/v1/chat/completions", {
        headers: { authorization: "Bearer x" },
      }),
      "/v1/chat/completions",
      "auto",
    ),
    "openai",
  );
  assert.equal(
    pickProvider(
      new Request("http://wimt.test/v1/chat/completions"),
      "/v1/chat/completions",
      "anthropic",
    ),
    "anthropic",
  );
});

test("proxy stores WIMT measurement session and CLI session separately", async () => {
  const originalFetch = globalThis.fetch;
  const originalDbPath = process.env.WIMT_DB_PATH;
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-proxy-"));
  process.env.WIMT_DB_PATH = path.join(dir, "test.sqlite");
  delete (globalThis as { __wimtStore?: unknown }).__wimtStore;

  const cliId = "10c70d8e-0fb0-412f-bd60-34a6faa4dc93";
  globalThis.fetch = async () =>
    Response.json({
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 2,
      },
    });

  try {
    const response = await proxyAiRequest(
      new Request("http://wimt.test/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-test",
          system: [{ type: "text", text: JSON.stringify({ session_id: cliId }) }],
        }),
      }),
      ["messages"],
    );

    assert.equal(response.status, 200);
    const store = getStore();
    const row = store.listRequests(1)[0];
    assert.equal(row.sessionId, store.getCurrentSession().id);
    assert.equal(row.cliSessionId, cliId);
    assert.equal(row.totalTokens, 17);
    assert.equal(store.getSummary().currentSession.totalTokens, 17);
  } finally {
    globalThis.fetch = originalFetch;
    getStore().close();
    delete (globalThis as { __wimtStore?: unknown }).__wimtStore;
    if (originalDbPath === undefined) {
      delete process.env.WIMT_DB_PATH;
    } else {
      process.env.WIMT_DB_PATH = originalDbPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
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
  delete (globalThis as { __wimtStore?: unknown }).__wimtStore;

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
    getStore().close();
    delete (globalThis as { __wimtStore?: unknown }).__wimtStore;
    if (originalDbPath === undefined) {
      delete process.env.WIMT_DB_PATH;
    } else {
      process.env.WIMT_DB_PATH = originalDbPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parses stream usage incrementally without requiring full buffer first", async () => {
  const originalFetch = globalThis.fetch;
  const originalDbPath = process.env.WIMT_DB_PATH;
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-proxy-stream-"));
  process.env.WIMT_DB_PATH = path.join(dir, "test.sqlite");
  delete (globalThis as { __wimtStore?: unknown }).__wimtStore;

  const sse = [
    'event: content_block_delta\ndata: {"delta":{"text":"hi"}}\n\n',
    'event: message_delta\ndata: {"usage":{"input_tokens":12,"output_tokens":3,"cache_read_input_tokens":1}}\n\n',
    "data: [DONE]\n\n",
  ].join("");

  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const bytes = encoder.encode(sse);
          // Feed raw bytes (including newlines) in small pieces.
          const chunkSize = 17;
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            controller.enqueue(bytes.subarray(offset, offset + chunkSize));
          }
          controller.close();
        },
      }),
      {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      },
    );

  try {
    const response = await proxyAiRequest(
      new Request("http://wimt.test/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({ model: "claude-stream", stream: true }),
      }),
      ["messages"],
    );

    assert.equal(response.status, 200);
    // Drain client stream so tee side completes.
    await response.text();

    let row = getStore().listRequests(1)[0];
    for (let attempt = 0; attempt < 20 && row.usageMissing === 1; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      row = getStore().listRequests(1)[0];
    }

    assert.equal(row.usageMissing, 0);
    assert.equal(row.inputTokens, 12);
    assert.equal(row.outputTokens, 3);
    assert.equal(row.cacheReadTokens, 1);
    assert.equal(row.totalTokens, 16);
  } finally {
    globalThis.fetch = originalFetch;
    getStore().close();
    delete (globalThis as { __wimtStore?: unknown }).__wimtStore;
    if (originalDbPath === undefined) {
      delete process.env.WIMT_DB_PATH;
    } else {
      process.env.WIMT_DB_PATH = originalDbPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

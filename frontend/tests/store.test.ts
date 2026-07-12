import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore } from "../lib/store";

test("summarizes requests by totals, provider, model, and current session", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    const sessionId = store.getCurrentSession().id;
    store.insertRequest({
      sessionId,
      providerSchema: "openai",
      upstreamBaseUrl: "https://api.openai.com",
      requestPath: "/v1/responses",
      method: "POST",
      model: "gpt-4.1",
      statusCode: 200,
      inputTokens: 100,
      outputTokens: 30,
      cacheWriteTokens: null,
      cacheReadTokens: 40,
      totalCacheTokens: 40,
      totalTokens: 130,
      usageMissing: false,
      rawUsageJson: "{}",
      requestJson: "{\"model\":\"gpt-4.1\"}",
      responseJson: "{\"usage\":{}}",
      error: null,
      latencyMs: 25,
    });

    store.insertRequest({
      sessionId,
      providerSchema: "anthropic",
      upstreamBaseUrl: "https://api.anthropic.com",
      requestPath: "/v1/messages",
      method: "POST",
      model: "claude-sonnet-4",
      statusCode: 200,
      inputTokens: 80,
      outputTokens: 20,
      cacheWriteTokens: 10,
      cacheReadTokens: 15,
      totalCacheTokens: 25,
      totalTokens: 125,
      usageMissing: false,
      rawUsageJson: "{}",
      requestJson: "{\"model\":\"claude-sonnet-4\"}",
      responseJson: "{\"usage\":{}}",
      error: null,
      latencyMs: 50,
    });

    const summary = store.getSummary();

    assert.equal(summary.totals.inputTokens, 180);
    assert.equal(summary.totals.outputTokens, 50);
    assert.equal(summary.totals.totalCacheTokens, 65);
    assert.equal(summary.totals.totalTokens, 255);
    assert.equal(summary.currentSession.totalTokens, 255);
    assert.equal(summary.byProvider.length, 2);
    assert.equal(summary.byModel[0].requests, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("starts a new session without clearing old logs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    const first = store.getCurrentSession();
    const second = store.startSession();

    assert.notEqual(first.id, second.id);
    assert.equal(store.getCurrentSession().id, second.id);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saves upstream settings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    const settings = store.updateSettings({
      openaiUpstreamBaseUrl: "https://openai.example",
      anthropicUpstreamBaseUrl: "https://anthropic.example",
      defaultProvider: "anthropic",
    });

    assert.equal(settings.openaiUpstreamBaseUrl, "https://openai.example");
    assert.equal(settings.anthropicUpstreamBaseUrl, "https://anthropic.example");
    assert.equal(settings.defaultProvider, "anthropic");
    assert.equal(store.getSettings().defaultProvider, "anthropic");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

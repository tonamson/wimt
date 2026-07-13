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
      cacheWriteTokens: 0,
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

test("lists requests with id cursor pagination", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    const sessionId = store.getCurrentSession().id;

    for (const totalTokens of [10, 20, 30]) {
      store.insertRequest({
        sessionId,
        providerSchema: "openai",
        upstreamBaseUrl: "https://api.openai.com",
        requestPath: "/v1/responses",
        method: "POST",
        model: "gpt-4.1",
        statusCode: 200,
        inputTokens: totalTokens,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCacheTokens: 0,
        totalTokens,
        usageMissing: false,
        rawUsageJson: "{}",
        requestJson: "{}",
        responseJson: "{}",
        error: null,
        latencyMs: 1,
      });
    }

    const firstPage = store.listRequests(2);
    const secondPage = store.listRequests(2, firstPage.at(-1)?.id);

    assert.deepEqual(firstPage.map((row) => row.totalTokens), [30, 20]);
    assert.deepEqual(secondPage.map((row) => row.totalTokens), [10]);
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

test("filters every store view with a half-open date range", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    store.insertRequest({
      sessionId: store.getCurrentSession().id,
      providerSchema: "openai",
      upstreamBaseUrl: "https://api.openai.com",
      requestPath: "/v1/responses",
      method: "POST",
      model: "gpt-4.1",
      statusCode: 200,
      inputTokens: 100,
      outputTokens: 30,
      cacheWriteTokens: 0,
      cacheReadTokens: 40,
      totalCacheTokens: 40,
      totalTokens: 130,
      usageMissing: false,
      rawUsageJson: "{}",
      requestJson: "{}",
      responseJson: "{}",
      error: null,
      latencyMs: 25,
    });

    const row = store.listRequests(1)[0];
    const createdAt = Date.parse(row.createdAt);
    const included = {
      from: row.createdAt,
      to: new Date(createdAt + 1).toISOString(),
    };
    const excludedAtUpperBoundary = {
      from: new Date(createdAt - 1).toISOString(),
      to: row.createdAt,
    };

    const includedSummary = store.getSummary(included);
    assert.equal(includedSummary.totals.requests, 1);
    assert.equal(includedSummary.currentSession.totalTokens, 130);
    assert.equal(includedSummary.byProvider[0].key, "openai");
    assert.equal(store.listRequests(10, undefined, included).length, 1);
    assert.equal(store.getUsagePoints(included)[0].totalTokens, 130);

    assert.equal(store.getSummary(excludedAtUpperBoundary).totals.requests, 0);
    assert.equal(
      store.listRequests(10, undefined, excludedAtUpperBoundary).length,
      0,
    );
    assert.equal(store.getUsagePoints(excludedAtUpperBoundary).length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

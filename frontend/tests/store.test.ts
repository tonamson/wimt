import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore, type RequestInsert } from "../lib/store";

function sampleRequest(
  store: ReturnType<typeof createStore>,
  overrides: Partial<RequestInsert> = {},
): RequestInsert {
  return {
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
    ...overrides,
  };
}

test("summarizes requests by totals, provider, model, and current session", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    store.insertRequest(sampleRequest(store));
    store.insertRequest(
      sampleRequest(store, {
        providerSchema: "anthropic",
        upstreamBaseUrl: "https://api.anthropic.com",
        requestPath: "/v1/messages",
        model: "claude-sonnet-4",
        inputTokens: 80,
        outputTokens: 20,
        cacheWriteTokens: 10,
        cacheReadTokens: 15,
        totalCacheTokens: 25,
        totalTokens: 125,
        latencyMs: 50,
      }),
    );

    const summary = store.getSummary();

    assert.equal(summary.totals.inputTokens, 180);
    assert.equal(summary.totals.outputTokens, 50);
    assert.equal(summary.totals.totalCacheTokens, 65);
    assert.equal(summary.totals.totalTokens, 255);
    assert.equal(summary.currentSession.totalTokens, 255);
    assert.equal(summary.upstreamErrors, 0);
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
    store.insertRequest(sampleRequest(store, { sessionId: first.id, totalTokens: 10 }));
    const second = store.startSession();
    store.insertRequest(sampleRequest(store, { sessionId: second.id, totalTokens: 20 }));

    assert.notEqual(first.id, second.id);
    assert.equal(store.getCurrentSession().id, second.id);
    assert.equal(store.getSummary().totals.requests, 2);
    assert.equal(store.getSummary().currentSession.totalTokens, 20);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lists requests with id cursor pagination", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    for (const totalTokens of [10, 20, 30]) {
      store.insertRequest(sampleRequest(store, { totalTokens, inputTokens: totalTokens }));
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
    assert.equal(store.getSettings().retentionDays, 14);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("filters every store view with a half-open date range", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    store.insertRequest(sampleRequest(store));

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
    assert.equal(includedSummary.byModel[0].key, "gpt-4.1");
    assert.equal(store.listRequests(10, row.id + 1, included).length, 1);
    assert.equal(store.getUsagePoints(included)[0].totalTokens, 130);

    const excludedSummary = store.getSummary(excludedAtUpperBoundary);
    assert.equal(excludedSummary.totals.requests, 0);
    assert.equal(excludedSummary.currentSession.totalTokens, 0);
    assert.deepEqual(excludedSummary.byProvider, []);
    assert.deepEqual(excludedSummary.byModel, []);
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

test("stores cli session id separately from measurement session", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    const measureId = store.getCurrentSession().id;
    const cliId = "10c70d8e-0fb0-412f-bd60-34a6faa4dc93";
    store.insertRequest(
      sampleRequest(store, {
        sessionId: measureId,
        cliSessionId: cliId,
      }),
    );

    const row = store.listRequests(1)[0];
    assert.equal(row.sessionId, measureId);
    assert.equal(row.cliSessionId, cliId);
    assert.equal(store.getRequest(row.id)?.cliSessionId, cliId);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("purges request logs older than the retention window", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const previousRetention = process.env.WIMT_RETENTION_DAYS;
  process.env.WIMT_RETENTION_DAYS = "14";
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    const oldAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const recentAt = new Date().toISOString();

    store.insertRequest(
      sampleRequest(store, {
        createdAt: oldAt,
        totalTokens: 1,
        requestJson: "old",
      }),
    );
    store.insertRequest(
      sampleRequest(store, {
        createdAt: recentAt,
        totalTokens: 2,
        requestJson: "new",
      }),
    );

    assert.equal(store.listRequests(10).length, 2);

    const purged = store.purgeExpired();
    assert.equal(purged.deleted, 1);
    assert.equal(purged.days, 14);

    const remaining = store.listRequests(10);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].totalTokens, 2);
  } finally {
    store.close();
    if (previousRetention === undefined) {
      delete process.env.WIMT_RETENTION_DAYS;
    } else {
      process.env.WIMT_RETENTION_DAYS = previousRetention;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("counts upstream errors across the selected range", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    store.insertRequest(sampleRequest(store, { error: null }));
    store.insertRequest(sampleRequest(store, { error: "upstream 500" }));
    store.insertRequest(sampleRequest(store, { error: "timeout" }));

    assert.equal(store.getSummary().upstreamErrors, 2);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

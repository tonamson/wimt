import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type RequestInsert = {
  sessionId: string;
  providerSchema: string;
  upstreamBaseUrl: string;
  requestPath: string;
  method: string;
  model: string | null;
  statusCode: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadTokens: number | null;
  totalCacheTokens: number | null;
  totalTokens: number | null;
  usageMissing: boolean;
  rawUsageJson: string | null;
  requestJson: string | null;
  responseJson: string | null;
  error: string | null;
  latencyMs: number | null;
};

export type Session = {
  id: string;
  createdAt: string;
};

type GroupRow = {
  key: string | null;
  requests: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalCacheTokens: number | null;
  totalTokens: number | null;
  usageMissing: number | null;
};

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "wimt.sqlite");

export function createStore(dbPath = process.env.WIMT_DB_PATH ?? DEFAULT_DB_PATH) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      provider_schema TEXT NOT NULL,
      upstream_base_url TEXT NOT NULL,
      request_path TEXT NOT NULL,
      method TEXT NOT NULL,
      model TEXT,
      status_code INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_write_tokens INTEGER,
      cache_read_tokens INTEGER,
      total_cache_tokens INTEGER,
      total_tokens INTEGER,
      usage_missing INTEGER NOT NULL DEFAULT 0,
      raw_usage_json TEXT,
      request_json TEXT,
      response_json TEXT,
      error TEXT,
      latency_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const getSetting = (key: string) =>
    db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;

  const setSetting = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  function getCurrentSession(): Session {
    const current = getSetting("current_session_id")?.value;

    if (current) {
      const session = db.prepare("SELECT id, created_at FROM sessions WHERE id = ?").get(
        current,
      ) as { id: string; created_at: string } | undefined;

      if (session) {
        return { id: session.id, createdAt: session.created_at };
      }
    }

    return startSession();
  }

  function startSession(): Session {
    const session = {
      id: `ses_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };

    db.prepare("INSERT INTO sessions (id, created_at) VALUES (?, ?)").run(
      session.id,
      session.createdAt,
    );
    setSetting.run("current_session_id", session.id);

    return session;
  }

  function insertRequest(request: RequestInsert) {
    const result = db.prepare(`
      INSERT INTO requests (
        session_id, created_at, provider_schema, upstream_base_url, request_path,
        method, model, status_code, input_tokens, output_tokens, cache_write_tokens,
        cache_read_tokens, total_cache_tokens, total_tokens, usage_missing,
        raw_usage_json, request_json, response_json, error, latency_ms
      )
      VALUES (
        @sessionId, @createdAt, @providerSchema, @upstreamBaseUrl, @requestPath,
        @method, @model, @statusCode, @inputTokens, @outputTokens, @cacheWriteTokens,
        @cacheReadTokens, @totalCacheTokens, @totalTokens, @usageMissing,
        @rawUsageJson, @requestJson, @responseJson, @error, @latencyMs
      )
    `).run({
      ...request,
      createdAt: new Date().toISOString(),
      usageMissing: request.usageMissing ? 1 : 0,
    });

    return Number(result.lastInsertRowid);
  }

  function updateRequestUsage(
    id: number,
    usage: Pick<
      RequestInsert,
      | "providerSchema"
      | "inputTokens"
      | "outputTokens"
      | "cacheWriteTokens"
      | "cacheReadTokens"
      | "totalCacheTokens"
      | "totalTokens"
      | "usageMissing"
      | "rawUsageJson"
      | "responseJson"
      | "latencyMs"
    >,
  ) {
    db.prepare(`
      UPDATE requests
      SET provider_schema = @providerSchema,
          input_tokens = @inputTokens,
          output_tokens = @outputTokens,
          cache_write_tokens = @cacheWriteTokens,
          cache_read_tokens = @cacheReadTokens,
          total_cache_tokens = @totalCacheTokens,
          total_tokens = @totalTokens,
          usage_missing = @usageMissing,
          raw_usage_json = @rawUsageJson,
          response_json = @responseJson,
          latency_ms = @latencyMs
      WHERE id = @id
    `).run({
      id,
      ...usage,
      usageMissing: usage.usageMissing ? 1 : 0,
    });
  }

  function getSummary() {
    const current = getCurrentSession();

    return {
      totals: totalsFor(),
      currentSession: {
        ...current,
        ...totalsFor("WHERE session_id = ?", current.id),
      },
      byProvider: groupBy("provider_schema"),
      byModel: groupBy("model"),
    };
  }

  function totalsFor(where = "", value?: string) {
    const stmt = db.prepare(
      `
        SELECT
          COUNT(*) as requests,
          COALESCE(SUM(input_tokens), 0) as inputTokens,
          COALESCE(SUM(output_tokens), 0) as outputTokens,
          COALESCE(SUM(cache_write_tokens), 0) as cacheWriteTokens,
          COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
          COALESCE(SUM(total_cache_tokens), 0) as totalCacheTokens,
          COALESCE(SUM(total_tokens), 0) as totalTokens,
          COALESCE(SUM(usage_missing), 0) as usageMissing
        FROM requests ${where}
      `,
    );
    const row = (value === undefined ? stmt.get() : stmt.get(value)) as Record<
      string,
      number
    >;

    return row;
  }

  function groupBy(column: "provider_schema" | "model") {
    return db
      .prepare(
        `
        SELECT
          ${column} as key,
          COUNT(*) as requests,
          COALESCE(SUM(input_tokens), 0) as inputTokens,
          COALESCE(SUM(output_tokens), 0) as outputTokens,
          COALESCE(SUM(total_cache_tokens), 0) as totalCacheTokens,
          COALESCE(SUM(total_tokens), 0) as totalTokens,
          COALESCE(SUM(usage_missing), 0) as usageMissing
        FROM requests
        GROUP BY ${column}
        ORDER BY totalTokens DESC
      `,
      )
      .all() as GroupRow[];
  }

  function listRequests(limit = 100, offset = 0) {
    return db
      .prepare(
        `
        SELECT
          id, session_id as sessionId, created_at as createdAt,
          provider_schema as providerSchema, upstream_base_url as upstreamBaseUrl,
          request_path as requestPath, method, model, status_code as statusCode,
          input_tokens as inputTokens, output_tokens as outputTokens,
          cache_write_tokens as cacheWriteTokens, cache_read_tokens as cacheReadTokens,
          total_cache_tokens as totalCacheTokens, total_tokens as totalTokens,
          usage_missing as usageMissing, error, latency_ms as latencyMs
        FROM requests
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(limit, offset);
  }

  function getRequest(id: number) {
    return db
      .prepare(
        `
        SELECT
          id, session_id as sessionId, created_at as createdAt,
          provider_schema as providerSchema, upstream_base_url as upstreamBaseUrl,
          request_path as requestPath, method, model, status_code as statusCode,
          input_tokens as inputTokens, output_tokens as outputTokens,
          cache_write_tokens as cacheWriteTokens, cache_read_tokens as cacheReadTokens,
          total_cache_tokens as totalCacheTokens, total_tokens as totalTokens,
          usage_missing as usageMissing, raw_usage_json as rawUsageJson,
          request_json as requestJson, response_json as responseJson,
          error, latency_ms as latencyMs
        FROM requests
        WHERE id = ?
      `,
      )
      .get(id);
  }

  function clearRequests() {
    db.prepare("DELETE FROM requests").run();
  }

  function getSettings() {
    return {
      openaiUpstreamBaseUrl:
        getSetting("openai_upstream_base_url")?.value ??
        process.env.OPENAI_UPSTREAM_BASE_URL ??
        "https://api.openai.com",
      anthropicUpstreamBaseUrl:
        getSetting("anthropic_upstream_base_url")?.value ??
        process.env.ANTHROPIC_UPSTREAM_BASE_URL ??
        "https://api.anthropic.com",
      defaultProvider:
        getSetting("default_provider")?.value ??
        process.env.DEFAULT_PROVIDER ??
        "auto",
      currentSession: getCurrentSession(),
    };
  }

  function updateSettings(settings: {
    openaiUpstreamBaseUrl?: string;
    anthropicUpstreamBaseUrl?: string;
    defaultProvider?: string;
  }) {
    if (settings.openaiUpstreamBaseUrl) {
      setSetting.run("openai_upstream_base_url", settings.openaiUpstreamBaseUrl);
    }
    if (settings.anthropicUpstreamBaseUrl) {
      setSetting.run(
        "anthropic_upstream_base_url",
        settings.anthropicUpstreamBaseUrl,
      );
    }
    if (settings.defaultProvider) {
      setSetting.run("default_provider", settings.defaultProvider);
    }

    return getSettings();
  }

  return {
    close: () => db.close(),
    getCurrentSession,
    startSession,
    insertRequest,
    updateRequestUsage,
    getSummary,
    listRequests,
    getRequest,
    clearRequests,
    getSettings,
    updateSettings,
  };
}

export type WimtStore = ReturnType<typeof createStore>;

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DateRange } from "./date-range";
import {
  PURGE_CHECK_INTERVAL_MS,
  retentionCutoffIso,
  retentionDaysFromEnv,
} from "./retention";

export type RequestInsert = {
  sessionId: string;
  cliSessionId?: string | null;
  /** Override for tests / import; defaults to now. */
  createdAt?: string;
  providerSchema: string;
  upstreamBaseUrl: string;
  requestPath: string;
  method: string;
  model: string | null;
  statusCode: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCacheTokens: number;
  totalTokens: number;
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
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCacheTokens: number;
  totalTokens: number;
  usageMissing: number | null;
};

type RequestRow = Omit<RequestInsert, "usageMissing" | "cliSessionId"> & {
  id: number;
  createdAt: string;
  usageMissing: number;
  cliSessionId: string | null;
};

type UsagePoint = {
  bucket: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCacheTokens: number;
  totalTokens: number;
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

    CREATE INDEX IF NOT EXISTS requests_created_at_idx ON requests(created_at);
    CREATE INDEX IF NOT EXISTS requests_session_id_idx ON requests(session_id);
  `);

  migrateSchema(db);

  const getSetting = (key: string) =>
    db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;

  const setSetting = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  function maybePurgeExpired(force = false) {
    const days = retentionDaysFromEnv();
    const lastPurge = getSetting("last_purge_at")?.value;
    const lastPurgeMs = lastPurge ? Date.parse(lastPurge) : Number.NaN;
    const due =
      force ||
      !Number.isFinite(lastPurgeMs) ||
      Date.now() - lastPurgeMs >= PURGE_CHECK_INTERVAL_MS;

    if (!due) {
      return { deleted: 0, days, skipped: true as const };
    }

    const cutoff = retentionCutoffIso(days);
    const result = db
      .prepare("DELETE FROM requests WHERE created_at < ?")
      .run(cutoff);
    setSetting.run("last_purge_at", new Date().toISOString());

    // Drop measurement sessions that no longer have any requests (keep current).
    const currentId = getSetting("current_session_id")?.value;
    if (currentId) {
      db.prepare(
        `
        DELETE FROM sessions
        WHERE id != ?
          AND id NOT IN (SELECT DISTINCT session_id FROM requests)
      `,
      ).run(currentId);
    }

    return { deleted: Number(result.changes), days, skipped: false as const };
  }

  // Startup purge so long-running DBs shrink without waiting for traffic.
  maybePurgeExpired(true);

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
    maybePurgeExpired(false);

    const result = db.prepare(`
      INSERT INTO requests (
        session_id, cli_session_id, created_at, provider_schema, upstream_base_url, request_path,
        method, model, status_code, input_tokens, output_tokens, cache_write_tokens,
        cache_read_tokens, total_cache_tokens, total_tokens, usage_missing,
        raw_usage_json, request_json, response_json, error, latency_ms
      )
      VALUES (
        @sessionId, @cliSessionId, @createdAt, @providerSchema, @upstreamBaseUrl, @requestPath,
        @method, @model, @statusCode, @inputTokens, @outputTokens, @cacheWriteTokens,
        @cacheReadTokens, @totalCacheTokens, @totalTokens, @usageMissing,
        @rawUsageJson, @requestJson, @responseJson, @error, @latencyMs
      )
    `).run({
      ...request,
      cliSessionId: request.cliSessionId ?? null,
      createdAt: request.createdAt ?? new Date().toISOString(),
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
      | "error"
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
          latency_ms = @latencyMs,
          error = COALESCE(@error, error)
      WHERE id = @id
    `).run({
      id,
      ...usage,
      error: usage.error ?? null,
      usageMissing: usage.usageMissing ? 1 : 0,
    });
  }

  function getSummary(range?: DateRange) {
    const current = getCurrentSession();

    return {
      totals: totalsFor(range),
      currentSession: {
        ...current,
        ...totalsFor(range, current.id),
      },
      byProvider: groupBy("provider_schema", range),
      byModel: groupBy("model", range),
      upstreamErrors: countUpstreamErrors(range),
    };
  }

  type TotalsRow = {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    totalCacheTokens: number;
    totalTokens: number;
    usageMissing: number;
  };

  function totalsFor(range?: DateRange, sessionId?: string): TotalsRow {
    const filters: string[] = [];
    const params: string[] = [];

    if (sessionId) {
      filters.push("session_id = ?");
      params.push(sessionId);
    }
    if (range) {
      filters.push("created_at >= ?", "created_at < ?");
      params.push(range.from, range.to);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    return db
      .prepare(
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
      )
      .get(...params) as TotalsRow;
  }

  function countUpstreamErrors(range?: DateRange) {
    const filters = ["error IS NOT NULL AND error != ''"];
    const params: string[] = [];

    if (range) {
      filters.push("created_at >= ?", "created_at < ?");
      params.push(range.from, range.to);
    }

    const row = db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM requests
        WHERE ${filters.join(" AND ")}
      `,
      )
      .get(...params) as { count: number };

    return Number(row.count);
  }

  function groupBy(column: "provider_schema" | "model", range?: DateRange) {
    const where = range ? "WHERE created_at >= ? AND created_at < ?" : "";
    const params = range ? [range.from, range.to] : [];

    return db
      .prepare(
        `
        SELECT
          ${column} as key,
          COUNT(*) as requests,
          COALESCE(SUM(input_tokens), 0) as inputTokens,
          COALESCE(SUM(output_tokens), 0) as outputTokens,
          COALESCE(SUM(cache_write_tokens), 0) as cacheWriteTokens,
          COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
          COALESCE(SUM(total_cache_tokens), 0) as totalCacheTokens,
          COALESCE(SUM(total_tokens), 0) as totalTokens,
          COALESCE(SUM(usage_missing), 0) as usageMissing
        FROM requests
        ${where}
        GROUP BY ${column}
        ORDER BY totalTokens DESC
      `,
      )
      .all(...params) as GroupRow[];
  }

  function listRequests(limit = 100, cursor?: number, range?: DateRange) {
    const filters: string[] = [];
    const params: Array<string | number> = [];

    if (cursor !== undefined) {
      filters.push("id < ?");
      params.push(cursor);
    }
    if (range) {
      filters.push("created_at >= ?", "created_at < ?");
      params.push(range.from, range.to);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    params.push(limit);

    return db
      .prepare(
        `
        SELECT
          id, session_id as sessionId, cli_session_id as cliSessionId,
          created_at as createdAt,
          provider_schema as providerSchema, upstream_base_url as upstreamBaseUrl,
          request_path as requestPath, method, model, status_code as statusCode,
          input_tokens as inputTokens, output_tokens as outputTokens,
          cache_write_tokens as cacheWriteTokens, cache_read_tokens as cacheReadTokens,
          total_cache_tokens as totalCacheTokens, total_tokens as totalTokens,
          usage_missing as usageMissing, error, latency_ms as latencyMs
        FROM requests
        ${where}
        ORDER BY id DESC
        LIMIT ?
      `,
      )
      .all(...params) as RequestRow[];
  }

  function getRequest(id: number) {
    return db
      .prepare(
        `
        SELECT
          id, session_id as sessionId, cli_session_id as cliSessionId,
          created_at as createdAt,
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
      .get(id) as RequestRow | undefined;
  }

  function getUsagePoints(range?: DateRange) {
    // Hourly buckets keep the trend chart readable (minute points get too dense).
    const bucket = range
      ? "strftime('%Y-%m-%dT%H:00:00.000Z', created_at)"
      : "strftime('%Y-%m-%dT%H:00:00.000', created_at, 'localtime')";
    const where = range
      ? "WHERE created_at >= ? AND created_at < ?"
      : "WHERE date(created_at, 'localtime') = date('now', 'localtime')";
    const params = range ? [range.from, range.to] : [];

    return db
      .prepare(
        `
        SELECT
          ${bucket} as bucket,
          COALESCE(SUM(input_tokens), 0) as inputTokens,
          COALESCE(SUM(output_tokens), 0) as outputTokens,
          COALESCE(SUM(cache_write_tokens), 0) as cacheWriteTokens,
          COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
          COALESCE(SUM(total_cache_tokens), 0) as totalCacheTokens,
          COALESCE(SUM(total_tokens), 0) as totalTokens
        FROM requests
        ${where}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      )
      .all(...params) as UsagePoint[];
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
      retentionDays: retentionDaysFromEnv(),
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
    getUsagePoints,
    clearRequests,
    getSettings,
    updateSettings,
    purgeExpired: () => maybePurgeExpired(true),
  };
}

export type WimtStore = ReturnType<typeof createStore>;

function migrateSchema(db: InstanceType<typeof Database>) {
  const columns = db
    .prepare("PRAGMA table_info(requests)")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("cli_session_id")) {
    db.exec("ALTER TABLE requests ADD COLUMN cli_session_id TEXT");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS requests_session_id_idx ON requests(session_id);
    CREATE INDEX IF NOT EXISTS requests_cli_session_id_idx ON requests(cli_session_id);
  `);
}

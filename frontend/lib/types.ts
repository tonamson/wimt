export type Totals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCacheTokens: number;
  totalTokens: number;
  usageMissing: number;
};

export type GroupRow = Totals & { key: string | null };

export type Summary = {
  totals: Totals;
  currentSession: Totals & { id: string; createdAt: string };
  byProvider: GroupRow[];
  byModel: GroupRow[];
  /** Upstream/proxy errors in the selected range (not just current page). */
  upstreamErrors: number;
};

export type Settings = {
  openaiUpstreamBaseUrl: string;
  anthropicUpstreamBaseUrl: string;
  defaultProvider: string;
  currentSession: { id: string; createdAt: string };
  /** Auto-purge window for request logs (days). */
  retentionDays?: number;
  /** Public CLI proxy base (Headroom). Null when unset → UI uses page origin. */
  proxyPublicBaseUrl?: string | null;
};

export type RequestRow = {
  id: number;
  sessionId: string;
  /** Claude/Codex conversation id when extracted from the request body. */
  cliSessionId?: string | null;
  createdAt: string;
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
  usageMissing: number;
  rawUsageJson?: string | null;
  requestJson?: string | null;
  responseJson?: string | null;
  error: string | null;
  latencyMs: number | null;
};

export type RequestsPage = {
  items: RequestRow[];
  nextCursor: number | null;
};

export type DateSelection = {
  from: string;
  to: string;
};

export type UsagePoint = Pick<
  RequestRow,
  | "inputTokens"
  | "outputTokens"
  | "cacheWriteTokens"
  | "cacheReadTokens"
  | "totalCacheTokens"
  | "totalTokens"
> & {
  bucket: string;
};

export type ChartKey =
  | "inputTokens"
  | "outputTokens"
  | "cacheWriteTokens"
  | "cacheReadTokens"
  | "totalCacheTokens"
  | "totalTokens";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

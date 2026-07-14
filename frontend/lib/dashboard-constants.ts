import type { ChartKey, GroupRow, Settings, Summary, Totals } from "@/lib/types";

export const requestPageSize = 15;

/**
 * Series colors for multi-metric trend (distinct for legibility).
 * Brand accent remains sky; other hues are data-series only, not UI chrome.
 */
export const chartMetrics: Array<{
  key: ChartKey;
  label: string;
  color: string;
}> = [
  { key: "inputTokens", label: "Input", color: "#0284c7" },
  { key: "outputTokens", label: "Output", color: "#059669" },
  { key: "cacheWriteTokens", label: "Cache write", color: "#d97706" },
  { key: "cacheReadTokens", label: "Cache read", color: "#0e7490" },
  { key: "totalCacheTokens", label: "Total cache", color: "#64748b" },
  { key: "totalTokens", label: "Total", color: "#27272a" },
];

export const darkChartMetricColors: Record<ChartKey, string> = {
  inputTokens: "#38bdf8",
  outputTokens: "#34d399",
  cacheWriteTokens: "#fbbf24",
  cacheReadTokens: "#22d3ee",
  totalCacheTokens: "#94a3b8",
  totalTokens: "#e4e4e7",
};

export const defaultChartVisible = chartMetrics.reduce(
  (state, metric) => ({ ...state, [metric.key]: true }),
  {} as Record<ChartKey, boolean>,
);

export const emptyTotals: Totals = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCacheTokens: 0,
  totalTokens: 0,
  usageMissing: 0,
};

export const emptySummary: Summary = {
  totals: emptyTotals,
  currentSession: { ...emptyTotals, id: "loading", createdAt: "" },
  byProvider: [] as GroupRow[],
  byModel: [] as GroupRow[],
  upstreamErrors: 0,
};

export const defaultSettings: Settings = {
  openaiUpstreamBaseUrl: "https://api.openai.com",
  anthropicUpstreamBaseUrl: "https://api.anthropic.com",
  defaultProvider: "auto",
  currentSession: { id: "loading", createdAt: new Date().toISOString() },
  retentionDays: 14,
};

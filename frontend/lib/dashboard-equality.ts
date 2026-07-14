import type { RequestRow, Summary, UsagePoint } from "@/lib/types";

export function totalsEqual(
  a: Summary["totals"],
  b: Summary["totals"],
): boolean {
  return (
    a.requests === b.requests &&
    a.inputTokens === b.inputTokens &&
    a.outputTokens === b.outputTokens &&
    a.cacheWriteTokens === b.cacheWriteTokens &&
    a.cacheReadTokens === b.cacheReadTokens &&
    a.totalCacheTokens === b.totalCacheTokens &&
    a.totalTokens === b.totalTokens &&
    a.usageMissing === b.usageMissing
  );
}

export function groupEqual(
  a: Summary["byProvider"],
  b: Summary["byProvider"],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every(
    (row, i) =>
      row.key === b[i].key &&
      row.requests === b[i].requests &&
      row.totalTokens === b[i].totalTokens &&
      row.cacheWriteTokens === b[i].cacheWriteTokens &&
      row.cacheReadTokens === b[i].cacheReadTokens &&
      row.totalCacheTokens === b[i].totalCacheTokens &&
      row.usageMissing === b[i].usageMissing,
  );
}

export function summaryEqual(a: Summary, b: Summary): boolean {
  return (
    totalsEqual(a.totals, b.totals) &&
    a.currentSession.id === b.currentSession.id &&
    a.currentSession.totalTokens === b.currentSession.totalTokens &&
    a.upstreamErrors === b.upstreamErrors &&
    groupEqual(a.byProvider, b.byProvider) &&
    groupEqual(a.byModel, b.byModel)
  );
}

export function chartEqual(a: UsagePoint[], b: UsagePoint[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every(
    (row, i) =>
      row.bucket === b[i].bucket &&
      row.inputTokens === b[i].inputTokens &&
      row.outputTokens === b[i].outputTokens &&
      row.cacheWriteTokens === b[i].cacheWriteTokens &&
      row.cacheReadTokens === b[i].cacheReadTokens &&
      row.totalCacheTokens === b[i].totalCacheTokens &&
      row.totalTokens === b[i].totalTokens,
  );
}

export function requestsEqual(a: RequestRow[], b: RequestRow[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every(
    (row, i) =>
      row.id === b[i].id &&
      row.statusCode === b[i].statusCode &&
      row.inputTokens === b[i].inputTokens &&
      row.outputTokens === b[i].outputTokens &&
      row.cacheWriteTokens === b[i].cacheWriteTokens &&
      row.cacheReadTokens === b[i].cacheReadTokens &&
      row.totalCacheTokens === b[i].totalCacheTokens &&
      row.totalTokens === b[i].totalTokens &&
      row.latencyMs === b[i].latencyMs &&
      row.error === b[i].error &&
      row.model === b[i].model &&
      row.usageMissing === b[i].usageMissing &&
      row.cliSessionId === b[i].cliSessionId,
  );
}

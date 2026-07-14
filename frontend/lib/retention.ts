/** Default automatic log retention (request rows older than this are purged). */
export const DEFAULT_RETENTION_DAYS = 14;

/** How often to run purge checks (ms). */
export const PURGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function retentionDaysFromEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.WIMT_RETENTION_DAYS;
  if (raw === undefined || raw === "") {
    return DEFAULT_RETENTION_DAYS;
  }

  const days = Number(raw);
  if (!Number.isFinite(days) || days < 1) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.floor(days);
}

export function retentionCutoffIso(
  days: number,
  now = new Date(),
): string {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

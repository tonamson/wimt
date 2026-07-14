/** Default max chars for request/response body snapshots in SQLite. */
export const DEFAULT_BODY_MAX_CHARS = 8_000;

/**
 * Body logging is on by default (truncated). Set WIMT_LOG_BODIES=0 to store
 * only usage/metadata and skip request/response payloads.
 */
export function shouldLogBodies(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env.WIMT_LOG_BODIES?.trim().toLowerCase();
  if (value === undefined || value === "") {
    return true;
  }
  return value !== "0" && value !== "false" && value !== "off";
}

export function bodyMaxChars(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.WIMT_LOG_BODY_MAX;
  if (raw === undefined || raw === "") {
    return DEFAULT_BODY_MAX_CHARS;
  }

  const max = Number(raw);
  if (!Number.isFinite(max) || max < 0) {
    return DEFAULT_BODY_MAX_CHARS;
  }

  return Math.floor(max);
}

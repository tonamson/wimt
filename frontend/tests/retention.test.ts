import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RETENTION_DAYS,
  retentionCutoffIso,
  retentionDaysFromEnv,
} from "../lib/retention";
import { bodyMaxChars, shouldLogBodies } from "../lib/body-log";

test("retention defaults to 14 days", () => {
  assert.equal(DEFAULT_RETENTION_DAYS, 14);
  assert.equal(retentionDaysFromEnv({}), 14);
  assert.equal(retentionDaysFromEnv({ WIMT_RETENTION_DAYS: "7" }), 7);
  assert.equal(retentionDaysFromEnv({ WIMT_RETENTION_DAYS: "0" }), 14);
  assert.equal(retentionDaysFromEnv({ WIMT_RETENTION_DAYS: "nope" }), 14);
});

test("retention cutoff is half-open style ISO days ago", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  assert.equal(
    retentionCutoffIso(14, now),
    "2026-06-30T12:00:00.000Z",
  );
});

test("body logging defaults on with 8k cap", () => {
  assert.equal(shouldLogBodies({}), true);
  assert.equal(shouldLogBodies({ WIMT_LOG_BODIES: "0" }), false);
  assert.equal(shouldLogBodies({ WIMT_LOG_BODIES: "false" }), false);
  assert.equal(bodyMaxChars({}), 8_000);
  assert.equal(bodyMaxChars({ WIMT_LOG_BODY_MAX: "1000" }), 1000);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readCliSessionId, sanitizeJsonText } from "../lib/proxy";

test("keeps full request json when max length is disabled", () => {
  const content = "x".repeat(60_000);
  const saved = sanitizeJsonText(JSON.stringify({ content }), null);

  assert.equal(JSON.parse(saved ?? "{}").content.length, content.length);
});

test("keeps default truncation for logged responses", () => {
  const saved = sanitizeJsonText("x".repeat(60_000));

  assert.equal(saved?.length, 50_000);
});

test("reads Claude CLI session id from nested request metadata", () => {
  const sessionId = "10c70d8e-0fb0-412f-bd60-34a6faa4dc93";
  const body = JSON.stringify({
    system: [
      {
        type: "text",
        text: JSON.stringify({ device_id: "abc", session_id: sessionId }),
      },
    ],
  });

  assert.equal(readCliSessionId(body), sessionId);
});

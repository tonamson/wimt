import assert from "node:assert/strict";
import test from "node:test";
import {
  dateRangeErrorResponse,
  localDateRange,
  readDateRange,
  toDateInputValue,
} from "../lib/date-range";

test("reads an optional canonical ISO date range", () => {
  assert.equal(readDateRange(new URLSearchParams()), undefined);

  assert.deepEqual(
    readDateRange(
      new URLSearchParams({
        from: "2026-07-12T17:00:00.000Z",
        to: "2026-07-13T17:00:00.000Z",
      }),
    ),
    {
      from: "2026-07-12T17:00:00.000Z",
      to: "2026-07-13T17:00:00.000Z",
    },
  );
});

test("converts local calendar dates to a half-open UTC range", () => {
  assert.equal(toDateInputValue(new Date(2026, 6, 13, 12)), "2026-07-13");

  const range = localDateRange("2026-07-13", "2026-07-13");
  const from = new Date(range.from);
  const to = new Date(range.to);

  assert.deepEqual(
    [from.getFullYear(), from.getMonth(), from.getDate(), from.getHours()],
    [2026, 6, 13, 0],
  );
  assert.deepEqual(
    [to.getFullYear(), to.getMonth(), to.getDate(), to.getHours()],
    [2026, 6, 14, 0],
  );
});

test("rejects invalid ranges and formats a 400 response", async () => {
  const invalid = [
    new URLSearchParams({ from: "2026-07-13T00:00:00.000Z" }),
    new URLSearchParams({ from: "invalid", to: "2026-07-14T00:00:00.000Z" }),
    new URLSearchParams({
      from: "2026-07-14T00:00:00.000Z",
      to: "2026-07-13T00:00:00.000Z",
    }),
  ];

  for (const searchParams of invalid) {
    assert.throws(() => readDateRange(searchParams), RangeError);
  }

  const response = dateRangeErrorResponse(new RangeError("Invalid date range"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid date range" });
});

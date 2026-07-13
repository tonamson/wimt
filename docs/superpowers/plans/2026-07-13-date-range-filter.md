# Dashboard Date Range Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a date range picker below the dashboard header that defaults to the browser's current day and filters every request-backed dashboard view.

**Architecture:** Convert the selected local calendar dates to a half-open UTC ISO range in the client, then send the same `from` and `to` parameters to the summary, chart, and request-list routes. A shared parser validates the route boundary, while the SQLite store applies prepared `created_at >= ? AND created_at < ?` conditions to every relevant query.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5, Tailwind CSS 4, better-sqlite3 12.11.1, Node test runner through `tsx`.

## Global Constraints

- Use two native `input[type="date"]` controls; add no date picker, date utility, UI test, or runtime dependency.
- Default both controls after mount to the current calendar day in the browser's local timezone.
- Treat the selected end date as inclusive in the UI and convert it to the next local midnight as the exclusive API boundary.
- Filter token cards, current-session totals, provider/model breakdowns, anomalies, chart data, and the paginated request log with the same range.
- Keep `from` and `to` optional for direct API callers; accept neither or both, and return HTTP 400 for one-sided, malformed, or non-increasing ranges.
- Preserve the existing no-range behavior of all three API routes.
- Reset request pagination when either selected date changes and keep the existing two-second passive refresh.
- Preserve the committed `DetailModal` and `PayloadBlock` behavior from commit `9f3c336`; do not alter those functions for this feature.
- Keep time-of-day selection, URL/local-storage persistence, presets, a combined dashboard API, and unrelated refactoring out of scope.
- Prefix every shell command with `rtk` as required by the repository instructions.

---

## File Map

- Create `frontend/lib/date-range.ts`: shared date-range type, route parser, local-calendar conversion, and HTTP 400 response helper.
- Create `frontend/tests/date-range.test.ts`: focused tests for local date conversion, parser validation, and route rejection.
- Modify `frontend/lib/store.ts`: add the timestamp index and optional range support to summary, grouping, request-list, and chart queries.
- Modify `frontend/tests/store.test.ts`: prove lower-inclusive/upper-exclusive filtering is consistent across store views.
- Modify `frontend/app/api/summary/route.ts`: parse and pass the optional range to `getSummary`.
- Modify `frontend/app/api/requests/route.ts`: combine the optional range with cursor pagination.
- Modify `frontend/app/api/usage-chart/route.ts`: parse and pass the optional range to chart aggregation.
- Modify `frontend/app/page.tsx`: render the controls, derive browser-local defaults after mount, propagate query parameters, reset pagination, and keep polling current.

---

### Task 1: Shared Date Range Boundary

**Files:**
- Create: `frontend/lib/date-range.ts`
- Create: `frontend/tests/date-range.test.ts`

**Interfaces:**
- Produces: `DateRange = { from: string; to: string }` with canonical UTC ISO strings.
- Produces: `readDateRange(searchParams: URLSearchParams): DateRange | undefined`.
- Produces: `localDateRange(fromDate: string, toDate: string): DateRange`.
- Produces: `toDateInputValue(date: Date): string`.
- Produces: `dateRangeErrorResponse(error: unknown): Response`.

- [ ] **Step 1: Write the failing date-range tests**

Create `frontend/tests/date-range.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run from `frontend/`:

```bash
rtk npx tsx --test tests/date-range.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../lib/date-range`.

- [ ] **Step 3: Implement the minimal shared date-range module**

Create `frontend/lib/date-range.ts` with:

```ts
export type DateRange = {
  from: string;
  to: string;
};

export function readDateRange(searchParams: URLSearchParams): DateRange | undefined {
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (from === null && to === null) {
    return undefined;
  }
  if (!from || !to) {
    throw new RangeError("from and to must be provided together");
  }

  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime >= toTime) {
    throw new RangeError("Invalid date range");
  }

  return {
    from: new Date(fromTime).toISOString(),
    to: new Date(toTime).toISOString(),
  };
}

export function localDateRange(fromDate: string, toDate: string): DateRange {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  to.setDate(to.getDate() + 1);

  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from.getTime() >= to.getTime()
  ) {
    throw new RangeError("Invalid date range");
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

export function toDateInputValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateRangeErrorResponse(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Invalid date range" },
    { status: 400 },
  );
}
```

- [ ] **Step 4: Run the focused test and confirm green**

Run:

```bash
rtk npx tsx --test tests/date-range.test.ts
```

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the boundary helper**

```bash
rtk git add lib/date-range.ts tests/date-range.test.ts
rtk git commit -m "feat(api): parse date ranges"
```

Expected: the commit contains only the two new files.

---

### Task 2: SQLite Range Filtering

**Files:**
- Modify: `frontend/lib/store.ts:1-350`
- Modify: `frontend/tests/store.test.ts`

**Interfaces:**
- Consumes: `DateRange` from `frontend/lib/date-range.ts`.
- Produces: `getSummary(range?: DateRange)`.
- Produces: `listRequests(limit?: number, cursor?: number, range?: DateRange)`.
- Produces: `getUsagePoints(range?: DateRange)`.

- [ ] **Step 1: Write the failing store range test**

Append this test to `frontend/tests/store.test.ts`:

```ts
test("filters every store view with a half-open date range", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-store-"));
  const store = createStore(path.join(dir, "test.sqlite"));

  try {
    store.insertRequest({
      sessionId: store.getCurrentSession().id,
      providerSchema: "openai",
      upstreamBaseUrl: "https://api.openai.com",
      requestPath: "/v1/responses",
      method: "POST",
      model: "gpt-4.1",
      statusCode: 200,
      inputTokens: 100,
      outputTokens: 30,
      cacheWriteTokens: 0,
      cacheReadTokens: 40,
      totalCacheTokens: 40,
      totalTokens: 130,
      usageMissing: false,
      rawUsageJson: "{}",
      requestJson: "{}",
      responseJson: "{}",
      error: null,
      latencyMs: 25,
    });

    const row = store.listRequests(1)[0];
    const createdAt = Date.parse(row.createdAt);
    const included = {
      from: row.createdAt,
      to: new Date(createdAt + 1).toISOString(),
    };
    const excludedAtUpperBoundary = {
      from: new Date(createdAt - 1).toISOString(),
      to: row.createdAt,
    };

    const includedSummary = store.getSummary(included);
    assert.equal(includedSummary.totals.requests, 1);
    assert.equal(includedSummary.currentSession.totalTokens, 130);
    assert.equal(includedSummary.byProvider[0].key, "openai");
    assert.equal(store.listRequests(10, undefined, included).length, 1);
    assert.equal(store.getUsagePoints(included)[0].totalTokens, 130);

    assert.equal(store.getSummary(excludedAtUpperBoundary).totals.requests, 0);
    assert.equal(
      store.listRequests(10, undefined, excludedAtUpperBoundary).length,
      0,
    );
    assert.equal(store.getUsagePoints(excludedAtUpperBoundary).length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the store test and confirm the red state**

Run from `frontend/`:

```bash
rtk npx tsx --test tests/store.test.ts
```

Expected: FAIL because the existing store ignores the range and has no `getUsagePoints` method.

- [ ] **Step 3: Import the range type and create the timestamp index**

Add this import to `frontend/lib/store.ts`:

```ts
import type { DateRange } from "./date-range";
```

Add this statement inside the existing `db.exec` schema block, after the table definitions:

```sql
CREATE INDEX IF NOT EXISTS requests_created_at_idx ON requests(created_at);
```

- [ ] **Step 4: Replace the summary and grouping functions**

Replace `getSummary`, `totalsFor`, and `groupBy` with:

```ts
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
    };
  }

  function totalsFor(range?: DateRange, sessionId?: string) {
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
      .get(...params) as Record<string, number>;
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
```

- [ ] **Step 5: Replace request-list filtering**

Replace `listRequests` with:

```ts
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
          id, session_id as sessionId, created_at as createdAt,
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
```

- [ ] **Step 6: Replace chart aggregation and update the returned store API**

Replace `getDailyUsagePoints` with:

```ts
  function getUsagePoints(range?: DateRange) {
    const bucket = range
      ? "strftime('%Y-%m-%dT%H:%M:00.000Z', created_at)"
      : "strftime('%Y-%m-%dT%H:%M:00.000', created_at, 'localtime')";
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
```

In the object returned by `createStore`, replace `getDailyUsagePoints` with:

```ts
    getUsagePoints,
```

- [ ] **Step 7: Run the focused store test and full test suite**

```bash
rtk npx tsx --test tests/store.test.ts
rtk npm test
```

Expected: the store file has 5 passing tests; the full suite passes with no regression.

- [ ] **Step 8: Commit the store filter**

```bash
rtk git add lib/store.ts tests/store.test.ts
rtk git commit -m "feat(store): filter usage by date range"
```

Expected: the commit excludes `frontend/app/page.tsx` and all docs files.

---

### Task 3: Dashboard Route Parameters

**Files:**
- Modify: `frontend/tests/date-range.test.ts`
- Modify: `frontend/app/api/summary/route.ts`
- Modify: `frontend/app/api/requests/route.ts`
- Modify: `frontend/app/api/usage-chart/route.ts`

**Interfaces:**
- Consumes: `readDateRange` and `dateRangeErrorResponse` from `frontend/lib/date-range.ts`.
- Consumes: the optional store range arguments from Task 2.
- Produces: consistent optional `from` and `to` support on all three GET routes.

- [ ] **Step 1: Add the failing route rejection test**

Add these imports to `frontend/tests/date-range.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
```

Append this test:

```ts
test("dashboard routes reject invalid date ranges", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-routes-"));
  const previousDbPath = process.env.WIMT_DB_PATH;
  process.env.WIMT_DB_PATH = path.join(dir, "test.sqlite");

  try {
    const handlers = [
      (await import("../app/api/summary/route")).GET,
      (await import("../app/api/requests/route")).GET,
      (await import("../app/api/usage-chart/route")).GET,
    ] as Array<(request: Request) => Response>;
    const invalidQueries = [
      "from=2026-07-13T00:00:00.000Z",
      "from=invalid&to=2026-07-14T00:00:00.000Z",
      "from=2026-07-14T00:00:00.000Z&to=2026-07-13T00:00:00.000Z",
    ];

    for (const handler of handlers) {
      for (const query of invalidQueries) {
        const response = handler(new Request(`http://localhost/api/test?${query}`));
        assert.equal(response.status, 400);
        assert.equal(
          typeof ((await response.json()) as { error: string }).error,
          "string",
        );
      }
    }
  } finally {
    if (previousDbPath === undefined) {
      delete process.env.WIMT_DB_PATH;
    } else {
      process.env.WIMT_DB_PATH = previousDbPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the route test and confirm the red state**

```bash
rtk npx tsx --test tests/date-range.test.ts
```

Expected: FAIL because the current route handlers return HTTP 200 and ignore invalid ranges.

- [ ] **Step 3: Wire the summary route**

Replace `frontend/app/api/summary/route.ts` with:

```ts
import { dateRangeErrorResponse, readDateRange } from "@/lib/date-range";
import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    const range = readDateRange(new URL(request.url).searchParams);
    return Response.json(getStore().getSummary(range));
  } catch (error) {
    return dateRangeErrorResponse(error);
  }
}
```

- [ ] **Step 4: Wire the paginated request route**

Replace `frontend/app/api/requests/route.ts` with:

```ts
import { dateRangeErrorResponse, readDateRange } from "@/lib/date-range";
import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const range = readDateRange(url.searchParams);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 15);
    const requestedCursor = Number(url.searchParams.get("cursor"));
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(0, Math.min(requestedLimit, 200))
      : 15;
    const cursor =
      Number.isFinite(requestedCursor) && requestedCursor > 0
        ? requestedCursor
        : undefined;
    const rows = getStore().listRequests(limit + 1, cursor, range);
    const items = rows.slice(0, limit);

    return Response.json({
      items,
      nextCursor:
        rows.length > limit && items.length > 0 ? items.at(-1)!.id : null,
    });
  } catch (error) {
    return dateRangeErrorResponse(error);
  }
}
```

- [ ] **Step 5: Wire the usage-chart route**

Replace `frontend/app/api/usage-chart/route.ts` with:

```ts
import { dateRangeErrorResponse, readDateRange } from "@/lib/date-range";
import { getStore } from "@/lib/runtime-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    const range = readDateRange(new URL(request.url).searchParams);
    return Response.json({
      items: getStore().getUsagePoints(range),
    });
  } catch (error) {
    return dateRangeErrorResponse(error);
  }
}
```

- [ ] **Step 6: Run focused and full tests**

```bash
rtk npx tsx --test tests/date-range.test.ts
rtk npm test
```

Expected: 4 date-range tests pass and the full suite has no failures.

- [ ] **Step 7: Commit the route wiring**

```bash
rtk git add app/api/summary/route.ts app/api/requests/route.ts app/api/usage-chart/route.ts tests/date-range.test.ts
rtk git commit -m "feat(api): filter dashboard routes by date"
```

Expected: the commit contains only the three routes and the route test.

---

### Task 4: Header Date Range Picker and Refresh Flow

**Files:**
- Modify: `frontend/app/page.tsx:3-260,506-611`

**Interfaces:**
- Consumes: `localDateRange` and `toDateInputValue` from Task 1.
- Consumes: `from` and `to` support from Task 3.
- Produces: two controlled date inputs and one query string shared by all dashboard fetches.

- [ ] **Step 1: Capture the manual red state and clean page baseline**

Run from `frontend/`:

```bash
rtk git status --short
rtk npm run dev
```

Expected before implementation:

- `frontend/app/page.tsx` has no working-tree changes
- the dashboard has no `From` or `To` controls
- `/api/summary`, `/api/usage-chart`, and `/api/requests` network calls have no `from` or `to` parameters

Stop the development server with `Ctrl-C` after recording the red state.

- [ ] **Step 2: Add client imports, state, and the range-aware refresh callback**

Update the imports at the top of `frontend/app/page.tsx` to include:

```ts
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import { localDateRange, toDateInputValue } from "@/lib/date-range";
```

Add this type near the existing page types:

```ts
type DateSelection = {
  from: string;
  to: string;
};
```

Inside `Home`, add the date state and derive the stable query string:

```ts
  const [dateSelection, setDateSelection] = useState<DateSelection>({
    from: "",
    to: "",
  });
```

After the existing state declarations, add:

```ts
  const currentCursor = cursorStack.at(-1);
  const selectedRange =
    dateSelection.from && dateSelection.to
      ? localDateRange(dateSelection.from, dateSelection.to)
      : undefined;
  const dateRangeQuery = selectedRange
    ? new URLSearchParams({
        from: selectedRange.from,
        to: selectedRange.to,
      }).toString()
    : "";

  const loadSettings = useCallback(async () => {
    const settingsResponse = await fetch("/api/settings", { cache: "no-store" });
    setSettings(await settingsResponse.json());
  }, []);

  const refresh = useCallback(
    async (cursor?: number) => {
      if (!dateRangeQuery) {
        return;
      }

      const requestsQuery = new URLSearchParams(dateRangeQuery);
      requestsQuery.set("limit", String(requestPageSize));
      if (cursor !== undefined) {
        requestsQuery.set("cursor", String(cursor));
      }

      const [summaryResponse, chartResponse, requestsResponse] =
        await Promise.all([
          fetch(`/api/summary?${dateRangeQuery}`, { cache: "no-store" }),
          fetch(`/api/usage-chart?${dateRangeQuery}`, { cache: "no-store" }),
          fetch(`/api/requests?${requestsQuery}`, { cache: "no-store" }),
        ]);
      const [nextSummary, chartPage, requestsPage] = await Promise.all([
        summaryResponse.json() as Promise<Summary>,
        chartResponse.json() as Promise<{ items: UsagePoint[] }>,
        requestsResponse.json() as Promise<RequestsPage>,
      ]);

      setSummary(nextSummary);
      setChartRows(chartPage.items);
      setRequests(requestsPage.items);
      setNextCursor(requestsPage.nextCursor);
    },
    [dateRangeQuery],
  );
```

- [ ] **Step 3: Replace the mount/polling effects and remove obsolete loaders**

Replace the current single `useEffect` with:

```ts
  useEffect(() => {
    const today = toDateInputValue(new Date());
    setDateSelection({ from: today, to: today });
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!dateRangeQuery) {
      return;
    }

    void refresh(currentCursor);
    const interval = window.setInterval(
      () => void refresh(currentCursor),
      2_000,
    );

    return () => window.clearInterval(interval);
  }, [currentCursor, dateRangeQuery, refresh]);
```

Delete the old `async function refresh`, `async function loadRequests`, and
`async function loadSettings` declarations. The callbacks in Step 2 replace all
three.

- [ ] **Step 4: Reset pagination on range changes and make pagination effect-driven**

Add this function inside `Home`:

```ts
  function updateDateSelection(key: keyof DateSelection, value: string) {
    if (!value) {
      return;
    }

    setCursorStack([]);
    setDateSelection((current) => ({ ...current, [key]: value }));
  }
```

Update `clearLogs`, `nextPage`, and `previousPage` to:

```ts
  async function clearLogs() {
    if (!confirm("Clear all request logs?")) {
      return;
    }

    await fetch("/api/clear", { method: "POST" });
    setCursorStack([]);
    await refresh();
  }

  function nextPage() {
    if (nextCursor === null) {
      return;
    }

    setCursorStack((stack) => [...stack, nextCursor]);
  }

  function previousPage() {
    setCursorStack((stack) => stack.slice(0, -1));
  }
```

The polling effect will load the selected cursor after either pagination state
change. Calling `refresh()` after clearing explicitly loads page one.

- [ ] **Step 5: Render the native date inputs directly below the header**

Change the Refresh button handler to:

```tsx
onClick={() => void refresh(currentCursor)}
```

Insert this section immediately after `</header>` and before the metric cards:

```tsx
        <section
          aria-label="Date range"
          className="flex flex-wrap items-end gap-3 border-b border-white/10 py-3"
        >
          <label className="grid gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
            From
            <input
              type="date"
              required
              value={dateSelection.from}
              max={dateSelection.to || undefined}
              onChange={(event) =>
                updateDateSelection("from", event.target.value)
              }
              className="rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-zinc-200 outline-none [color-scheme:dark] focus:border-sky-400/60"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
            To
            <input
              type="date"
              required
              value={dateSelection.to}
              min={dateSelection.from || undefined}
              onChange={(event) =>
                updateDateSelection("to", event.target.value)
              }
              className="rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-zinc-200 outline-none [color-scheme:dark] focus:border-sky-400/60"
            />
          </label>
        </section>
```

- [ ] **Step 6: Make chart empty-state copy range-neutral**

In `RequestChart`, change:

```ts
text: "No request data today",
```

to:

```ts
text: "No request data in selected range",
```

Change the center chart footer label from:

```tsx
<span>today</span>
```

to:

```tsx
<span>selected range</span>
```

- [ ] **Step 7: Run tests and production build**

```bash
rtk npm test
rtk npm run build
```

Expected: the complete test suite passes and the Next.js production build exits 0.

- [ ] **Step 8: Verify the UI and API flow manually**

```bash
rtk npm run dev
```

Open `http://localhost:4393` and verify:

- both fields show today's browser-local date after mount
- choosing another valid range resets the request table to page one
- summary, chart, and request calls all contain the same encoded `from` and `to`
- the end date's records remain included
- polling continues every two seconds with the selected range
- the layout remains usable at mobile and desktop widths

Stop the server with `Ctrl-C`.

- [ ] **Step 9: Confirm modal preservation and commit the UI feature**

Confirm the feature diff does not touch `DetailModal` or `PayloadBlock`:

```bash
rtk git diff -- app/page.tsx
```

Expected: changed hunks are limited to date-range state/fetch/UI/chart copy,
all before `DetailModal` and `PayloadBlock`.

Stage and verify the page:

```bash
rtk git add app/page.tsx
rtk git diff --cached -- app/page.tsx
```

Expected: no staged changes inside `DetailModal` or `PayloadBlock` and no staged
hunks that reverse the payload-scroll layout from commit `9f3c336`.

Commit the staged feature hunks:

```bash
rtk git commit -m "feat(ui): add dashboard date range picker"
```

Finally verify the working tree is clean:

```bash
rtk git status --short
```

Expected: no remaining `frontend/app/page.tsx` changes.

---

## Final Verification

From `frontend/` run fresh verification after all four commits:

```bash
rtk npm test
rtk npm run build
rtk git status --short
```

Expected:

- all Node tests pass
- the Next.js production build exits 0
- the working tree is clean
- `git log -4 --oneline` shows the parser, store, route, and UI commits in order

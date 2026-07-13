import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  dateRangeErrorResponse,
  localDateRange,
  readDateRange,
  toDateInputValue,
} from "../lib/date-range";
import { getStore } from "../lib/runtime-store";

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

test("advances to the next local midnight across a DST transition", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/New_York";

  try {
    const range = localDateRange("2026-03-08", "2026-03-08");
    assert.equal(Date.parse(range.to) - Date.parse(range.from), 23 * 60 * 60 * 1000);
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimezone;
    }
  }
});

test("clear logs refreshes through the latest committed range callback", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const clearLogs = source.match(/async function clearLogs\(\) \{[\s\S]*?\n  \}/)?.[0];

  assert.ok(clearLogs);
  assert.ok(
    source.includes("const latestRefresh = useRef(refresh);"),
    "latest refresh ref is missing",
  );
  assert.ok(
    source.includes(
      "useLayoutEffect(() => {\n    latestRefresh.current = refresh;\n  }, [refresh]);",
    ),
    "latest refresh ref is not updated after each committed range",
  );
  assert.ok(
    clearLogs.includes("await latestRefresh.current();"),
    "clear logs still calls a captured refresh callback",
  );
});

test("rejects invalid ranges and formats a 400 response", async () => {
  const invalid = [
    new URLSearchParams({ from: "2026-07-13T00:00:00.000Z" }),
    new URLSearchParams({ from: "invalid", to: "2026-07-14T00:00:00.000Z" }),
    new URLSearchParams({
      from: "2026-02-30T00:00:00.000Z",
      to: "2026-03-03T00:00:00.000Z",
    }),
    new URLSearchParams({
      from: "2026-07-13T00:00:00Z",
      to: "2026-07-14T00:00:00.000Z",
    }),
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

test("rethrows non-range errors unchanged", () => {
  const error = new Error("Database unavailable");
  assert.throws(() => dateRangeErrorResponse(error), (thrown) => thrown === error);
});

test("dashboard routes reject invalid date ranges", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-routes-"));
  const dbPath = path.join(dir, "test.sqlite");
  const previousDbPath = process.env.WIMT_DB_PATH;
  process.env.WIMT_DB_PATH = dbPath;

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

    assert.equal(existsSync(dbPath), false);
  } finally {
    if (previousDbPath === undefined) {
      delete process.env.WIMT_DB_PATH;
    } else {
      process.env.WIMT_DB_PATH = previousDbPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dashboard routes support paired and no-range calls", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-routes-"));
  const previousDbPath = process.env.WIMT_DB_PATH;
  process.env.WIMT_DB_PATH = path.join(dir, "test.sqlite");
  let store: ReturnType<typeof getStore> | undefined;

  try {
    const routes = [
      {
        name: "summary",
        handler: (await import("../app/api/summary/route")).GET,
      },
      {
        name: "requests",
        handler: (await import("../app/api/requests/route")).GET,
      },
      {
        name: "usage-chart",
        handler: (await import("../app/api/usage-chart/route")).GET,
      },
    ] as const;
    store = getStore();
    store.insertRequest({
      sessionId: store.getCurrentSession().id,
      providerSchema: "openai",
      upstreamBaseUrl: "https://api.openai.com",
      requestPath: "/v1/responses",
      method: "POST",
      model: "gpt-4.1",
      statusCode: 200,
      inputTokens: 10,
      outputTokens: 5,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCacheTokens: 0,
      totalTokens: 15,
      usageMissing: false,
      rawUsageJson: "{}",
      requestJson: "{}",
      responseJson: "{}",
      error: null,
      latencyMs: 1,
    });

    const now = Date.now();
    const pairedQuery = new URLSearchParams({
      from: new Date(now - 60_000).toISOString(),
      to: new Date(now + 60_000).toISOString(),
    }).toString();

    for (const route of routes) {
      for (const query of ["", `?${pairedQuery}`]) {
        const response = route.handler(
          new Request(`http://localhost/api/${route.name}${query}`),
        );
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
          totals?: { requests: number };
          items?: unknown[];
        };
        assert.equal(
          route.name === "summary" ? body.totals?.requests : body.items?.length,
          1,
        );
      }
    }
  } finally {
    store?.close();
    delete (globalThis as { __wimtStore?: unknown }).__wimtStore;
    if (previousDbPath === undefined) {
      delete process.env.WIMT_DB_PATH;
    } else {
      process.env.WIMT_DB_PATH = previousDbPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dashboard routes propagate internal RangeErrors unchanged", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wimt-routes-"));
  const previousDbPath = process.env.WIMT_DB_PATH;
  process.env.WIMT_DB_PATH = path.join(dir, "test.sqlite");
  let store: ReturnType<typeof getStore> | undefined;

  try {
    const routes = [
      {
        name: "summary",
        method: "getSummary",
        handler: (await import("../app/api/summary/route")).GET,
      },
      {
        name: "requests",
        method: "listRequests",
        handler: (await import("../app/api/requests/route")).GET,
      },
      {
        name: "usage-chart",
        method: "getUsagePoints",
        handler: (await import("../app/api/usage-chart/route")).GET,
      },
    ] as const;
    store = getStore();

    for (const route of routes) {
      const internalError = new RangeError(`${route.name} internal failure`);
      const original = Reflect.get(store, route.method);
      Reflect.set(store, route.method, () => {
        throw internalError;
      });

      try {
        assert.throws(
          () =>
            route.handler(
              new Request(
                `http://localhost/api/${route.name}?from=2026-07-13T00:00:00.000Z&to=2026-07-14T00:00:00.000Z`,
              ),
            ),
          (thrown) => thrown === internalError,
        );
      } finally {
        Reflect.set(store, route.method, original);
      }
    }
  } finally {
    store?.close();
    delete (globalThis as { __wimtStore?: unknown }).__wimtStore;
    if (previousDbPath === undefined) {
      delete process.env.WIMT_DB_PATH;
    } else {
      process.env.WIMT_DB_PATH = previousDbPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  chartEqual,
  requestsEqual,
  summaryEqual,
} from "@/lib/dashboard-equality";
import {
  defaultSettings,
  emptySummary,
  requestPageSize,
} from "@/lib/dashboard-constants";
import { localDateRange, toDateInputValue } from "@/lib/date-range";
import type {
  DateSelection,
  RequestRow,
  RequestsPage,
  Settings,
  Summary,
  UsagePoint,
} from "@/lib/types";

const POLL_MS = 2_000;

export function useDashboardData() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [chartRows, setChartRows] = useState<UsagePoint[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [cursorStack, setCursorStack] = useState<number[]>([]);
  const [proxyBaseUrl, setProxyBaseUrl] = useState("http://127.0.0.1:8787");
  const [dateSelection, setDateSelection] = useState<DateSelection>({
    from: "",
    to: "",
  });
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [isSoftRefreshing, setIsSoftRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const refreshSequence = useRef(0);
  const requestPending = useRef(false);
  const hasHydratedData = useRef(false);

  const currentCursor = cursorStack.at(-1);
  const hasValidDateRange =
    dateSelection.from !== "" &&
    dateSelection.to !== "" &&
    dateSelection.from <= dateSelection.to;
  const selectedRange = hasValidDateRange
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
    const nextSettings = (await settingsResponse.json()) as Settings;
    setSettings(nextSettings);
    setProxyBaseUrl(
      nextSettings.proxyPublicBaseUrl ||
        (typeof window !== "undefined"
          ? window.location.origin
          : "http://127.0.0.1:8787"),
    );
  }, []);

  const refresh = useCallback(
    async (
      cursor?: number,
      options?: { mode?: "hard" | "soft" | "silent" },
    ) => {
      if (!dateRangeQuery) {
        return;
      }

      const mode = options?.mode ?? "hard";
      const sequence = ++refreshSequence.current;
      requestPending.current = true;

      if (mode === "hard") {
        setRequestsLoading(true);
      } else if (mode === "soft") {
        setIsSoftRefreshing(true);
      }

      const requestsQuery = new URLSearchParams(dateRangeQuery);
      requestsQuery.set("limit", String(requestPageSize));
      if (cursor !== undefined) {
        requestsQuery.set("cursor", String(cursor));
      }

      try {
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

        if (sequence !== refreshSequence.current) {
          return;
        }

        setSummary((prev) =>
          summaryEqual(prev, nextSummary) ? prev : nextSummary,
        );
        setChartRows((prev) =>
          chartEqual(prev, chartPage.items) ? prev : chartPage.items,
        );
        setRequests((prev) =>
          requestsEqual(prev, requestsPage.items) ? prev : requestsPage.items,
        );
        setNextCursor((prev) =>
          prev === requestsPage.nextCursor ? prev : requestsPage.nextCursor,
        );
        hasHydratedData.current = true;
      } finally {
        if (sequence === refreshSequence.current) {
          requestPending.current = false;
          setRequestsLoading(false);
          setIsSoftRefreshing(false);
        }
      }
    },
    [dateRangeQuery],
  );

  const latestRefresh = useRef(refresh);
  useLayoutEffect(() => {
    latestRefresh.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const today = toDateInputValue(new Date());
    // Browser-local today must be initialized after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDateSelection({ from: today, to: today });
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!dateRangeQuery) {
      return;
    }

    const mode = hasHydratedData.current ? "silent" : "hard";
    void refresh(currentCursor, { mode });

    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      if (!requestPending.current) {
        void refresh(currentCursor, { mode: "silent" });
      }
    }, POLL_MS);

    return () => {
      window.clearInterval(interval);
      refreshSequence.current += 1;
    };
  }, [currentCursor, dateRangeQuery, refresh]);

  async function openDetail(row: RequestRow) {
    const response = await fetch(`/api/requests/${row.id}`, {
      cache: "no-store",
    });
    setSelected(await response.json());
  }

  async function saveSettings() {
    setSavingSettings(true);
    setSettingsStatus("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Settings save failed");
      }
      setSettings(await response.json());
      setSettingsStatus("Saved");
    } catch (error) {
      setSettingsStatus(
        error instanceof Error ? error.message : "Settings save failed",
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function clearLogs() {
    await fetch("/api/clear", { method: "POST" });
    setCursorStack([]);
    setConfirmClear(false);
    hasHydratedData.current = false;
    await latestRefresh.current(undefined, { mode: "hard" });
  }

  function nextPage() {
    if (nextCursor === null || requestPending.current) {
      return;
    }

    refreshSequence.current += 1;
    requestPending.current = true;
    setCursorStack((stack) => [...stack, nextCursor]);
  }

  function previousPage() {
    if (cursorStack.length === 0 || requestPending.current) {
      return;
    }

    refreshSequence.current += 1;
    requestPending.current = true;
    setCursorStack((stack) => stack.slice(0, -1));
  }

  function updateDateSelection(key: keyof DateSelection, value: string) {
    if (!value) {
      return;
    }

    const nextSelection = { ...dateSelection, [key]: value };
    if (
      nextSelection.from &&
      nextSelection.to &&
      nextSelection.from > nextSelection.to
    ) {
      return;
    }

    refreshSequence.current += 1;
    requestPending.current = true;
    setRequestsLoading(true);
    hasHydratedData.current = false;
    setCursorStack([]);
    setRequests([]);
    setChartRows([]);
    setNextCursor(null);
    setDateSelection(nextSelection);
  }

  return {
    summary,
    settings,
    setSettings,
    requests,
    chartRows,
    nextCursor,
    cursorStack,
    proxyBaseUrl,
    dateSelection,
    requestsLoading,
    isSoftRefreshing,
    savingSettings,
    settingsStatus,
    selected,
    setSelected,
    confirmClear,
    setConfirmClear,
    currentCursor,
    refresh,
    openDetail,
    saveSettings,
    clearLogs,
    nextPage,
    previousPage,
    updateDateSelection,
  };
}

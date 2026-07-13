"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApexOptions } from "apexcharts";
import { localDateRange, toDateInputValue } from "@/lib/date-range";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Totals = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCacheTokens: number;
  totalTokens: number;
  usageMissing: number;
};

type GroupRow = Totals & { key: string | null };

type Summary = {
  totals: Totals;
  currentSession: Totals & { id: string; createdAt: string };
  byProvider: GroupRow[];
  byModel: GroupRow[];
};

type Settings = {
  openaiUpstreamBaseUrl: string;
  anthropicUpstreamBaseUrl: string;
  defaultProvider: string;
  currentSession: { id: string; createdAt: string };
};

type RequestRow = {
  id: number;
  sessionId: string;
  createdAt: string;
  providerSchema: string;
  upstreamBaseUrl: string;
  requestPath: string;
  method: string;
  model: string | null;
  statusCode: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCacheTokens: number;
  totalTokens: number;
  usageMissing: number;
  rawUsageJson?: string | null;
  requestJson?: string | null;
  responseJson?: string | null;
  error: string | null;
  latencyMs: number | null;
};

type RequestsPage = {
  items: RequestRow[];
  nextCursor: number | null;
};

type DateSelection = {
  from: string;
  to: string;
};

type UsagePoint = Pick<
  RequestRow,
  | "inputTokens"
  | "outputTokens"
  | "cacheWriteTokens"
  | "cacheReadTokens"
  | "totalCacheTokens"
  | "totalTokens"
> & {
  bucket: string;
};

type ChartKey =
  | "inputTokens"
  | "outputTokens"
  | "cacheWriteTokens"
  | "cacheReadTokens"
  | "totalCacheTokens"
  | "totalTokens";

const requestPageSize = 15;

const chartMetrics: Array<{ key: ChartKey; label: string; color: string }> = [
  { key: "inputTokens", label: "Input", color: "#7dd3fc" },
  { key: "outputTokens", label: "Output", color: "#6ee7b7" },
  { key: "cacheWriteTokens", label: "Cache write", color: "#fcd34d" },
  { key: "cacheReadTokens", label: "Cache read", color: "#67e8f9" },
  { key: "totalCacheTokens", label: "Total cache", color: "#c4b5fd" },
  { key: "totalTokens", label: "Total", color: "#f8fafc" },
];

const defaultChartVisible = chartMetrics.reduce(
  (state, metric) => ({ ...state, [metric.key]: true }),
  {} as Record<ChartKey, boolean>,
);

const emptyTotals: Totals = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCacheTokens: 0,
  totalTokens: 0,
  usageMissing: 0,
};

const defaultSettings: Settings = {
  openaiUpstreamBaseUrl: "https://api.openai.com",
  anthropicUpstreamBaseUrl: "https://api.anthropic.com",
  defaultProvider: "auto",
  currentSession: { id: "loading", createdAt: new Date().toISOString() },
};

export default function Home() {
  const [summary, setSummary] = useState<Summary>({
    totals: emptyTotals,
    currentSession: { ...emptyTotals, id: "loading", createdAt: "" },
    byProvider: [],
    byModel: [],
  });
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [chartRows, setChartRows] = useState<UsagePoint[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [cursorStack, setCursorStack] = useState<number[]>([]);
  const [chartVisible, setChartVisible] = useState(defaultChartVisible);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [baseUrl] = useState("http://localhost:4393");
  const [dateSelection, setDateSelection] = useState<DateSelection>({
    from: "",
    to: "",
  });
  const [requestsLoading, setRequestsLoading] = useState(false);
  const refreshSequence = useRef(0);
  const requestPending = useRef(false);

  const currentCursor = cursorStack.at(-1);
  const hasValidDateRange =
    dateSelection.from !== "" &&
    dateSelection.to !== "" &&
    dateSelection.from <= dateSelection.to;
  const selectedRange =
    hasValidDateRange
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

      const sequence = ++refreshSequence.current;
      requestPending.current = true;
      setRequestsLoading(true);
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

        setSummary(nextSummary);
        setChartRows(chartPage.items);
        setRequests(requestsPage.items);
        setNextCursor(requestsPage.nextCursor);
      } finally {
        if (sequence === refreshSequence.current) {
          requestPending.current = false;
          setRequestsLoading(false);
        }
      }
    },
    [dateRangeQuery],
  );

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

    return () => {
      window.clearInterval(interval);
      refreshSequence.current += 1;
    };
  }, [currentCursor, dateRangeQuery, refresh]);

  const metrics = [
    ["Input", summary.totals.inputTokens, "text-sky-300"],
    ["Output", summary.totals.outputTokens, "text-emerald-300"],
    ["Cache write", summary.totals.cacheWriteTokens, "text-amber-300"],
    ["Cache read", summary.totals.cacheReadTokens, "text-cyan-300"],
    ["Total cache", summary.totals.totalCacheTokens, "text-violet-300"],
    ["Total tokens", summary.totals.totalTokens, "text-white"],
  ];

  async function openDetail(row: RequestRow) {
    const response = await fetch(`/api/requests/${row.id}`, { cache: "no-store" });
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
        throw new Error("Settings save failed");
      }
      setSettings(await response.json());
      setSettingsStatus("Saved");
    } catch (error) {
      setSettingsStatus(error instanceof Error ? error.message : "Settings save failed");
    } finally {
      setSavingSettings(false);
    }
  }

  async function clearLogs() {
    if (!confirm("Clear all request logs?")) {
      return;
    }

    await fetch("/api/clear", { method: "POST" });
    setCursorStack([]);
    await refresh();
  }

  function nextPage() {
    if (nextCursor === null || requestPending.current) {
      return;
    }

    refreshSequence.current += 1;
    requestPending.current = true;
    setRequestsLoading(true);
    setCursorStack((stack) => [...stack, nextCursor]);
  }

  function previousPage() {
    if (cursorStack.length === 0 || requestPending.current) {
      return;
    }

    refreshSequence.current += 1;
    requestPending.current = true;
    setRequestsLoading(true);
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
    setCursorStack([]);
    setRequests([]);
    setNextCursor(null);
    setDateSelection(nextSelection);
  }

  return (
    <main className="min-h-dvh bg-[#090b10] text-zinc-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1480px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300">
              Where is my tokens?
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
              Token audit dashboard
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              className="rounded-md border border-white/10 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:translate-y-px"
              onClick={() => void refresh(currentCursor)}
            >
              Refresh
            </button>
            <button
              className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/20 active:translate-y-px"
              onClick={clearLogs}
            >
              Clear logs
            </button>
          </div>
        </header>

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

        <section className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-6">
          {metrics.map(([label, value, tone]) => (
            <div
              key={label}
              className="rounded-lg border border-white/10 bg-white/[0.035] p-4"
            >
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                {label}
              </p>
              <p className={`mt-3 font-mono text-2xl font-semibold ${tone}`}>
                {formatNumber(value as number)}
              </p>
            </div>
          ))}
        </section>

        <section className="mb-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.035]">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">
                Proxy endpoints and upstreams
              </h2>
            </div>
            <div className="grid gap-3 p-4">
              <ProxyLine label="OpenAI/Codex base URL" value={`${baseUrl}/v1`} />
              <ProxyLine label="Claude/Anthropic base URL" value={baseUrl} />
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-sky-400/60"
                  value={settings.openaiUpstreamBaseUrl}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      openaiUpstreamBaseUrl: event.target.value,
                    })
                  }
                  aria-label="OpenAI upstream"
                />
                <input
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-sky-400/60"
                  value={settings.anthropicUpstreamBaseUrl}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      anthropicUpstreamBaseUrl: event.target.value,
                    })
                  }
                  aria-label="Anthropic upstream"
                />
                <button
                  className="rounded-md border border-white/10 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:translate-y-px"
                  onClick={saveSettings}
                  disabled={savingSettings}
                >
                  {savingSettings ? "Saving..." : "Save"}
                </button>
              </div>
              {settingsStatus ? (
                <p
                  className={`text-xs font-medium ${
                    settingsStatus === "Saved" ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {settingsStatus}
                </p>
              ) : null}
              <p className="font-mono text-xs text-zinc-500">
                export OPENAI_BASE_URL={baseUrl}/v1 | export ANTHROPIC_BASE_URL=
                {baseUrl}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <BreakdownTable
            title="Provider breakdown"
            rows={summary.byProvider}
            empty="No provider data yet"
          />
          <aside className="rounded-lg border border-white/10 bg-white/[0.035]">
            <div className="border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Usage anomalies</h2>
            </div>
            <div className="divide-y divide-white/10">
              <MetricAlert
                value={summary.totals.usageMissing}
                label="responses missing usage"
                tone="text-amber-200"
              />
              <MetricAlert
                value={requests.filter((row) => row.error).length}
                label="upstream errors logged"
                tone="text-red-200"
              />
              <MetricAlert
                value={summary.byModel.length}
                label="models observed"
                tone="text-sky-200"
              />
            </div>
          </aside>
        </section>

        <section className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-white/[0.035]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Request log</h2>
              <p className="mt-1 font-mono text-xs text-zinc-500">
                {requestPageSize} records/page · cursor page {cursorStack.length + 1}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={previousPage}
                disabled={cursorStack.length === 0 || requestsLoading}
              >
                Previous
              </button>
              <button
                className="rounded-md border border-white/10 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={nextPage}
                disabled={nextCursor === null || requestsLoading}
              >
                Next
              </button>
            </div>
          </div>
          <div className="border-b border-white/10 p-4">
            <RequestChart
              rows={chartRows}
              visible={chartVisible}
              onToggle={(key) =>
                setChartVisible((state) => ({ ...state, [key]: !state[key] }))
              }
            />
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[1260px] text-left text-sm">
              <thead className="sticky top-0 bg-[#10131a] text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  {[
                    "Time",
                    "Session",
                    "Schema",
                    "Model",
                    "Path",
                    "Status",
                    "Input",
                    "Output",
                    "Cache write",
                    "Cache read",
                    "Total cache",
                    "Total",
                    "Latency",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="border-b border-white/10 px-4 py-3 font-medium"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {requests.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-white/[0.04]"
                    onClick={() => openDetail(row)}
                  >
                    {[
                      formatTime(row.createdAt),
                      shortSession(row.sessionId),
                      row.providerSchema,
                      row.model ?? "-",
                      row.requestPath,
                      row.statusCode ?? "-",
                      row.inputTokens,
                      row.outputTokens,
                      row.cacheWriteTokens,
                      row.cacheReadTokens,
                      row.totalCacheTokens,
                      row.totalTokens,
                      row.latencyMs ? `${row.latencyMs}ms` : "-",
                    ].map((cell, index) => (
                      <td
                        key={`${row.id}-${index}`}
                        className={`px-4 py-3 ${
                          index > 4 ? "text-right" : ""
                        } font-mono tabular-nums text-zinc-300`}
                        title={index === 1 ? row.sessionId : undefined}
                      >
                        <span
                          className={
                            index === 5 && cell !== 200
                              ? "text-red-200"
                              : index === 2
                                ? "text-sky-200"
                                : ""
                          }
                        >
                          {typeof cell === "number" ? formatNumber(cell) : cell}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {requests.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-zinc-500" colSpan={13}>
                      No proxy calls yet. Point Codex or Claude CLI at the proxy
                      URL above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selected ? (
        <DetailModal
          selected={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}

function ProxyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <code className="overflow-auto rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-sky-200">
        {value}
      </code>
    </div>
  );
}

function RequestChart({
  rows,
  visible,
  onToggle,
}: {
  rows: UsagePoint[];
  visible: Record<ChartKey, boolean>;
  onToggle: (key: ChartKey) => void;
}) {
  const activeMetrics = chartMetrics.filter((metric) => visible[metric.key]);
  const series = activeMetrics.map((metric) => ({
    name: metric.label,
    data: rows.map((row) => row[metric.key] ?? 0),
  }));
  const options: ApexOptions = {
    chart: {
      id: "wimt-usage-chart",
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      foreColor: "#a1a1aa",
      animations: { enabled: false },
    },
    colors: activeMetrics.map((metric) => metric.color),
    dataLabels: { enabled: false },
    grid: {
      borderColor: "rgba(255,255,255,0.08)",
      strokeDashArray: 3,
    },
    legend: { show: false },
    markers: { size: rows.length <= 30 ? 3 : 0 },
    noData: {
      text: "No request data in selected range",
      style: { color: "#71717a" },
    },
    stroke: {
      curve: "smooth",
      width: 2.5,
    },
    theme: { mode: "dark" },
    tooltip: {
      shared: true,
      theme: "dark",
      x: {
        formatter: (_value, options) =>
          formatTime(rows[options?.dataPointIndex ?? -1]?.bucket ?? ""),
      },
      y: {
        formatter: (value) => formatNumber(value),
      },
    },
    xaxis: {
      categories: rows.map((row) => formatTime(row.bucket)),
      axisBorder: { color: "rgba(255,255,255,0.12)" },
      axisTicks: { color: "rgba(255,255,255,0.12)" },
      labels: {
        rotate: 0,
        style: { colors: "#71717a", fontSize: "11px" },
      },
      tooltip: { enabled: false },
    },
    yaxis: {
      min: 0,
      labels: {
        formatter: (value) => formatCompactNumber(value),
        style: { colors: "#71717a" },
      },
    },
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">Token trend</h3>
        <div className="flex flex-wrap gap-2">
          {chartMetrics.map((metric) => (
            <label
              key={metric.key}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300"
            >
              <input
                type="checkbox"
                className="accent-sky-400"
                checked={visible[metric.key]}
                onChange={() => onToggle(metric.key)}
              />
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: metric.color }}
              />
              {metric.label}
            </label>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
        <ApexChart options={options} series={series} type="line" height={240} />
      </div>
      <div className="flex justify-between font-mono text-xs text-zinc-500">
        <span>{rows[0] ? formatTime(rows[0].bucket) : "-"}</span>
        <span>selected range</span>
        <span>{rows.at(-1) ? formatTime(rows.at(-1)!.bucket) : "-"}</span>
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: GroupRow[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 text-right font-medium">Requests</th>
              <th className="px-4 py-3 text-right font-medium">Tokens</th>
              <th className="px-4 py-3 text-right font-medium">Write</th>
              <th className="px-4 py-3 text-right font-medium">Read</th>
              <th className="px-4 py-3 text-right font-medium">Cache</th>
              <th className="px-4 py-3 text-right font-medium">Missing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.key ?? "unknown"} className="hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-mono text-xs text-sky-200">
                  {row.key ?? "unknown"}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatNumber(row.requests)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatNumber(row.totalTokens)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatNumber(row.cacheWriteTokens)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatNumber(row.cacheReadTokens)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatNumber(row.totalCacheTokens)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-200">
                  {formatNumber(row.usageMissing)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={7}>
                  {empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricAlert({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="p-4">
      <p className={`font-mono text-2xl font-semibold ${tone}`}>
        {formatNumber(value)}
      </p>
      <p className="mt-1 text-sm text-zinc-400">{label}</p>
    </div>
  );
}

function DetailModal({
  selected,
  onClose,
}: {
  selected: RequestRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section className="flex h-[94dvh] w-full max-w-[min(96vw,1600px)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b0f16] shadow-2xl shadow-black/60">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-sky-300">
              request #{selected.id} / {selected.sessionId}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Request / response detail
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-md border border-white/10 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:translate-y-px"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <div className="shrink-0">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Input", selected.inputTokens],
                ["Output", selected.outputTokens],
                ["Cache write", selected.cacheWriteTokens],
                ["Cache read", selected.cacheReadTokens],
                ["Total cache", selected.totalCacheTokens],
                ["Total", selected.totalTokens],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-white/10 bg-white/[0.035] p-3"
                >
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                    {label}
                  </p>
                  <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-white">
                    {typeof value === "number" ? formatNumber(value) : "-"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
            <PayloadBlock
              title="Request sent"
              value={selected.requestJson ?? "request body not captured"}
            />
            <PayloadBlock
              title="Response received"
              value={selected.responseJson ?? selected.error ?? "response not captured"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function PayloadBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className="flex min-h-[260px] min-w-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/30">
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6 text-zinc-300">
        {value}
      </pre>
    </section>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function shortSession(sessionId: string) {
  return sessionId.replace(/^ses_/, "");
}

function formatTime(value: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

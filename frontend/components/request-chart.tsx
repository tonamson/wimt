"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ApexOptions } from "apexcharts";
import { useTheme } from "@/components/theme-provider";
import { Panel } from "@/components/ui/panel";
import {
  chartMetrics,
  darkChartMetricColors,
} from "@/lib/dashboard-constants";
import {
  formatChartBucket,
  formatCompactNumber,
  formatNumber,
} from "@/lib/format";
import type { ChartKey, UsagePoint } from "@/lib/types";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Props = {
  rows: UsagePoint[];
  visible: Record<ChartKey, boolean>;
  onToggle: (key: ChartKey) => void;
};

export function RequestChart({ rows, visible, onToggle }: Props) {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const activeMetrics = chartMetrics.filter((metric) => visible[metric.key]);
  const series = activeMetrics.map((metric) => ({
    name: metric.label,
    data: rows.map((row) => row[metric.key] ?? 0),
  }));

  const colors = activeMetrics.map((metric) =>
    isDark ? darkChartMetricColors[metric.key] : metric.color,
  );

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        id: "wimt-usage-chart",
        type: "line",
        toolbar: { show: false },
        zoom: { enabled: false },
        parentHeightOffset: 0,
        foreColor: isDark ? "#a1a1aa" : "#71717a",
        animations: { enabled: false },
        background: "transparent",
        width: "100%",
      },
      colors,
      dataLabels: { enabled: false },
      grid: {
        borderColor: isDark
          ? "rgba(255,255,255,0.08)"
          : "rgba(24,24,27,0.08)",
        strokeDashArray: 3,
        padding: { left: 4, right: 8 },
      },
      legend: { show: false },
      markers: { size: rows.length <= 30 ? 3 : 0 },
      noData: {
        text: "No request data in selected range",
        style: { color: isDark ? "#71717a" : "#a1a1aa" },
      },
      stroke: {
        curve: "smooth",
        width: 2,
      },
      theme: { mode: isDark ? "dark" : "light" },
      tooltip: {
        shared: true,
        theme: isDark ? "dark" : "light",
        x: {
          formatter: (_value, opts) =>
            formatChartBucket(rows[opts?.dataPointIndex ?? -1]?.bucket ?? ""),
        },
        y: {
          formatter: (value) => formatNumber(value),
        },
      },
      xaxis: {
        categories: rows.map((row) => formatChartBucket(row.bucket)),
        axisBorder: {
          color: isDark ? "rgba(255,255,255,0.12)" : "rgba(24,24,27,0.12)",
        },
        axisTicks: {
          color: isDark ? "rgba(255,255,255,0.12)" : "rgba(24,24,27,0.12)",
        },
        labels: {
          rotate: -45,
          rotateAlways: rows.length > 8,
          hideOverlappingLabels: true,
          maxHeight: 48,
          style: {
            colors: isDark ? "#71717a" : "#a1a1aa",
            fontSize: "10px",
          },
        },
        tooltip: { enabled: false },
      },
      yaxis: {
        min: 0,
        labels: {
          maxWidth: 48,
          formatter: (value) => formatCompactNumber(value),
          style: { colors: isDark ? "#71717a" : "#a1a1aa", fontSize: "10px" },
        },
      },
    }),
    [colors, isDark, rows],
  );

  return (
    <Panel className="min-w-0 overflow-hidden">
      <div className="border-b border-[var(--border)] px-3 py-2.5">
        <h2 className="text-sm font-semibold text-[var(--text)]">Token trend</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chartMetrics.map((metric) => {
            const on = visible[metric.key];
            const color = isDark
              ? darkChartMetricColors[metric.key]
              : metric.color;
            return (
              <button
                key={metric.key}
                type="button"
                onClick={() => onToggle(metric.key)}
                aria-pressed={on}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                  on
                    ? "border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--text)]"
                    : "border-transparent text-[var(--text-subtle)] hover:text-[var(--text-muted)]",
                ].join(" ")}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: on ? color : "var(--text-subtle)",
                  }}
                />
                {metric.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-w-0 p-3 pt-2">
        <div className="min-w-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)]">
          <ApexChart
            options={options}
            series={series}
            type="line"
            height={240}
            width="100%"
          />
        </div>
        <div className="mt-2 flex min-w-0 justify-between gap-2 font-mono text-[10px] text-[var(--text-subtle)]">
          <span className="min-w-0 truncate">
            {rows[0] ? formatChartBucket(rows[0].bucket) : "-"}
          </span>
          <span className="shrink-0">per hour</span>
          <span className="min-w-0 truncate text-right">
            {rows.at(-1) ? formatChartBucket(rows.at(-1)!.bucket) : "-"}
          </span>
        </div>
      </div>
    </Panel>
  );
}

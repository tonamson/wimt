"use client";

import { formatNumber } from "@/lib/format";
import type { Totals } from "@/lib/types";

type Metric = {
  label: string;
  value: number;
  primary?: boolean;
};

type Props = {
  totals: Totals;
};

export function MetricStrip({ totals }: Props) {
  const metrics: Metric[] = [
    { label: "Total tokens", value: totals.totalTokens, primary: true },
    { label: "Input", value: totals.inputTokens },
    { label: "Output", value: totals.outputTokens },
    { label: "Cache write", value: totals.cacheWriteTokens },
    { label: "Cache read", value: totals.cacheReadTokens },
    { label: "Total cache", value: totals.totalCacheTokens },
  ];

  return (
    <section
      aria-label="Token totals"
      className="min-w-0 overflow-x-hidden border-b border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="mx-auto grid w-full min-w-0 max-w-[1600px] grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={[
              "relative min-w-0 px-3 py-2.5 sm:px-4 sm:py-3",
              index > 0 ? "border-l border-[var(--border)]" : "",
              metric.primary ? "bg-[var(--accent-muted)]" : "",
            ].join(" ")}
          >
            {metric.primary ? (
              <span
                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--accent)]"
                aria-hidden
              />
            ) : null}
            <p className="truncate text-[11px] font-medium text-[var(--text-muted)]">
              {metric.label}
            </p>
            <p
              className="mt-1 truncate font-mono text-lg font-semibold tabular-nums tracking-tight text-[var(--text)] sm:text-xl"
              title={formatNumber(metric.value)}
            >
              {formatNumber(metric.value)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

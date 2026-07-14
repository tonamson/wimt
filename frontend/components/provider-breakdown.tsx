"use client";

import { Panel, PanelHeader } from "@/components/ui/panel";
import { formatNumber } from "@/lib/format";
import type { GroupRow } from "@/lib/types";

type Props = {
  rows: GroupRow[];
};

const stats: Array<{
  key:
    | "requests"
    | "totalTokens"
    | "cacheWriteTokens"
    | "cacheReadTokens"
    | "totalCacheTokens"
    | "usageMissing";
  label: string;
  warn?: boolean;
}> = [
  { key: "requests", label: "Requests" },
  { key: "totalTokens", label: "Tokens" },
  { key: "cacheWriteTokens", label: "Write" },
  { key: "cacheReadTokens", label: "Read" },
  { key: "totalCacheTokens", label: "Cache" },
  { key: "usageMissing", label: "Missing", warn: true },
];

export function ProviderBreakdown({ rows }: Props) {
  return (
    <Panel className="min-w-0 overflow-hidden">
      <PanelHeader title="Provider breakdown" />
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
          No provider data yet
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <li key={row.key ?? "unknown"} className="min-w-0 px-3 py-2.5">
              <p
                className="truncate font-mono text-xs font-medium text-[var(--accent)]"
                title={row.key ?? "unknown"}
              >
                {row.key ?? "unknown"}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {stats.map((stat) => (
                  <div
                    key={stat.key}
                    className="min-w-0 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-1.5 py-1"
                  >
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {stat.label}
                    </p>
                    <p
                      className={[
                        "truncate font-mono text-[11px] tabular-nums",
                        stat.warn
                          ? "text-[var(--warning-fg)]"
                          : "text-[var(--text)]",
                      ].join(" ")}
                    >
                      {formatNumber(row[stat.key])}
                    </p>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

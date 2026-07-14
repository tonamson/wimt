"use client";

import { Panel, PanelHeader } from "@/components/ui/panel";
import { formatNumber } from "@/lib/format";

type Props = {
  usageMissing: number;
  upstreamErrors: number;
  modelsObserved: number;
  retentionDays?: number;
};

export function AnomaliesPanel({
  usageMissing,
  upstreamErrors,
  modelsObserved,
  retentionDays = 14,
}: Props) {
  const items = [
    {
      value: usageMissing,
      label: "responses missing usage",
      tone: "text-[var(--warning-fg)]",
    },
    {
      value: upstreamErrors,
      label: "upstream errors in range",
      tone: "text-[var(--danger-fg)]",
    },
    {
      value: modelsObserved,
      label: "models observed",
      tone: "text-[var(--text)]",
    },
    {
      value: retentionDays,
      label: "day auto-purge window",
      tone: "text-[var(--text-muted)]",
    },
  ];

  return (
    <Panel as="aside" className="min-w-0 overflow-hidden">
      <PanelHeader title="Usage anomalies" />
      <div className="divide-y divide-[var(--border)]">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 px-3 py-2.5">
            <p
              className={`truncate font-mono text-xl font-semibold tabular-nums ${item.tone}`}
            >
              {formatNumber(item.value)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.label}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { requestPageSize } from "@/lib/dashboard-constants";
import {
  displaySessionId,
  formatNumber,
  formatTime,
  shortSession,
} from "@/lib/format";
import type { RequestRow } from "@/lib/types";

type Props = {
  requests: RequestRow[];
  /** First paint / hard empty load only — may show skeleton. */
  loading: boolean;
  /** Background or page change; no content flash. */
  refreshing?: boolean;
  pageIndex: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (row: RequestRow) => void;
};

const tokenFields = [
  { key: "inputTokens", label: "In" },
  { key: "outputTokens", label: "Out" },
  { key: "cacheWriteTokens", label: "CW" },
  { key: "cacheReadTokens", label: "CR" },
  { key: "totalCacheTokens", label: "Cache" },
  { key: "totalTokens", label: "Total" },
] as const;

export function RequestTable({
  requests,
  loading,
  refreshing = false,
  pageIndex,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  onSelect,
}: Props) {
  const busy = loading || refreshing;
  const showSkeleton = loading && requests.length === 0;

  return (
    <Panel className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <PanelHeader
        title="Request log"
        description={`${requestPageSize}/page · page ${pageIndex}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {showSkeleton ? (
              <span className="text-[11px] text-[var(--text-muted)]">
                Loading…
              </span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={onPrevious}
              disabled={!canPrevious || busy}
            >
              Previous
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onNext}
              disabled={!canNext || busy}
            >
              Next
            </Button>
          </div>
        }
      />

      <div className="dashboard-scroll min-h-[280px] flex-1 overflow-y-auto overflow-x-hidden">
        {showSkeleton ? (
          <div className="grid gap-2 p-3" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-[var(--radius-control)] bg-[var(--surface-muted)]"
              />
            ))}
          </div>
        ) : null}

        {requests.length === 0 && !loading ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            No proxy calls yet. Point Codex or Claude CLI at the proxy URL in
            the side panel.
          </p>
        ) : null}

        {requests.length > 0 ? (
          <ul className="divide-y divide-[var(--border)]">
            {requests.map((row) => (
              <li key={row.id}>
                <RequestCard row={row} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}

function RequestCard({
  row,
  onSelect,
}: {
  row: RequestRow;
  onSelect: (row: RequestRow) => void;
}) {
  const badStatus = row.statusCode != null && row.statusCode !== 200;

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className={[
        "grid w-full min-w-0 gap-2 px-3 py-2.5 text-left transition-colors",
        "hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--accent-muted)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
      ].join(" ")}
      aria-label={`Open request ${row.id}`}
    >
      {/* Row 1: time · schema · status · latency */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="shrink-0 font-mono tabular-nums text-[var(--text)]">
          {formatTime(row.createdAt)}
        </span>
        <span className="font-mono text-[var(--accent)]">
          {row.providerSchema}
        </span>
        <span
          className={[
            "font-mono tabular-nums",
            badStatus
              ? "font-semibold text-[var(--danger-fg)]"
              : "text-[var(--text-muted)]",
          ].join(" ")}
        >
          {row.statusCode ?? "-"}
        </span>
        <span className="font-mono tabular-nums text-[var(--text-muted)]">
          {row.latencyMs != null ? `${row.latencyMs}ms` : "-"}
        </span>
        {row.error ? (
          <span className="truncate font-medium text-[var(--danger-fg)]">
            error
          </span>
        ) : null}
        <span
          className="ml-auto max-w-full truncate font-mono text-[var(--text-subtle)]"
          title={displaySessionId(row)}
        >
          {shortSession(displaySessionId(row))}
        </span>
      </div>

      {/* Row 2: model + path */}
      <div className="min-w-0">
        <p
          className="truncate font-mono text-xs text-[var(--text)]"
          title={row.model ?? undefined}
        >
          {row.model ?? "-"}
        </p>
        <p
          className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]"
          title={row.requestPath}
        >
          {row.requestPath}
        </p>
      </div>

      {/* Row 3: token grid - full width, no horizontal scroll */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {tokenFields.map((field) => (
          <div
            key={field.key}
            className="min-w-0 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-1.5 py-1"
          >
            <p className="text-[10px] text-[var(--text-muted)]">{field.label}</p>
            <p className="truncate font-mono text-[11px] font-medium tabular-nums text-[var(--text)]">
              {formatNumber(row[field.key])}
            </p>
          </div>
        ))}
      </div>
    </button>
  );
}

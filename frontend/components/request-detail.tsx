"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  displaySessionId,
  formatDateTime,
  formatNumber,
  prettyJson,
  shortSession,
} from "@/lib/format";
import type { RequestRow } from "@/lib/types";

type Props = {
  selected: RequestRow;
  onClose: () => void;
};

export function RequestDetail({ selected, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    // Lightweight focus trap
    function onFocusIn(event: FocusEvent) {
      if (!panelRef.current) {
        return;
      }
      if (!panelRef.current.contains(event.target as Node)) {
        closeRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const sessionLabel = displaySessionId(selected);
  const meta = [
    ["Time", formatDateTime(selected.createdAt)],
    ["Session", shortSession(sessionLabel)],
    ["Measure session", shortSession(selected.sessionId)],
    ["CLI session", selected.cliSessionId ?? "-"],
    ["Schema", selected.providerSchema],
    ["Model", selected.model ?? "-"],
    ["Path", selected.requestPath],
    ["Method", selected.method],
    ["Status", selected.statusCode ?? "-"],
    ["Upstream", selected.upstreamBaseUrl],
    [
      "Latency",
      selected.latencyMs != null ? `${selected.latencyMs}ms` : "-",
    ],
    ["Usage missing", selected.usageMissing ? "yes" : "no"],
    ["Error", selected.error ?? "-"],
  ] as const;

  const tokens = [
    ["Input", selected.inputTokens],
    ["Output", selected.outputTokens],
    ["Cache write", selected.cacheWriteTokens],
    ["Cache read", selected.cacheReadTokens],
    ["Total cache", selected.totalCacheTokens],
    ["Total", selected.totalTokens],
  ] as const;

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-detail-title"
        className="modal-panel-enter flex h-[100dvh] w-full max-w-[min(100vw,1400px)] min-w-0 flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] sm:h-[92dvh] sm:max-w-[min(96vw,1400px)] sm:rounded-[var(--radius-panel)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-3 py-3 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="break-all font-mono text-[11px] text-[var(--text-muted)]">
              request #{selected.id} / {sessionLabel}
            </p>
            <h2
              id="request-detail-title"
              className="mt-0.5 text-base font-semibold text-[var(--text)]"
            >
              Request detail
            </h2>
          </div>
          <Button
            ref={closeRef}
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="shrink-0"
          >
            <X size={14} />
            Close
          </Button>
        </header>

        <div className="dashboard-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {meta.map(([label, value]) => (
              <div
                key={label}
                className="min-w-0 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"
              >
                <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
                <p
                  className={[
                    "mt-1 break-all font-mono text-xs tabular-nums text-[var(--text)]",
                    label === "Error" && selected.error
                      ? "text-[var(--danger-fg)]"
                      : "",
                    label === "Status" &&
                    selected.statusCode != null &&
                    selected.statusCode !== 200
                      ? "text-[var(--danger-fg)]"
                      : "",
                  ].join(" ")}
                  title={
                    label === "Session" || label === "Measure session"
                      ? selected.sessionId
                      : label === "CLI session"
                        ? (selected.cliSessionId ?? undefined)
                        : undefined
                  }
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {tokens.map(([label, value]) => (
              <div
                key={label}
                className="min-w-0 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2"
              >
                <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
                <p
                  className="mt-1 truncate font-mono text-base font-semibold tabular-nums text-[var(--text)]"
                  title={formatNumber(value)}
                >
                  {formatNumber(value)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid min-h-0 gap-4 lg:grid-cols-2">
            <PayloadBlock
              title="Raw usage"
              value={prettyJson(
                selected.rawUsageJson,
                "usage payload not captured",
              )}
            />
            <PayloadBlock
              title="Error"
              value={selected.error ?? "no error"}
            />
            <PayloadBlock
              title="Request"
              value={prettyJson(
                selected.requestJson,
                "request body not captured",
              )}
            />
            <PayloadBlock
              title="Response"
              value={
                selected.responseJson
                  ? prettyJson(selected.responseJson, "response not captured")
                  : (selected.error ?? "response not captured")
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function PayloadBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className="flex min-h-[200px] min-w-0 flex-col overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)]">
      <div className="shrink-0 border-b border-[var(--border)] px-3 py-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      </div>
      <pre className="dashboard-scroll min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-5 text-[var(--text-muted)]">
        {value}
      </pre>
    </section>
  );
}

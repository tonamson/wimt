"use client";

import { ArrowsClockwise, Trash } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DateSelection } from "@/lib/types";

type Props = {
  dateSelection: DateSelection;
  onDateChange: (key: keyof DateSelection, value: string) => void;
  onRefresh: () => void;
  onClear: () => void;
  loading?: boolean;
};

export function TopBar({
  dateSelection,
  onDateChange,
  onRefresh,
  onClear,
  loading = false,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-2 px-3 py-2 sm:px-6 lg:flex-row lg:items-center lg:gap-3 lg:px-8">
        <div className="min-w-0 shrink-0">
          <p className="truncate text-sm font-semibold tracking-tight text-[var(--text)]">
            Where is my tokens?
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            Token audit dashboard
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div
            aria-label="Date range"
            className="flex min-w-0 flex-wrap items-center gap-2"
          >
            <label className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="sr-only sm:not-sr-only">From</span>
              <Input
                type="date"
                required
                mono
                value={dateSelection.from}
                max={dateSelection.to || undefined}
                onChange={(event) => onDateChange("from", event.target.value)}
                className="h-8 w-auto min-w-0 max-w-[10.5rem] px-2"
                aria-label="From date"
              />
            </label>
            <span className="text-[var(--text-subtle)]" aria-hidden>
              -
            </span>
            <label className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="sr-only sm:not-sr-only">To</span>
              <Input
                type="date"
                required
                mono
                value={dateSelection.to}
                min={dateSelection.from || undefined}
                onChange={(event) => onDateChange("to", event.target.value)}
                className="h-8 w-auto min-w-0 max-w-[10.5rem] px-2"
                aria-label="To date"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <Button
              variant="primary"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh"
            >
              <ArrowsClockwise
                size={14}
                className={loading ? "animate-spin" : undefined}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onClear}
              aria-label="Clear logs"
            >
              <Trash size={14} />
              <span className="hidden sm:inline">Clear logs</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

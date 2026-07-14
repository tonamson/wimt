import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
};

export function Input({ mono = false, className = "", ...props }: Props) {
  return (
    <input
      className={[
        "h-9 w-full min-w-0 max-w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text)]",
        "outline-none transition-colors placeholder:text-[var(--text-subtle)]",
        "focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        mono ? "font-mono text-xs tabular-nums" : "",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

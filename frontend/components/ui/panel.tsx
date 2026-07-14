import type { HTMLAttributes, ReactNode } from "react";

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "aside";
  children: ReactNode;
};

export function Panel({
  as: Tag = "div",
  className = "",
  children,
  ...props
}: PanelProps) {
  return (
    <Tag
      className={[
        "min-w-0 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5",
        className,
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 break-all font-mono text-[11px] text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

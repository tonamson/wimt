import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "border-transparent bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 dark:text-zinc-950",
  secondary:
    "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-muted)]",
  ghost:
    "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]",
  danger:
    "border-[var(--danger)]/30 bg-[var(--danger-muted)] text-[var(--danger-fg)] hover:opacity-90",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "secondary",
    size = "md",
    className = "",
    type = "button",
    ...props
  },
  ref,
) {
  const sizeClass =
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";

  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border font-medium",
        "transition-[background-color,opacity,transform,color] duration-100",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        sizeClass,
        variants[variant],
        className,
      ].join(" ")}
      {...props}
    />
  );
});

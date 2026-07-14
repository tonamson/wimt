"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "@/components/theme-provider";
import type { ThemePreference } from "@/lib/types";

const options: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "system", label: "System", icon: Desktop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex h-9 items-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-0.5"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={() => setPreference(value)}
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius-control)-2px)] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              active
                ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            <Icon size={16} weight={active ? "fill" : "regular"} />
          </button>
        );
      })}
    </div>
  );
}

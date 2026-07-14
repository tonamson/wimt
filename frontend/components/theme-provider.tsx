"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ResolvedTheme, ThemePreference } from "@/lib/types";
import {
  THEME_STORAGE_KEY,
  applyThemeClass,
  resolveTheme,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

type ThemeSnapshot = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

let preferenceMemory: ThemePreference = "system";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      emit();
    }
  };

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => emit();

  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onMedia);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onMedia);
  };
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      preferenceMemory = stored;
      return stored;
    }
  } catch {
    // ignore
  }
  return preferenceMemory;
}

/** String snapshot so system media changes re-render even when pref stays "system". */
function getClientSnapshot(): string {
  const preference = readPreference();
  const resolved = resolveTheme(preference);
  return `${preference}:${resolved}`;
}

function getServerSnapshot(): string {
  return "system:light";
}

function parseSnapshot(snapshot: string): ThemeSnapshot {
  const [preference, resolved] = snapshot.split(":") as [
    ThemePreference,
    ResolvedTheme,
  ];
  return { preference, resolved };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const { preference, resolved } = parseSnapshot(snapshot);

  useLayoutEffect(() => {
    applyThemeClass(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    preferenceMemory = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    applyThemeClass(resolveTheme(next));
    emit();
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

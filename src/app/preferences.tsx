import useMediaQuery from "@mui/material/useMediaQuery";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SortField, SortState, ViewMode } from "./types";

export type ThemeMode = "light" | "dark" | "system";

export interface Preferences {
  view: ViewMode;
  sort: SortState;
  theme: ThemeMode;
}

const STORAGE_KEY = "r2dav:preferences";

export const DEFAULT_PREFERENCES: Preferences = {
  view: "auto",
  sort: { field: "name", direction: "asc", foldersFirst: true },
  theme: "system",
};

function isSortField(value: unknown): value is SortField {
  return ["name", "modified", "size", "type"].includes(String(value));
}

function readPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    const view: ViewMode = ["auto", "list", "grid"].includes(String(parsed.view))
      ? (parsed.view as ViewMode)
      : DEFAULT_PREFERENCES.view;
    const theme: ThemeMode = ["light", "dark", "system"].includes(
      String(parsed.theme)
    )
      ? (parsed.theme as ThemeMode)
      : DEFAULT_PREFERENCES.theme;
    const sort = parsed.sort;
    return {
      view,
      theme,
      sort: {
        field: isSortField(sort?.field)
          ? sort!.field
          : DEFAULT_PREFERENCES.sort.field,
        direction:
          sort?.direction === "desc"
            ? "desc"
            : DEFAULT_PREFERENCES.sort.direction,
        foldersFirst:
          typeof sort?.foldersFirst === "boolean"
            ? sort.foldersFirst
            : DEFAULT_PREFERENCES.sort.foldersFirst,
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

interface PreferencesContextValue {
  preferences: Preferences;
  setView: (view: ViewMode) => void;
  setSort: (sort: SortState) => void;
  setTheme: (theme: ThemeMode) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const setView = useCallback((view: ViewMode) => {
    setPreferences((current) => ({ ...current, view }));
  }, []);

  const setSort = useCallback((sort: SortState) => {
    setPreferences((current) => ({ ...current, sort }));
  }, []);

  const setTheme = useCallback((theme: ThemeMode) => {
    setPreferences((current) => ({ ...current, theme }));
  }, []);

  const value = useMemo(
    () => ({ preferences, setView, setSort, setTheme }),
    [preferences, setSort, setTheme, setView]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("PreferencesProvider is missing");
  return value;
}

export function useResolvedTheme(): "light" | "dark" {
  const { preferences } = usePreferences();
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  if (preferences.theme === "system") return prefersDark ? "dark" : "light";
  return preferences.theme;
}

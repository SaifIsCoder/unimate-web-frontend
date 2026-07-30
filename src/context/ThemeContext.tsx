"use client";

import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "theme";

/**
 * localStorage is an external store, so it is read through
 * `useSyncExternalStore` rather than mirrored into state by an effect.
 *
 * The previous implementation set state inside a mount effect, which triggers a
 * cascading render (react-hooks/set-state-in-effect). The obvious alternative —
 * a lazy `useState` initialiser — is wrong here: the server has no
 * localStorage, so it would render "light" while the client rendered the saved
 * theme, producing a hydration mismatch.
 *
 * `useSyncExternalStore` solves exactly this. React uses `getServerSnapshot`
 * for the server and hydration passes, then switches to the live snapshot, so
 * the stored theme is honoured without a mismatch and without an extra render.
 */
const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  // Keeps multiple tabs in step; `storage` only fires in *other* tabs.
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** Must return a primitive — a fresh object each call would loop forever. */
const getSnapshot = (): Theme =>
  (window.localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "light";

const getServerSnapshot = (): Theme => "light";

const writeTheme = (theme: Theme) => {
  window.localStorage.setItem(STORAGE_KEY, theme);
  listeners.forEach((listener) => listener());
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Pure DOM synchronisation — no setState, which is precisely what effects are
  // for.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    writeTheme(theme === "light" ? "dark" : "light");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

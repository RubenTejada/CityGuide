"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "theme";

export type Theme = "dark" | "light";

/**
 * The theme this browser should show: the stored choice, else the system
 * preference. The inline script in the root layout reads exactly the same
 * sources before the first paint.
 */
export function preferredTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage bloqueado: manda la preferencia del sistema.
  }
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Paints the theme and remembers it for the next visit. */
export function applyTheme(theme: Theme, remember = false) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (!remember) return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Sin almacenamiento el tema se aplica igual, solo no se recuerda.
  }
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

/**
 * Whether the page is in dark mode right now, for what CSS cannot repaint on
 * its own — the Google map tiles. The theme lives in `<html class="dark">`,
 * so that class is the source read here and the mutation is what reports a
 * change: the toggle writes the class and every map follows in the same tick.
 * The server snapshot is `false` because the server cannot know the theme;
 * maps only exist in the browser, so nothing is painted from it.
 */
export function useIsDark() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

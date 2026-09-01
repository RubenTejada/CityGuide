"use client";

import { useLayoutEffect } from "react";

const STORAGE_KEY = "theme";

/**
 * The theme this browser should show: the stored choice, else the system
 * preference. The inline script in the root layout reads exactly the same
 * sources before the first paint.
 */
function preferredTheme(): "dark" | "light" {
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

/**
 * Switches the site between light and dark. The choice is remembered per
 * browser; until the visitor picks one the system preference wins.
 *
 * Both icons are always rendered and CSS shows the one that matches
 * `html.dark`: the server cannot know the theme, so deciding here in React
 * would either mismatch on hydration or blink after it.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  useLayoutEffect(() => {
    // En desarrollo, el remontaje de Strict Mode devuelve <html> a los
    // atributos que React maneja y borra la clase que puso el script inline.
    // En producción esto no cambia nada.
    document.documentElement.classList.toggle(
      "dark",
      preferredTheme() === "dark",
    );
  }, []);

  function toggle() {
    const next = preferredTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sin almacenamiento el tema se aplica igual, solo no se recuerda.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar entre modo claro y oscuro"
      title="Cambiar tema"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun-300 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="theme-icon-light h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a6.9 6.9 0 0 0 10.8 10.8Z"
        />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="theme-icon-dark h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden
      >
        <circle cx="12" cy="12" r="4.2" />
        <path
          strokeLinecap="round"
          d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"
        />
      </svg>
    </button>
  );
}

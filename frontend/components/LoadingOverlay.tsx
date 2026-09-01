"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";

/**
 * Translucent black scrim + spinner over the nearest positioned ancestor.
 * Swallows clicks while shown, so the area being refreshed cannot be
 * re-triggered mid-flight. The spinner is sticky so it stays in view on
 * areas taller than the viewport.
 */
export default function LoadingOverlay({
  show,
  label = "Cargando…",
}: {
  show: boolean;
  label?: string;
}) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-20 flex justify-center rounded-xl bg-black/40 backdrop-blur-[1px]"
    >
      <div className="sticky top-[40vh] flex h-fit flex-col items-center gap-2 py-6">
        <span className="h-9 w-9 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        <span className="text-sm font-medium text-white drop-shadow">
          {label}
        </span>
      </div>
    </div>
  );
}

const NavigateContext = createContext<((href: string) => void) | null>(null);

const PendingContext = createContext(false);

/**
 * Runs the navigations of every `PendingLink` below it inside one transition,
 * so the `PendingRegion` under the same provider knows when to cover itself.
 * The links and the region they cover can sit in different subtrees (the nav
 * bar navigates, the page body is what gets replaced).
 */
export function PendingNavProvider({
  children,
  scroll = false,
}: {
  children: ReactNode;
  /** Scroll to the top once the new page arrives (section changes do). */
  scroll?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => router.push(href, { scroll }));
  }

  return (
    <NavigateContext.Provider value={navigate}>
      <PendingContext.Provider value={pending}>
        {children}
      </PendingContext.Provider>
    </NavigateContext.Provider>
  );
}

/** The area the server re-renders: covered while its provider navigates. */
export function PendingRegion({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const pending = useContext(PendingContext);
  return (
    <div className={`relative ${className ?? ""}`} aria-busy={pending}>
      {children}
      <LoadingOverlay show={pending} label={label} />
    </div>
  );
}

/**
 * Provider and region in one, for a self-contained block whose own links
 * (date chips, filters) re-render it — the common case.
 */
export function PendingArea({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <PendingNavProvider>
      <PendingRegion className={className} label={label}>
        {children}
      </PendingRegion>
    </PendingNavProvider>
  );
}

/** Link that keeps its `PendingArea` covered until the new page is ready. */
export function PendingLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useContext(NavigateContext);
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // Let the browser handle new-tab/window clicks.
        if (!navigate || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
          return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </Link>
  );
}

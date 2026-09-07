"use client";

import { useSearchParams } from "next/navigation";

/**
 * Listing state that belongs in the URL — which filters are ticked, list or
 * map, which page — so a narrowed listing can be shared and the Back button
 * walks the filters instead of leaving the site.
 *
 * Written with the native History API rather than `router.replace`: App Router
 * has no shallow routing, so a replace would re-run the server render of the
 * page (three or four Delivery API queries per checkbox click), while
 * `pushState` updates the URL with no round trip and still syncs with
 * `useSearchParams`. The update is given the current params to mutate, so
 * parameters this listing knows nothing about — `?fecha=` on the cartelera —
 * survive a filter click.
 */
export function useUrlQuery(): {
  params: ReturnType<typeof useSearchParams>;
  set: (update: (params: URLSearchParams) => void) => void;
} {
  const params = useSearchParams();
  const set = (update: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    update(next);
    const query = next.toString();
    window.history.pushState(
      null,
      "",
      query ? `?${query}` : window.location.pathname,
    );
  };
  return { params, set };
}

"use client";

import { useCallback, useEffect, useState } from "react";

/** "Ver trailer" button that opens the YouTube trailer in a modal. */
export default function TrailerModal({
  youtubeId,
  movieName,
}: {
  youtubeId: string;
  movieName: string;
}) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:border-amber-500 hover:text-amber-600"
      >
        <span aria-hidden>▶</span> Ver trailer
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Trailer de ${movieName}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between text-white">
              <p className="truncate pr-4 text-sm font-medium">{movieName}</p>
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="rounded-full px-2 py-0.5 text-2xl leading-none hover:bg-white/20"
              >
                ×
              </button>
            </div>
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
                title={`Trailer de ${movieName}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

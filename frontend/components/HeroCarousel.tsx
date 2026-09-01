"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export interface HeroSlide {
  href: string;
  title: string;
  blurb: string;
  photo: string;
}

const INTERVAL_MS = 5000;

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const id = setInterval(
      () => setActive((i) => (i + 1) % slides.length),
      INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [paused, slides.length]);

  if (slides.length === 0) return null;

  return (
    <div
      className="relative aspect-16/9 overflow-hidden rounded-xl bg-neutral-900 shadow-sm sm:aspect-21/9"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.map((slide, i) => (
        <Link
          key={slide.href}
          href={slide.href}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === active ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={i !== active}
          tabIndex={i === active ? 0 : -1}
        >
          <Image
            src={slide.photo}
            alt={slide.title}
            fill
            unoptimized={slide.photo.endsWith(".svg")}
            className="object-cover"
            sizes="(min-width: 1024px) 640px, 100vw"
            priority={i === 0}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 pb-14 text-white">
            <h2 className="text-2xl font-bold sm:text-3xl">{slide.title}</h2>
            {slide.blurb && (
              <p className="mt-1 max-w-xl text-sm text-neutral-200 sm:text-base">
                {slide.blurb}
              </p>
            )}
          </div>
        </Link>
      ))}

      {slides.length > 1 && (
        <div className="absolute bottom-4 left-6 flex gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.href}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ir a ${slide.title}`}
              aria-current={i === active}
              className={`h-7 w-7 rounded text-xs font-semibold transition ${
                i === active
                  ? "bg-sun-400 text-neutral-900"
                  : "bg-white/20 text-white hover:bg-white/40"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

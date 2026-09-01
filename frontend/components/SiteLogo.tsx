import { CityEmblem } from "./CityBadge";

/**
 * Logo de QueHacerRD.com — recreación SVG del logo (arco solar, iglesia
 * colonial, palma y olas + wordmark). Pensado para fondos oscuros.
 */
export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Arco solar */}
      <path d="M14 62 A 46 46 0 0 1 106 62" stroke="#f5b301" strokeWidth="7" />
      {/* Aves */}
      <path d="M78 34 q3 -4 6 0 q3 -4 6 0" stroke="#fff" strokeWidth="2" />
      <path d="M90 44 q2.5 -3 5 0 q2.5 -3 5 0" stroke="#fff" strokeWidth="2" />
      {/* Torre de la iglesia: cúpula + cruz */}
      <path d="M38 96 V56 q0 -12 10 -12 q10 0 10 12 v40" stroke="#fff" strokeWidth="3.5" />
      <path d="M48 44 V34 M43 38 h10" stroke="#fff" strokeWidth="3" />
      <path d="M44 66 a4 4 0 0 1 8 0 v8 h-8 z" stroke="#fff" strokeWidth="2.5" />
      <path d="M44 84 a4 4 0 0 1 8 0 v12" stroke="#fff" strokeWidth="2.5" />
      {/* Edificios coloniales */}
      <path d="M58 96 V64 h22 v32" stroke="#fff" strokeWidth="3.5" />
      <path d="M58 64 l11 -8 l11 8" stroke="#fff" strokeWidth="3" />
      <path d="M64 74 h4 M72 74 h4 M64 82 h4 M72 82 h4" stroke="#fff" strokeWidth="2.5" />
      <path d="M22 96 V74 h16 M26 82 h4 M26 90 h4" stroke="#fff" strokeWidth="3" />
      {/* Palma */}
      <path d="M94 96 q2 -18 -2 -30" stroke="#3faa4c" strokeWidth="4" />
      <path d="M92 66 q-10 -8 -18 -4 q10 -4 18 4 z" fill="#3faa4c" />
      <path d="M92 66 q-2 -12 6 -18 q-6 8 -6 18 z" fill="#3faa4c" />
      <path d="M92 66 q10 -8 18 -2 q-10 -2 -18 2 z" fill="#3faa4c" />
      <path d="M92 66 q12 0 16 8 q-8 -6 -16 -8 z" fill="#3faa4c" />
      {/* Base */}
      <path d="M16 96 h90" stroke="#fff" strokeWidth="3.5" />
      {/* Olas */}
      <path d="M24 105 q6 -5 12 0 q6 5 12 0 q6 -5 12 0 q6 5 12 0 q6 -5 12 0" stroke="#2e9fd8" strokeWidth="3.5" />
      <path d="M36 113 q6 -5 12 0 q6 5 12 0 q6 -5 12 0" stroke="#2e9fd8" strokeWidth="3" opacity="0.7" />
    </svg>
  );
}

/**
 * Wordmark del portal. Con `citySlug` el glifo pasa a ser el emblema de esa
 * ciudad (el mismo dibujo del selector), así el encabezado de cada ciudad
 * lleva su propio logo; sin él se usa el glifo del sitio.
 */
export default function SiteLogo({
  className,
  tagline = false,
  glyph = true,
  citySlug,
  cityName,
}: {
  className?: string;
  tagline?: boolean;
  /** Con `false` queda solo el wordmark: para encabezados que ya llevan otro dibujo. */
  glyph?: boolean;
  citySlug?: string;
  cityName?: string;
}) {
  return (
    <span className={`flex items-center gap-3 ${className ?? ""}`}>
      {!glyph ? null : citySlug ? (
        // El emblema y el nombre forman una columna: el dibujo se centra sobre
        // el rótulo y la columna entera se alinea con el wordmark.
        <span className="flex shrink-0 flex-col items-center">
          <CityEmblem slug={citySlug} ring={false} className="h-[2.6em] w-[3.38em]" />
          {cityName && (
            <span className="mt-[0.15em] text-center text-[max(0.3em,10px)] font-light tracking-[0.28em] text-white uppercase">
              {cityName}
            </span>
          )}
        </span>
      ) : (
        <LogoIcon className="h-[2.6em] w-[2.6em] shrink-0" />
      )}
      {/* Separador: el emblema de la ciudad y el wordmark son dos logos
          distintos, así que en las páginas de ciudad los divide una línea. */}
      {glyph && citySlug && (
        <span aria-hidden className="h-[2.6em] w-px shrink-0 bg-white/30" />
      )}
      <span className={`flex flex-col ${glyph && citySlug ? "mt-[0.3em]" : ""}`}>
        <span className="font-logo text-[1.15em] leading-none font-semibold tracking-wide text-white">
          QuéHacer<span className="text-brand-500">RD</span>
          <span className="align-baseline text-[0.5em] font-medium text-neutral-400">
            .com
          </span>
        </span>
        {tagline && (
          <span className="mt-[0.4em] text-center text-[max(0.36em,11px)] font-normal text-neutral-400">
            Planes, lugares y experiencias en RD
          </span>
        )}
      </span>
    </span>
  );
}

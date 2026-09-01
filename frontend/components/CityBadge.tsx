import { slugOf, type UmbracoItem } from "@/lib/umbraco";

/**
 * Emblema de ciudad: la misma familia visual del logo (arco solar, palma,
 * línea de costa y olas) con el hito de cada ciudad dentro de un medallón.
 * El dibujo se elige por el slug de la ciudad; una ciudad nueva sin escena
 * propia recibe la playa genérica.
 */

const GREEN = "#3faa4c";
const ORANGE = "#f5b301";
const BLUE = "#2e9fd8";

/** Segunda línea decorativa del nombre, por slug de ciudad. */
const CITY_SUBTITLES: Record<string, string> = {
  santiago: "de los Caballeros",
};

/** Palma con la base en (0,0) y unos 30 de alto; se coloca con transform. */
function Palm() {
  return (
    <g>
      <path d="M0 0 q2 -18 -2 -30" stroke={GREEN} strokeWidth="4" fill="none" />
      <path d="M-2 -30 q-10 -8 -18 -4 q10 -4 18 4 z" fill={GREEN} />
      <path d="M-2 -30 q-2 -12 6 -18 q-6 8 -6 18 z" fill={GREEN} />
      <path d="M-2 -30 q10 -8 18 -2 q-10 -2 -18 2 z" fill={GREEN} />
      <path d="M-2 -30 q12 0 16 8 q-8 -6 -16 -8 z" fill={GREEN} />
    </g>
  );
}

/** Par de aves con el vértice izquierdo en (0,0). */
function Birds() {
  return (
    <path
      d="M0 0 q5 -6 10 0 q5 -6 10 0"
      stroke="#fff"
      strokeWidth="2.5"
      fill="none"
    />
  );
}

/** Sol centrado en (0,0). */
function Sun() {
  return (
    <g stroke={ORANGE} strokeWidth="4" fill="none">
      <circle cx="0" cy="0" r="13" />
      <path d="M0 -20 V-28 M0 20 V28 M-20 0 H-28 M20 0 H28" />
      <path d="M-14 -14 l-6 -6 M14 -14 l6 -6 M-14 14 l-6 6 M14 14 l6 6" />
    </g>
  );
}

/** Arco solar que enmarca el hito, de la costa a la altura de la palma. */
function Arch() {
  return (
    <path
      d="M32 130 C 40 58, 118 38, 150 78"
      stroke={ORANGE}
      strokeWidth="6"
      fill="none"
    />
  );
}

/** Alcázar de Colón: dos niveles de arcadas. */
function AlcazarScene() {
  return (
    <g>
      <Arch />
      <g transform="translate(96 66)">
        <Birds />
      </g>
      <g stroke="#fff" fill="none">
        <path d="M58 78 H142" strokeWidth="3.5" />
        <path d="M64 78 V128 M136 78 V128" strokeWidth="3.5" />
        <path d="M60 100 H140" strokeWidth="3" />
        <path d="M68 84 h8 v8 h-8 z M124 84 h8 v8 h-8 z" strokeWidth="2.5" />
        {[80, 94, 108].map((x) => (
          <path key={x} d={`M${x} 100 v-8 a6 6 0 0 1 12 0 v8`} strokeWidth="2.5" />
        ))}
        {[74, 90, 106, 122].map((x) => (
          <path key={x} d={`M${x} 128 v-16 a5 5 0 0 1 10 0 v16`} strokeWidth="2.5" />
        ))}
      </g>
      <g transform="translate(150 128) scale(-1.3 1.3)">
        <Palm />
      </g>
    </g>
  );
}

/** Monumento a los Héroes: torre alta y esbelta sobre el basamento con arcadas. */
function MonumentScene() {
  return (
    <g>
      <Arch />
      <g transform="translate(108 64)">
        <Birds />
      </g>
      <g stroke="#fff" fill="none">
        {/* Casas del casco, a los lados del monumento */}
        <path d="M38 128 V112 L48 104 L58 112 V128" strokeWidth="3" />
        <path d="M122 128 V110 H142 V128" strokeWidth="3" />
        {/* Basamento */}
        <path d="M70 128 H122" strokeWidth="3.5" />
        <path d="M76 128 V78 H116 V128" strokeWidth="3.5" />
        <path d="M72 100 H120" strokeWidth="3" />
        <path d="M74 78 H118" strokeWidth="3" />
        {[81, 93, 105].map((x) => (
          <path key={x} d={`M${x} 128 v-13 a5 5 0 0 1 10 0 v13`} strokeWidth="2.5" />
        ))}
        {[82, 94, 106].map((x) => (
          <path key={x} d={`M${x} 100 v-6 a4 4 0 0 1 8 0 v6`} strokeWidth="2.5" />
        ))}
        {/* Torre */}
        <path d="M89 78 V50 H103 V78" strokeWidth="3.5" />
        <path d="M92 78 v-12 a4 4 0 0 1 8 0 v12" strokeWidth="2.5" />
        <path d="M87 50 H105" strokeWidth="3" />
        <path d="M92 50 V44 a4 4 0 0 1 8 0 v6" strokeWidth="3" />
        {/* Cruz */}
        <path d="M96 42 V32 M91 36 H101" strokeWidth="2.5" />
      </g>
      <g transform="translate(158 128) scale(-1.2 1.2)">
        <Palm />
      </g>
    </g>
  );
}

/** Playa: dos palmas y el sol. Escena por defecto de cualquier ciudad. */
function BeachScene() {
  return (
    <g>
      <g transform="translate(58 128) scale(1.45)">
        <Palm />
      </g>
      <g transform="translate(142 128) scale(-1.45 1.45)">
        <Palm />
      </g>
      <g transform="translate(100 88)">
        <Sun />
      </g>
      <g transform="translate(90 52)">
        <Birds />
      </g>
    </g>
  );
}

/**
 * Escena de cada ciudad y su recorte sin medallón: el dibujo de cada una ocupa
 * distinta altura (la torre de Santiago sube más que el arco de Santo Domingo),
 * así que cada recorte se ajusta al suyo y todos comparten la misma proporción
 * (13:10) para que los logos del encabezado se vean del mismo tamaño.
 */
const CITY_SCENES: Record<string, { Scene: () => React.ReactElement; crop: string }> = {
  "santo-domingo": { Scene: AlcazarScene, crop: "30 44 146 112" },
  santiago: { Scene: MonumentScene, crop: "28 30 153 118" },
  "punta-cana": { Scene: BeachScene, crop: "30 44 140 108" },
};

const DEFAULT_SCENE = CITY_SCENES["punta-cana"];

/**
 * Escena de la ciudad. Con `ring` va dentro del medallón (el botón del
 * selector); sin él se recorta al dibujo, que es como sustituye al glifo del
 * logo en el encabezado de la ciudad.
 */
export function CityEmblem({
  slug,
  className,
  ring = true,
}: {
  slug: string;
  className?: string;
  ring?: boolean;
}) {
  const { Scene, crop } = CITY_SCENES[slug] ?? DEFAULT_SCENE;
  return (
    <svg
      viewBox={ring ? "0 0 200 200" : crop}
      className={className}
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ring && (
        <>
          <circle cx="100" cy="100" r="96" stroke="#fff" strokeWidth="2.5" />
          <circle cx="100" cy="100" r="88" stroke="#fff" strokeWidth="1" opacity="0.3" />
        </>
      )}
      <Scene />
      {/* Costa y olas */}
      <path d="M34 128 H166" stroke="#fff" strokeWidth="3.5" />
      <path
        d="M56 142 q8 -7 16 0 q8 7 16 0 q8 -7 16 0 q8 7 16 0 q8 -7 16 0"
        stroke={BLUE}
        strokeWidth="4.5"
      />
    </svg>
  );
}

/** Botón-emblema de una ciudad, usado en el selector de ciudades. */
export default function CityBadge({ city }: { city: UmbracoItem }) {
  const slug = slugOf(city);
  const subtitle = CITY_SUBTITLES[slug];

  return (
    <span className="flex h-full flex-col items-center rounded-3xl bg-gradient-to-b from-neutral-800 to-neutral-900 px-6 pt-8 pb-6">
      <CityEmblem slug={slug} className="w-full max-w-[220px]" />
      <span className="mt-8 text-center text-xl font-light tracking-[0.28em] text-white uppercase sm:text-2xl">
        {city.name}
      </span>
      {subtitle && (
        <span className="mt-2 text-center text-[11px] font-light tracking-[0.28em] text-neutral-400 uppercase">
          {subtitle}
        </span>
      )}
      <span className="mt-4 flex w-full items-center justify-center gap-3 pt-1">
        <span className="h-px w-6 bg-neutral-700" />
        <span className="text-[11px] tracking-[0.22em] text-brand-500 uppercase">
          quehacerrd.com
        </span>
        <span className="h-px w-6 bg-neutral-700" />
      </span>
    </span>
  );
}

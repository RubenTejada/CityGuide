import {
  formatTemperature,
  type CityWeather,
  type WeatherCondition,
  type WeatherDay,
  type WeatherNow,
} from "@/lib/weather";
import { t, type Locale } from "@/lib/i18n";

/** Cuándo vale la pena decir que puede llover: por debajo de esto no es noticia. */
const RAIN_WORTH_SAYING = 20;

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** La nube que sostienen la lluvia, la llovizna, la tormenta, la niebla y la nieve. */
const CLOUD = "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2";

/**
 * El dibujo de una condición, en el mismo trazo que el resto de los iconos del
 * portal. De noche el cielo despejado es la luna: un sol a las nueve de la
 * noche se lee como un error, no como el tiempo que hace.
 */
function Glyph({
  condition,
  night,
}: {
  condition: WeatherCondition;
  night: boolean;
}) {
  switch (condition) {
    case "clear":
      return night ? (
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2m-15.07-5.07L4.93 4.93m14.14 0-1.41 1.41M6.34 17.66l-1.41 1.41m14.14 0-1.41-1.41" />
        </>
      );
    case "partlyCloudy":
      return night ? (
        <>
          <path d="M10.2 8.5A6 6 0 0 1 16 4a5 5 0 0 0 5 5 6 6 0 0 1-3 5.2" />
          <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
        </>
      ) : (
        <>
          <path d="M12 2v2m-7.07 2.93L3.5 5.5M20 12h2m-2.93-7.07L17.66 6.34" />
          <path d="M15.9 12.65a4 4 0 0 0-5.9-4.13" />
          <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
        </>
      );
    case "cloudy":
      return <path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" />;
    case "fog":
      return (
        <>
          <path d={CLOUD} />
          <path d="M16 17H7M17 21H9" />
        </>
      );
    case "drizzle":
      return (
        <>
          <path d={CLOUD} />
          <path d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1" />
        </>
      );
    case "rain":
      return (
        <>
          <path d={CLOUD} />
          <path d="M16 14v6M8 14v6M12 16v6" />
        </>
      );
    case "thunderstorm":
      return (
        <>
          <path d={CLOUD} />
          <path d="m13 12-3 5h4l-3 5" />
        </>
      );
    case "snow":
      return (
        <>
          <path d={CLOUD} />
          <path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01" />
        </>
      );
  }
}

export function WeatherIcon({
  condition,
  night = false,
  className = "h-5 w-5",
}: {
  condition: WeatherCondition;
  night?: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <Glyph condition={condition} night={night} />
    </svg>
  );
}

/**
 * El termómetro de la cabecera: el icono y los grados que hace ahora mismo en
 * la ciudad que se está mirando, junto a su emblema. Al pasar el ratón se abre
 * el resto — la sensación, la máxima, la mínima y la lluvia del día — porque en
 * la cabecera no cabe y aquí es donde se busca. Sin dato no se dibuja nada: el
 * clima acompaña la página, no la ocupa.
 *
 * El desplegable es CSS puro (`group-hover`), así que la insignia sigue siendo
 * un componente de servidor sin JavaScript; lo que dice está además en el texto
 * oculto que lee un lector de pantalla, y por eso el panel es decorativo.
 */
export default function WeatherBadge({
  weather,
  cityName,
  locale,
  className = "",
}: {
  weather: CityWeather | null;
  cityName: string;
  locale: Locale;
  className?: string;
}) {
  if (!weather) return null;
  const words = t(locale).weather;
  const { condition, night, temperature, feelsLike } = weather.now;
  const degrees = formatTemperature(temperature);
  const name = words.conditions[condition];
  // Las dos fuentes empiezan su pronóstico en el día de hoy, así que el primero
  // de la lista es el día que la insignia resume.
  const today = weather.days[0] ?? null;
  const lines = [
    words.nowTemperature(degrees),
    ...(feelsLike === null ? [] : [words.feelsLike(formatTemperature(feelsLike))]),
    ...(today
      ? [words.range(formatTemperature(today.max), formatTemperature(today.min))]
      : []),
    ...(today?.rainChance != null && today.rainChance >= RAIN_WORTH_SAYING
      ? [words.rainChance(today.rainChance)]
      : []),
  ];
  // El sol y el sol entre nubes van del amarillo del logo; lo demás, del gris
  // claro de la cabecera, que es donde vive esta insignia.
  const tone =
    condition === "clear" || condition === "partlyCloudy"
      ? "text-sun-300"
      : "text-neutral-300";

  return (
    <div className={`group relative ${className}`}>
      <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-white">
        <WeatherIcon
          condition={condition}
          night={night}
          className={`h-4 w-4 ${tone}`}
        />
        <span className="text-sm font-semibold tabular-nums">{degrees}</span>
        <span className="sr-only">
          {`${words.inCity(cityName, degrees, name)}. ${lines.join(". ")}.`}
        </span>
      </div>
      {/* Se abre bajo la insignia y por encima de la barra de secciones, y se
          engancha a su borde derecho para no salirse de la cabecera. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-full right-0 z-30 mt-2 w-max max-w-[15rem] rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-xs text-neutral-600 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
          <WeatherIcon
            condition={condition}
            night={night}
            className="h-4 w-4 shrink-0 text-neutral-500"
          />
          {name}
        </p>
        <p className="mt-0.5 text-neutral-500">{cityName}</p>
        <ul className="mt-1.5 space-y-0.5 tabular-nums">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * El pronóstico del día que se está planificando, bajo las pestañas de fecha
 * de "Qué Hacer": si el plan es de playa o de plaza techada lo decide esto
 * antes que cualquier otra cosa de la página. Del día de hoy se dice además la
 * temperatura de este momento, que es la que se siente al salir.
 */
export function WeatherForecast({
  day,
  now,
  locale,
  className = "",
}: {
  day: WeatherDay | null;
  /** Solo cuando el día planificado es hoy. */
  now: WeatherNow | null;
  locale: Locale;
  className?: string;
}) {
  if (!day) return null;
  const words = t(locale).weather;
  const rain = day.rainChance;

  return (
    <div
      className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600 ${className}`}
    >
      <WeatherIcon
        condition={day.condition}
        className="h-5 w-5 shrink-0 text-neutral-500"
      />
      {now && (
        <span className="font-semibold text-neutral-900 tabular-nums">
          {words.nowTemperature(formatTemperature(now.temperature))}
        </span>
      )}
      {/* Lo que se siente al salir, que en el Caribe está grados por encima de
          lo que marca el termómetro y es lo que decide si un plan es de calle. */}
      {now?.feelsLike != null && (
        <span className="tabular-nums">
          {words.feelsLike(formatTemperature(now.feelsLike))}
        </span>
      )}
      <span>{words.conditions[day.condition]}</span>
      <span className="tabular-nums">
        {words.range(formatTemperature(day.max), formatTemperature(day.min))}
      </span>
      {rain !== null && rain >= RAIN_WORTH_SAYING && (
        <span className="tabular-nums">{words.rainChance(rain)}</span>
      )}
    </div>
  );
}

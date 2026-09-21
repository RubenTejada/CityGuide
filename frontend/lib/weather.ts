// El clima de una ciudad: lo que hace ahora y el pronóstico de los días que la
// guía puede planificar.
//
// Dos fuentes, por lo que cada una hace mejor:
//
//   * WeatherAPI.com da el dato de ahora mezclando observaciones de estaciones,
//     que es el número que enseñan las apps del teléfono y el que reporta el
//     aeropuerto. Necesita una clave (gratis, `WEATHER_API_KEY`), y su plan
//     gratuito solo pronostica tres días.
//   * Open-Meteo es un modelo puro: sin clave, sin cuenta y con siete días, pero
//     en la costa se queda uno o dos grados corto de lo observado, y su código
//     diario es el peor de las 24 horas, así que el del día se saca aquí de las
//     horas de luz (`dominantCondition`).
//
// Así que WeatherAPI manda en el "ahora" y en los días que alcanza, y Open-Meteo
// completa el resto de la semana — y responde solo cuando no hay clave o la
// llamada falla, que es lo que mantiene el portal con clima en desarrollo y ante
// una caída.
//
// Una sola petición por fuente y ciudad sirve las dos vistas: como es la misma
// URL, React la deduplica dentro de una renderización y Next la cachea entre
// peticiones, así que la cabecera y la guía no pagan dos.

import { cacheLife } from "next/cache";
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const WEATHER_API = "https://api.weatherapi.com/v1/forecast.json";

/** Los días del pronóstico son días de calendario dominicano, como los de la guía. */
const TIME_ZONE = "America/Santo_Domingo";

/** Hoy y los seis días siguientes: la ventana que planifica "Qué Hacer". */
const FORECAST_DAYS = 7;

/**
 * El tiempo reducido a lo que el portal dibuja y nombra. Cada fuente tiene su
 * propio catálogo de códigos —casi treinta el uno, más de cuarenta el otro— y
 * ambos distinguen cosas que aquí no cambian ni el icono ni la frase ("lluvia
 * moderada" y "lluvia fuerte" son lluvia).
 */
export type WeatherCondition =
  | "clear"
  | "partlyCloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "thunderstorm"
  | "snow";

export interface WeatherNow {
  /** Grados Celsius, sin redondear: quien los muestra decide con cuántos. */
  temperature: number;
  /** Sensación térmica, que en el Caribe se aleja mucho del termómetro. */
  feelsLike: number | null;
  condition: WeatherCondition;
  /** De noche el icono de "despejado" es la luna, no el sol. */
  night: boolean;
}

export interface WeatherDay {
  /** aaaa-mm-dd en la zona de la ciudad, la misma clave que usan las pestañas de la guía. */
  date: string;
  max: number;
  min: number;
  condition: WeatherCondition;
  /** Probabilidad de lluvia en porcentaje, o null si la fuente no la da. */
  rainChance: number | null;
}

export interface CityWeather {
  now: WeatherNow;
  days: WeatherDay[];
}

// ---- códigos de cada fuente ----

/** Código WMO (Open-Meteo) -> la condición que el portal dibuja. */
export function conditionOf(code: number): WeatherCondition {
  if (code >= 95) return "thunderstorm";
  if (code >= 85 || (code >= 71 && code <= 77)) return "snow";
  if (code >= 61) return "rain";
  if (code >= 51) return "drizzle";
  if (code >= 45) return "fog";
  if (code === 3) return "cloudy";
  if (code >= 1) return "partlyCloudy";
  return "clear";
}

/**
 * Código de WeatherAPI -> la misma condición. Su catálogo no es una escala como
 * el WMO sino una lista, así que se lee como lista: lo que no esté en ninguna
 * cae en "nublado", que es lo que menos promete de las ocho.
 */
const WEATHER_API_CODES: Record<WeatherCondition, number[]> = {
  clear: [1000],
  // 1063, "patchy rain nearby", es sol entre nubes con una posibilidad de
  // chubasco (su propio icono es un sol tras la nube), y es lo que WeatherAPI
  // pone en el trópico la mitad de las horas: leído como lluvia, el portal
  // decía "Lluvia" a las tres de la tarde con el sol fuera.
  partlyCloudy: [1003, 1063],
  cloudy: [1006, 1009],
  fog: [1030, 1135, 1147],
  drizzle: [1150, 1153, 1168, 1171],
  rain: [1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1240, 1243, 1246],
  thunderstorm: [1087, 1273, 1276, 1279, 1282],
  snow: [
    1066, 1069, 1072, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222,
    1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264,
  ],
};

const BY_WEATHER_API_CODE = new Map<number, WeatherCondition>(
  Object.entries(WEATHER_API_CODES).flatMap(([condition, codes]) =>
    codes.map((code): [number, WeatherCondition] => [
      code,
      condition as WeatherCondition,
    ]),
  ),
);

export function weatherApiConditionOf(code: number): WeatherCondition {
  return BY_WEATHER_API_CODE.get(code) ?? "cloudy";
}

/**
 * De más a menos severa: es el orden en que se desempata cuando dos
 * condiciones ocupan las mismas horas de un día.
 */
const SEVERITY: WeatherCondition[] = [
  "thunderstorm",
  "snow",
  "rain",
  "drizzle",
  "fog",
  "cloudy",
  "partlyCloudy",
  "clear",
];

const WET: ReadonlySet<WeatherCondition> = new Set([
  "drizzle",
  "rain",
  "thunderstorm",
  "snow",
]);

/**
 * Lo que tiene que caer en una hora para contarla como hora de lluvia. Por
 * debajo el modelo marca "llovizna" o "tormenta" con una décima de milímetro
 * —ruido de modelo en el trópico, donde media semana lleva ese código— y no
 * es nada que cambie un plan.
 */
const WET_MM_PER_HOUR = 0.5;

/** La parte de las horas de luz que tiene que llover para que el día sea de lluvia. */
const WET_SHARE = 1 / 3;

/** Una hora de luz de un día, ya leída en la condición del portal. */
interface DaylightHour {
  condition: WeatherCondition;
  /** Milímetros caídos en la hora. */
  precipitation: number;
}

/** La condición que más horas ocupa entre las dadas, y a igual horas la más severa. */
function mostHours(conditions: WeatherCondition[]): WeatherCondition | null {
  const hours = new Map<WeatherCondition, number>();
  for (const condition of conditions) {
    hours.set(condition, (hours.get(condition) ?? 0) + 1);
  }
  return (
    [...hours.entries()].sort(
      ([a, ha], [b, hb]) =>
        hb - ha || SEVERITY.indexOf(a) - SEVERITY.indexOf(b),
    )[0]?.[0] ?? null
  );
}

/**
 * La condición de un día a partir de sus horas de luz, la misma regla para las
 * dos fuentes, o los días de una no se leerían como los de la otra.
 *
 * Ninguna de las dos trae un resumen que sirva: el `weather_code` diario de
 * Open-Meteo es el código más severo de las veinticuatro horas — y en el
 * Caribe, en temporada de lluvias, casi todos los días tienen una hora de
 * tormenta a media tarde: el portal decía "Tormenta" siete días seguidos
 * sobre días de sol con un chubasco — y el de WeatherAPI es "lluvia" por un
 * milímetro repartido en toda la tarde. Lo que decide un plan es cómo va a
 * estar la mayor parte del día: es de lluvia
 * cuando llueve de verdad un tercio de las horas de luz (y entonces la
 * lluvia que más horas ocupa), y si no, el cielo que más horas ocupa entre
 * las que no llueven. La lluvia que pueda caer ya la dice `rainChance` al
 * lado. Un día de llovizna de una décima de milímetro hora tras hora, sin
 * una hora de cielo, es un día nublado.
 */
function dominantCondition(hours: DaylightHour[]): WeatherCondition | null {
  if (hours.length === 0) return null;
  const wet = hours
    .filter(
      ({ condition, precipitation }) =>
        WET.has(condition) && precipitation >= WET_MM_PER_HOUR,
    )
    .map(({ condition }) => condition);
  if (wet.length >= hours.length * WET_SHARE) return mostHours(wet);
  const dry = hours
    .filter(({ condition }) => !WET.has(condition))
    .map(({ condition }) => condition);
  return mostHours(dry) ?? "cloudy";
}

// ---- WeatherAPI.com ----

interface WeatherApiResponse {
  current?: {
    temp_c?: number;
    feelslike_c?: number;
    is_day?: number;
    condition?: { code?: number };
  };
  forecast?: {
    forecastday?: {
      date?: string;
      day?: {
        maxtemp_c?: number;
        mintemp_c?: number;
        daily_chance_of_rain?: number;
        condition?: { code?: number };
      };
      hour?: {
        is_day?: number;
        precip_mm?: number;
        condition?: { code?: number };
      }[];
    }[];
  };
}

async function fromWeatherApi(
  key: string,
  latitude: number,
  longitude: number,
): Promise<CityWeather | null> {
  const url =
    `${WEATHER_API}?key=${encodeURIComponent(key)}` +
    `&q=${latitude.toFixed(3)},${longitude.toFixed(3)}` +
    `&days=${FORECAST_DAYS}&aqi=no&alerts=no`;

  const json = await readJson<WeatherApiResponse>(url);
  const current = json?.current;
  if (
    typeof current?.temp_c !== "number" ||
    typeof current?.condition?.code !== "number"
  ) {
    return null;
  }

  const days = (json?.forecast?.forecastday ?? []).flatMap(
    (entry): WeatherDay[] => {
      const day = entry.day;
      const hours = (entry.hour ?? []).flatMap((hour): DaylightHour[] =>
        hour.is_day === 1 && typeof hour.condition?.code === "number"
          ? [
              {
                condition: weatherApiConditionOf(hour.condition.code),
                precipitation: hour.precip_mm ?? 0,
              },
            ]
          : [],
      );
      const condition =
        dominantCondition(hours) ??
        (typeof day?.condition?.code === "number"
          ? weatherApiConditionOf(day.condition.code)
          : null);
      if (
        typeof entry.date !== "string" ||
        typeof day?.maxtemp_c !== "number" ||
        typeof day?.mintemp_c !== "number" ||
        !condition
      ) {
        return [];
      }
      return [
        {
          date: entry.date,
          max: day.maxtemp_c,
          min: day.mintemp_c,
          condition,
          rainChance:
            typeof day.daily_chance_of_rain === "number"
              ? day.daily_chance_of_rain
              : null,
        },
      ];
    },
  );

  return {
    now: {
      temperature: current.temp_c,
      feelsLike:
        typeof current.feelslike_c === "number" ? current.feelslike_c : null,
      condition: weatherApiConditionOf(current.condition.code),
      night: current.is_day === 0,
    },
    days,
  };
}

// ---- Open-Meteo ----

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    is_day?: number;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
  };
  hourly?: {
    time?: string[];
    weather_code?: number[];
    is_day?: number[];
    precipitation?: number[];
  };
}

async function fromOpenMeteo(
  latitude: number,
  longitude: number,
): Promise<CityWeather | null> {
  const url =
    `${OPEN_METEO}?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}` +
    "&current=temperature_2m,apparent_temperature,weather_code,is_day" +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&hourly=weather_code,is_day,precipitation" +
    `&timezone=${encodeURIComponent(TIME_ZONE)}&forecast_days=${FORECAST_DAYS}`;

  const json = await readJson<OpenMeteoResponse>(url);
  const current = json?.current;
  if (
    typeof current?.temperature_2m !== "number" ||
    typeof current?.weather_code !== "number"
  ) {
    return null;
  }

  // Las horas de luz de cada día, agrupadas por su fecha ("2026-09-15T14:00").
  const hourly = json?.hourly;
  const daylight = new Map<string, DaylightHour[]>();
  (hourly?.time ?? []).forEach((time, i) => {
    const code = hourly?.weather_code?.[i];
    const precipitation = hourly?.precipitation?.[i] ?? 0;
    if (typeof code !== "number" || hourly?.is_day?.[i] !== 1) return;
    const date = time.slice(0, 10);
    daylight.set(date, [
      ...(daylight.get(date) ?? []),
      { condition: conditionOf(code), precipitation },
    ]);
  });

  const daily = json?.daily;
  const days = (daily?.time ?? []).flatMap((date, i): WeatherDay[] => {
    const max = daily?.temperature_2m_max?.[i];
    const min = daily?.temperature_2m_min?.[i];
    const condition = dominantCondition(daylight.get(date) ?? []);
    if (typeof max !== "number" || typeof min !== "number" || !condition) {
      return [];
    }
    const rain = daily?.precipitation_probability_max?.[i];
    return [
      {
        date,
        max,
        min,
        condition,
        rainChance: typeof rain === "number" ? rain : null,
      },
    ];
  });

  return {
    now: {
      temperature: current.temperature_2m,
      feelsLike:
        typeof current.apparent_temperature === "number"
          ? current.apparent_temperature
          : null,
      condition: conditionOf(current.weather_code),
      night: current.is_day === 0,
    },
    days,
  };
}

/**
 * Una respuesta JSON cacheada, o null: el clima adorna la página y nunca la rompe.
 * La URL es la clave, así que la cabecera y la guía comparten la misma entrada; un
 * fallo se guarda solo el medio minuto de `unanswered`.
 */
async function readJson<T>(url: string): Promise<T | null> {
  "use cache";
  try {
    const res = await fetch(url);
    if (!res.ok) {
      cacheLife("unanswered");
      return null;
    }
    const body = (await res.json()) as T;
    cacheLife("weather");
    return body;
  } catch {
    cacheLife("unanswered");
    return null;
  }
}

/**
 * El clima de una ciudad por sus coordenadas, o null cuando no hay dato: una
 * ciudad sin coordenadas, las dos fuentes caídas o una respuesta que no trae lo
 * suyo.
 */
export async function getCityWeather(
  latitude: number,
  longitude: number,
): Promise<CityWeather | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;

  const key = process.env.WEATHER_API_KEY?.trim();
  // Las dos a la vez porque en el plan gratuito las dos hacen falta: el "ahora"
  // observado de una y los días cuatro a siete de la otra.
  const [observed, model] = await Promise.all([
    key ? fromWeatherApi(key, latitude, longitude) : Promise.resolve(null),
    fromOpenMeteo(latitude, longitude),
  ]);
  if (!observed) return model;

  const covered = new Set(observed.days.map((day) => day.date));
  const days = [
    ...observed.days,
    ...(model?.days ?? []).filter((day) => !covered.has(day.date)),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return { now: observed.now, days };
}

/** El pronóstico de un día concreto, o null si el día cae fuera de la ventana. */
export function weatherOn(
  weather: CityWeather | null,
  date: string,
): WeatherDay | null {
  return weather?.days.find((day) => day.date === date) ?? null;
}

/** Los grados como los escribe el portal: enteros y con el símbolo pegado. */
export function formatTemperature(celsius: number): string {
  return `${Math.round(celsius)}°`;
}

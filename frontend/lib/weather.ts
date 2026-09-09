// El clima de una ciudad, leído de Open-Meteo.
//
// Es la fuente que encaja con el portal: gratis, sin clave que guardar ni rotar,
// y consultada por coordenadas — que es justo lo que el nodo de la ciudad ya
// lleva (`latitude`/`longitude`), así que una ciudad nueva trae su clima sin
// tocar código ni configuración.
//
// Una sola petición por ciudad sirve las dos vistas: el dato de ahora que va en
// la cabecera y el pronóstico por día que "Qué Hacer" usa para el día que se
// está planificando. Como es la misma URL, React la deduplica dentro de una
// misma renderización y Next la cachea entre peticiones.

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** Los días del pronóstico son días de calendario dominicano, como los de la guía. */
const TIME_ZONE = "America/Santo_Domingo";

/** Media hora: lo que enseña la cabecera es ambiente, no un instrumento. */
const REVALIDATE_SECONDS = 1800;

/** Hoy y los seis días siguientes: la ventana que planifica "Qué Hacer". */
const FORECAST_DAYS = 7;

/**
 * El tiempo reducido a lo que el portal dibuja y nombra. Los códigos WMO son
 * casi treinta y distinguen cosas que aquí no cambian ni el icono ni la frase
 * ("lluvia moderada" y "lluvia fuerte" son lluvia).
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

/** Código WMO -> la condición que el portal dibuja. */
export function conditionOf(code: number): WeatherCondition {
  if (code >= 95) return "thunderstorm";
  if (code >= 85 || (code >= 71 && code <= 77)) return "snow";
  if (code >= 80) return "rain";
  if (code >= 61) return "rain";
  if (code >= 51) return "drizzle";
  if (code >= 45) return "fog";
  if (code === 3) return "cloudy";
  if (code >= 1) return "partlyCloudy";
  return "clear";
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
  };
}

/**
 * El clima de una ciudad por sus coordenadas, o null cuando no hay dato: una
 * ciudad sin coordenadas, la fuente caída o una respuesta que no trae lo suyo.
 * El clima adorna la página, así que nunca la rompe ni la retrasa más de lo
 * que tarde una petición cacheada.
 */
export async function getCityWeather(
  latitude: number,
  longitude: number,
): Promise<CityWeather | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;

  const url =
    `${ENDPOINT}?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}` +
    "&current=temperature_2m,weather_code,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    `&timezone=${encodeURIComponent(TIME_ZONE)}&forecast_days=${FORECAST_DAYS}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as OpenMeteoResponse;

    const current = json.current;
    if (
      typeof current?.temperature_2m !== "number" ||
      typeof current?.weather_code !== "number"
    ) {
      return null;
    }

    const daily = json.daily;
    const dates = daily?.time ?? [];
    const days: WeatherDay[] = dates.flatMap((date, i) => {
      const max = daily?.temperature_2m_max?.[i];
      const min = daily?.temperature_2m_min?.[i];
      const code = daily?.weather_code?.[i];
      if (
        typeof max !== "number" ||
        typeof min !== "number" ||
        typeof code !== "number"
      ) {
        return [];
      }
      const rain = daily?.precipitation_probability_max?.[i];
      return [
        {
          date,
          max,
          min,
          condition: conditionOf(code),
          rainChance: typeof rain === "number" ? rain : null,
        },
      ];
    });

    return {
      now: {
        temperature: current.temperature_2m,
        condition: conditionOf(current.weather_code),
        night: current.is_day === 0,
      },
      days,
    };
  } catch {
    // Sin clima la página se dibuja igual: es un adorno, no contenido.
    return null;
  }
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

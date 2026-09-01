// Server-side client for the Caribbean Cinemas RD public GraphQL API
// (Indy Cinema Systems). Read-only: cartelera, horarios y trailers.
// Reverse-engineered from rd.caribbeancinemas.com — the API is anonymous but
// requires the site-id/circuit-id/client-type headers the SPA sends.

import { findYoutubeTrailer } from "@/lib/trailers";

const CC_BASE = "https://rd.caribbeancinemas.com";
const CIRCUIT_ID = "5"; // Caribbean Cinemas Dominican Republic
const REVALIDATE_SECONDS = 900;

export interface Cinema {
  /** Indy site id, used in GraphQL queries. */
  id: string;
  name: string;
  /** URL path segment on rd.caribbeancinemas.com (booking links). */
  slug: string;
  address: string;
  lat: number;
  lng: number;
}

/** Caribbean Cinemas theaters per CityGuide city slug. */
export const CINEMAS_BY_CITY: Record<string, Cinema[]> = {
  "santo-domingo": [
    {
      id: "78",
      name: "Downtown Center",
      slug: "downtown-center",
      address: "Av. Núñez de Cáceres esq. Rómulo Betancourt",
      lat: 18.4541,
      lng: -69.9545,
    },
    {
      id: "79",
      name: "Galería 360",
      slug: "galeria-360",
      address: "Av. John F. Kennedy, 2do nivel",
      lat: 18.4857,
      lng: -69.9362,
    },
    {
      id: "84",
      name: "Novo-Centro VIP",
      slug: "novocentro-vip",
      address: "Av. Lope de Vega 29, Edificio Novo-Centro",
      lat: 18.4734,
      lng: -69.931,
    },
    {
      id: "133",
      name: "Ágora Mall",
      slug: "agora-mall",
      address: "Av. John F. Kennedy esq. Abraham Lincoln",
      lat: 18.4835,
      lng: -69.9393,
    },
    {
      id: "135",
      name: "Sambil",
      slug: "sambil",
      address: "Av. John F. Kennedy, Sambil Santo Domingo",
      lat: 18.483,
      lng: -69.9119,
    },
    {
      id: "85",
      name: "Megaplex-10",
      slug: "megaplex-10",
      address: "Av. San Vicente de Paúl, Plaza Megacentro",
      lat: 18.5072,
      lng: -69.8566,
    },
    {
      id: "87",
      name: "Coral Mall",
      slug: "coral-mall",
      address: "Autopista de San Isidro, Coral Mall",
      lat: 18.4864,
      lng: -69.8323,
    },
    {
      id: "83",
      name: "Plaza Duarte",
      slug: "plaza-duarte",
      address: "Av. Duarte, Plaza Galería Duarte",
      lat: 18.4934,
      lng: -69.8991,
    },
  ],
  santiago: [
    {
      id: "86",
      name: "Plaza Internacional",
      slug: "plaza-internacional-santiago",
      address: "Av. Juan Pablo Duarte, Plaza Internacional",
      lat: 19.4448,
      lng: -70.6806,
    },
    {
      id: "92",
      name: "Colinas Mall",
      slug: "colinas-mall",
      address: "Av. 27 de Febrero, Colinas Mall",
      lat: 19.4733,
      lng: -70.7136,
    },
  ],
};

export interface Showtime {
  id: string;
  /** "6:10 PM" — already in local (AST) time. */
  time: string;
  /** Sort key within the day (minutes since midnight). */
  minutes: number;
  badges: string[];
}

export interface MovieShowings {
  id: string;
  name: string;
  urlSlug: string;
  posterImage: string | null;
  duration: number | null;
  genre: string | null;
  rating: string | null;
  synopsis: string | null;
  trailerYoutubeId: string | null;
  showtimes: Showtime[];
}

export interface CinemaShowtimes {
  cinema: Cinema;
  showtimes: Showtime[];
}

/** One movie with every cinema in the city that shows it on the date. */
export interface MovieBillboard {
  id: string;
  name: string;
  urlSlug: string;
  posterImage: string | null;
  duration: number | null;
  genre: string | null;
  rating: string | null;
  synopsis: string | null;
  trailerYoutubeId: string | null;
  cinemas: CinemaShowtimes[];
  totalShowtimes: number;
}

interface RawShowing {
  id: string;
  time: string;
  displayMetaData: string | null;
  movie: {
    id: string;
    name: string;
    urlSlug: string;
    posterImage: string | null;
    duration: number | null;
    genre: string | null;
    rating: string | null;
    synopsis: string | null;
    trailerYoutubeId: string | null;
  } | null;
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(`${CC_BASE}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "site-id": "132", // DR homepage site; queries filter by siteIds
        "circuit-id": CIRCUIT_ID,
        "client-type": "consumer",
      },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data as T) ?? null;
  } catch {
    return null;
  }
}

const SHOWINGS_QUERY = `query ($date: String, $siteIds: [ID]) {
  showingsForDate(date: $date, siteIds: $siteIds) {
    data {
      id
      time
      displayMetaData
      movie {
        id
        name
        urlSlug
        posterImage
        duration
        genre
        rating
        synopsis
        trailerYoutubeId
      }
    }
  }
}`;

const DATES_QUERY = `query ($siteIds: [ID]) {
  datesWithShowing(siteIds: $siteIds) { value }
}`;

/** Today's date (YYYY-MM-DD) in the Dominican Republic. */
export function todayInDR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
  }).format(new Date());
}

/** A city's cinema by its exact name ("Downtown Center"), or null. */
export function cinemaByName(citySlug: string, name: string): Cinema | null {
  return CINEMAS_BY_CITY[citySlug]?.find((c) => c.name === name) ?? null;
}

/** Upcoming dates (YYYY-MM-DD) with at least one showing at the sites, max 7. */
export async function getAvailableDates(siteIds: string[]): Promise<string[]> {
  if (siteIds.length === 0) return [];
  // The API returns the list as a JSON-encoded string in `value`.
  const data = await gql<{ datesWithShowing: { value: string } }>(DATES_QUERY, {
    siteIds,
  });
  let dates: string[] = [];
  try {
    dates = JSON.parse(data?.datesWithShowing?.value ?? "[]");
  } catch {
    return [];
  }
  const today = todayInDR();
  return dates
    .filter((d) => d >= today)
    .sort()
    .slice(0, 7);
}

const BADGE_LABELS: Record<string, string> = {
  "doblada-al-espaol": "Doblada al Español",
  "ingls-subtitulada": "Inglés Subtitulada",
  espaol: "Español",
  "4dx": "4DX",
  cxc: "CXC",
  imax: "IMAX",
  vip: "VIP",
  "3d": "3D",
};

function badgesFrom(displayMetaData: string | null): string[] {
  if (!displayMetaData) return [];
  try {
    const meta = JSON.parse(displayMetaData) as { classes?: string };
    return (meta.classes ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map(
        (c) =>
          BADGE_LABELS[c] ??
          c.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      );
  } catch {
    return [];
  }
}

/**
 * The API reports showtimes as e.g. "2026-08-31T19:30:00Z" where the clock
 * value is actually local (AST) time — so read it with the UTC accessors.
 */
function parseTime(iso: string): { label: string; minutes: number } {
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    label: `${h12}:${String(m).padStart(2, "0")} ${period}`,
    minutes: h * 60 + m,
  };
}

/** Minutes since midnight right now, in DR local time. */
function nowMinutesInDR(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santo_Domingo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

async function getCinemaShowings(
  cinema: Cinema,
  date: string,
): Promise<MovieShowings[]> {
  const data = await gql<{ showingsForDate: { data: RawShowing[] } }>(
    SHOWINGS_QUERY,
    { date, siteIds: [cinema.id] },
  );
  const rows = data?.showingsForDate?.data ?? [];

  const isToday = date === todayInDR();
  const cutoff = isToday ? nowMinutesInDR() : -1;

  const byMovie = new Map<string, MovieShowings>();
  for (const row of rows) {
    if (!row.movie) continue;
    const { label, minutes } = parseTime(row.time);
    if (minutes <= cutoff) continue;
    let entry = byMovie.get(row.movie.id);
    if (!entry) {
      entry = { ...row.movie, showtimes: [] };
      byMovie.set(row.movie.id, entry);
    }
    entry.showtimes.push({
      id: row.id,
      time: label,
      minutes,
      badges: badgesFrom(row.displayMetaData),
    });
  }

  const movies = [...byMovie.values()];
  for (const movie of movies) {
    movie.showtimes.sort((a, b) => a.minutes - b.minutes);
  }
  movies.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return movies;
}

/**
 * Billboard for a city on a date, grouped by movie: each movie lists every
 * cinema showing it (with showtimes), ordered from the movie with the most
 * cinemas and showtimes down to the one with the fewest.
 */
export async function getMovieBillboard(
  citySlug: string,
  date: string,
  knownTrailers?: Record<string, string>,
): Promise<MovieBillboard[]> {
  const cinemas = CINEMAS_BY_CITY[citySlug];
  if (!cinemas) return [];
  const perCinema = await Promise.all(
    cinemas.map(async (cinema) => ({
      cinema,
      movies: await getCinemaShowings(cinema, date),
    })),
  );

  // The same movie has a different id per cinema — group by name.
  const byName = new Map<string, MovieBillboard>();
  for (const { cinema, movies } of perCinema) {
    for (const movie of movies) {
      let entry = byName.get(movie.name);
      if (!entry) {
        entry = {
          id: movie.id,
          name: movie.name,
          urlSlug: movie.urlSlug,
          posterImage: movie.posterImage,
          duration: movie.duration,
          genre: movie.genre,
          rating: movie.rating,
          synopsis: movie.synopsis,
          trailerYoutubeId: movie.trailerYoutubeId,
          cinemas: [],
          totalShowtimes: 0,
        };
        byName.set(movie.name, entry);
      }
      entry.cinemas.push({ cinema, showtimes: movie.showtimes });
      entry.totalShowtimes += movie.showtimes.length;
      // Prefer a non-null trailer from any cinema's record.
      entry.trailerYoutubeId ??= movie.trailerYoutubeId;
    }
  }

  const billboard = [...byName.values()].sort(
    (a, b) =>
      b.cinemas.length - a.cinemas.length ||
      b.totalShowtimes - a.totalShowtimes ||
      a.name.localeCompare(b.name, "es"),
  );

  // Swap Caribbean Cinemas' watermarked trailer uploads for an official
  // YouTube trailer: the agent-maintained CMS catalog first (knownTrailers,
  // keyed by lowercased movie name), then a live search; the cinema's own id
  // stays as last resort.
  await Promise.all(
    billboard.map(async (movie) => {
      const known = knownTrailers?.[movie.name.toLowerCase()];
      if (known) {
        movie.trailerYoutubeId = known;
        return;
      }
      const id = await findYoutubeTrailer(movie.name);
      if (id) movie.trailerYoutubeId = id;
    }),
  );

  return billboard;
}

// ---- link/image helpers ----

export function posterUrl(posterImage: string | null): string | null {
  return posterImage
    ? `https://indy-systems.imgix.net/${posterImage}?w=342&auto=format`
    : null;
}

/** Deep link to seat selection / purchase on Caribbean Cinemas. */
export function bookingUrl(cinema: Cinema, showtimeId: string): string {
  return `${CC_BASE}/${cinema.slug}/checkout/seats/${showtimeId}`;
}

/**
 * The cinema's branch page inside this portal. The path segment is Umbraco's
 * slug of the seeded place name (EnsureCinemasSeeded): lowercase, no accents,
 * non-alphanumerics collapsed to "-".
 */
export function cinemaPortalPath(citySlug: string, cinema: Cinema): string {
  const slug = cinema.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `/${citySlug}/cines/caribbean-cinemas/${slug}`;
}

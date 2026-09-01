import Link from "next/link";
import MarkersMap, { type MapMarker } from "@/components/MarkersMap";
import { type MovieCardCinema } from "@/lib/cinema";

/**
 * Where a movie is playing: one block per cinema with its showtimes (each a
 * booking link on Caribbean Cinemas) and, optionally, a map of those cinemas.
 * Shared by the cartelera card, once expanded, and the movie's own page.
 */
export default function MovieShowtimes({
  movieName,
  cinemas,
  showMap = true,
  compact = false,
}: {
  movieName: string;
  cinemas: MovieCardCinema[];
  showMap?: boolean;
  compact?: boolean;
}) {
  const markers: MapMarker[] = cinemas.map((cinema) => ({
    id: cinema.id,
    name: `Caribbean Cinemas ${cinema.name}`,
    url: cinema.portalPath,
    address: cinema.address,
    latitude: cinema.lat,
    longitude: cinema.lng,
    logo: "/caribbean-cinemas-logo.png",
  }));

  return (
    <div
      className={`grid gap-6 ${compact ? "p-3" : "p-4"} ${
        showMap ? "lg:grid-cols-2" : ""
      }`}
    >
      <div className="space-y-4">
        {cinemas.map((cinema) => (
          <div key={cinema.id}>
            <p className="font-semibold">
              <Link href={cinema.portalPath} className="hover:text-brand-600">
                🎬 Caribbean Cinemas {cinema.name}
              </Link>
            </p>
            <p className="text-xs text-neutral-500">{cinema.address}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {cinema.showtimes.map((showtime) => (
                <a
                  key={showtime.id}
                  href={showtime.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Reservar en ${cinema.name}`}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
                >
                  {showtime.time}
                  {showtime.badge && (
                    <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-neutral-400">
                      {showtime.badge}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      {showMap && (
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-600">
            Cines que presentan {movieName}
          </p>
          <MarkersMap markers={markers} />
        </div>
      )}
    </div>
  );
}

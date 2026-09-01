// Finds a good official YouTube trailer for a movie by scraping YouTube's
// search results (ytInitialData), preferring Spanish results. Used instead of
// Caribbean Cinemas' own trailer uploads, which carry their watermark.
// Results are cached for a week; on any failure the caller keeps the
// Caribbean Cinemas trailer as fallback.

const REVALIDATE_SECONDS = 604_800; // 7 days

interface VideoResult {
  id: string;
  title: string;
  channel: string;
  seconds: number;
}

function lengthToSeconds(text: string | undefined): number {
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function collectVideos(node: unknown, out: VideoResult[]): void {
  if (!node || typeof node !== "object" || out.length >= 12) return;
  const record = node as Record<string, unknown>;
  const renderer = record.videoRenderer as
    | {
        videoId?: string;
        title?: { runs?: { text?: string }[] };
        ownerText?: { runs?: { text?: string }[] };
        lengthText?: { simpleText?: string };
      }
    | undefined;
  if (renderer?.videoId) {
    out.push({
      id: renderer.videoId,
      title: renderer.title?.runs?.[0]?.text ?? "",
      channel: renderer.ownerText?.runs?.[0]?.text ?? "",
      seconds: lengthToSeconds(renderer.lengthText?.simpleText),
    });
    return;
  }
  for (const key in record) collectVideos(record[key], out);
}

/**
 * Best YouTube trailer id for a movie, or null when the search fails or
 * nothing suitable shows up (caller falls back to the cinema's own trailer).
 */
export async function findYoutubeTrailer(
  movieName: string,
): Promise<string | null> {
  try {
    const query = encodeURIComponent(
      `${movieName} tráiler oficial español latino`,
    );
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${query}`,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "accept-language": "es-419,es;q=0.9",
        },
        next: { revalidate: REVALIDATE_SECONDS },
      },
    );
    if (!res.ok) return null;
    const html = await res.text();

    const marker = "ytInitialData = ";
    const start = html.indexOf(marker);
    if (start === -1) return null;
    const end = html.indexOf(";</script>", start);
    if (end === -1) return null;
    const data = JSON.parse(html.slice(start + marker.length, end));

    const videos: VideoResult[] = [];
    collectVideos(data, videos);

    const candidates = videos.filter(
      (v) =>
        /tr[aá]iler|trailer|avance|teaser/i.test(v.title) &&
        !/caribbean/i.test(v.channel) &&
        v.seconds > 30 &&
        v.seconds < 600,
    );
    // The trailer must be in Latin American Spanish: prefer "latino", then
    // any Spanish (dubbed/subtitled) marker, then whatever is left.
    const match =
      candidates.find((v) => /latino/i.test(v.title)) ??
      candidates.find((v) =>
        /espa[ñn]ol|subtitulad|doblad/i.test(v.title + " " + v.channel),
      ) ??
      candidates[0];
    return match?.id ?? null;
  } catch {
    return null;
  }
}

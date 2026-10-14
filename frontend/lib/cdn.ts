// The CDN in front of the portal (Cloudflare). It keeps every prerendered page
// at its edge for the `s-maxage` Next.js sends it with — ten minutes — so a
// publish in the CMS or a visitor's review would reach the portal and not the
// edge until then. This is what empties the edge when that happens.
//
// Server-only, and a no-op until both settings exist: CLOUDFLARE_ZONE_ID and
// CLOUDFLARE_API_TOKEN (a token scoped to "Zone → Cache Purge" on this zone).
// They are runtime settings of the App Service, not build ones.

const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

/** Whether a CDN is caching the portal's pages, and so has to be purged. */
export function cdnConfigured(): boolean {
  return Boolean(ZONE_ID && API_TOKEN);
}

/**
 * How long the edge waits after the last request to purge before purging, and
 * how long it waits at most. The CMS calls /api/revalidate once per node
 * published, and an agent pass publishes hundreds of them: purging on every
 * call would empty the edge hundreds of times in a row and run into the purge
 * API's rate limit. So the purges of a burst are folded into one, sent once it
 * settles — or two minutes after it started, if it never does.
 */
const QUIET_MS = 20_000;
const MAX_WAIT_MS = 120_000;

let pending: ReturnType<typeof setTimeout> | null = null;
let burstStarted = 0;

/**
 * Empties the edge shortly — see QUIET_MS. Everything goes, not only the
 * pages that changed: a publish can move a place into or out of any listing,
 * the city's front page and the search index, and what else the edge holds
 * (scripts, images) is cheap to fetch again from the origin, which keeps its
 * own copies.
 */
export function purgeCdnSoon(): void {
  if (!cdnConfigured()) return;
  const now = Date.now();
  if (pending) clearTimeout(pending);
  else burstStarted = now;
  const wait = Math.min(QUIET_MS, Math.max(0, burstStarted + MAX_WAIT_MS - now));
  pending = setTimeout(() => {
    pending = null;
    void purgeEverything();
  }, wait);
}

/**
 * A purge that fails is logged and nothing more: the page is already fresh at
 * the origin, and the edge catches up on its own within the ten minutes.
 */
async function purgeEverything(): Promise<void> {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purge_everything: true }),
      },
    );
    if (!res.ok) {
      console.error(`Cloudflare purge failed: ${res.status} ${await res.text()}`);
    }
  } catch (error) {
    console.error("Cloudflare purge failed", error);
  }
}

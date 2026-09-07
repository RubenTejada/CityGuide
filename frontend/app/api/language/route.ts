import { getItem } from "@/lib/cms";
import {
  DEFAULT_LOCALE,
  isLocale,
  localePrefix,
  withoutLocale,
  type Locale,
} from "@/lib/i18n";

/**
 * Sends the visitor to the same page in the other language.
 *
 * Content pages have a different path in each language — the section segments are
 * translated — so the page is looked up by the path it was reached at, and its
 * counterpart is read by id, which is the one thing both cultures share. Pages the
 * CMS does not own (contact, search) and content nobody has translated fall back to
 * the same path under the other language's prefix, which is right for the first and
 * lands on the city's front page for the second rather than on a 404.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("to") ?? "";
  const target: Locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  const from = url.searchParams.get("path") ?? "/";

  const [pathOnly, query] = from.split("?");
  const bare = withoutLocale(pathOnly);
  const source: Locale = pathOnly.startsWith("/en") ? "en" : "es";

  // A page the CMS does not own (contact, search) is the same page under the other
  // prefix. A page it does own but nobody has translated has no counterpart at all,
  // and sending the visitor to a path that 404s is worse than sending them to the
  // city's front page in the language they asked for.
  let destination = `${localePrefix(target)}${bare}`;
  const item = await getItem(pathOnly, undefined, source);
  if (item) {
    const translated = await getItem(`/${item.id}`, undefined, target);
    destination = translated?.route?.path
      ? translated.route.path
      : `${localePrefix(target)}/${bare.split("/").filter(Boolean)[0] ?? ""}`;
  }

  // A relative Location, not an absolute one: behind Azure's proxy the request
  // URL's origin is the container's internal address ("https://9ed54d…:8080"),
  // and redirecting there sends the visitor somewhere that does not resolve.
  return new Response(null, {
    status: 307,
    headers: { Location: `${destination}${query ? `?${query}` : ""}` },
  });
}

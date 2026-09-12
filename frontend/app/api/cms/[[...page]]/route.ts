import { getItem } from "@/lib/cms";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/** The backoffice the editor is sent to. Same host the Delivery API is read from. */
const CMS_URL = process.env.UMBRACO_BASE_URL ?? "http://localhost:54509";

/**
 * Opens the node behind a page in the Umbraco backoffice: append "/cms" to any
 * portal URL and the editor lands on that node's editing workspace, instead of
 * hunting for it down the content tree. `proxy.ts` is what turns the suffix into
 * this request, and it carries the page as path segments rather than as a query
 * string, which a rewrite does not hand a Route Handler.
 *
 * The path is looked up in the language it was reached in — the node id is the one
 * thing both cultures share, so either URL opens the same node. A path the CMS does
 * not own (contact, search, a typo) has no node to open, and the content section
 * root is a better landing place than a 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page?: string[] }> },
) {
  const { page = [] } = await params;
  const path = `/${page.join("/")}`;
  const locale: Locale = page[0] === "en" ? "en" : DEFAULT_LOCALE;

  const item = page.length ? await getItem(path, undefined, locale) : null;
  const destination = item
    ? `${CMS_URL}/umbraco/section/content/workspace/document/edit/${item.id}`
    : `${CMS_URL}/umbraco/section/content`;

  return new Response(null, {
    status: 307,
    headers: { Location: destination, "Cache-Control": "no-store" },
  });
}

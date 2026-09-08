import Link from "next/link";
import { subcategoryIcon } from "@/lib/sections";
import { isUnder, type UmbracoItem } from "@/lib/umbraco";

/**
 * The subcategories of a section, as links, closing its listing.
 *
 * The dropdown above narrows the same listing in place, which is what a
 * visitor wants and what a crawler cannot follow: a filter is client state
 * written to the query string, so it puts no link in the HTML and every URL it
 * makes canonicalises back to the bare listing. Without these the subcategory
 * pages — and every place under them past the first page of the section — are
 * reachable only from the sitemap, which is what makes a search engine treat
 * them as orphans and index almost none of them.
 *
 * They sit under the pagination rather than under the heading: filtering here
 * and leaving for another page are two different intentions, and stacked
 * together above the cards they read as one control offered twice. A link is
 * followed wherever it sits on the page. Each chip carries how many entries
 * the subcategory holds, which is also what tells a visitor where the weight
 * of the section is.
 *
 * A subcategory nothing is filed under yet is left out: an empty page is not
 * worth a link, and it is what the filter dropdown already does with its own
 * options.
 */
export default function SubcategoryLinks({
  label,
  subcategories,
  entries,
}: {
  label: string;
  subcategories: UmbracoItem[];
  entries: UmbracoItem[];
}) {
  const listed = subcategories
    .map((sub) => ({
      sub,
      count: entries.filter((entry) => isUnder(sub, entry)).length,
    }))
    .filter(({ count }) => count > 0);

  if (listed.length === 0) return null;

  return (
    <nav aria-label={label} className="mt-12 border-t border-neutral-200 pt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {listed.map(({ sub, count }) => (
          <li key={sub.id}>
            <Link
              href={sub.route.path}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-brand-600 hover:text-brand-700"
            >
              <span aria-hidden>{subcategoryIcon(sub.route.path)}</span>
              {sub.name}
              <span className="tabular-nums text-neutral-400">{count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

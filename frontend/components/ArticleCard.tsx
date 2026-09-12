import PhotoFit from "@/components/PhotoFit";
import Link from "next/link";
import { text, type UmbracoItem } from "@/lib/umbraco";
import { INTL_LOCALE, t, type Locale } from "@/lib/i18n";
import { sectionListImage } from "@/lib/sections";

export function articleDate(article: UmbracoItem, locale: Locale): string {
  const value = article.properties["publishDate"];
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "long",
  }).format(date);
}

/**
 * Full-width horizontal article card: photo left, text right (stacked on mobile).
 * `compact` encoge la foto para las listas donde el artículo es un aparte y no
 * el contenido principal — la portada de la ciudad.
 */
export default function ArticleCard({
  locale,
  article,
  compact = false,
}: {
  locale: Locale;
  article: UmbracoItem;
  compact?: boolean;
}) {
  const photo =
    text(article, "heroImageUrl") || sectionListImage(article.route.path);
  const category = text(article, "category");
  return (
    <Link
      href={article.route.path}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md sm:flex-row"
    >
      <div
        className={`relative flex-none bg-neutral-200 sm:h-auto ${
          compact ? "h-24 sm:w-24 md:w-32" : "h-40 sm:w-48 md:w-56"
        }`}
      >
        <PhotoFit
          src={photo}
          alt={article.name}
          className="transition duration-300 group-hover:scale-105"
          sizes={
            compact
              ? "(min-width: 640px) 128px, 100vw"
              : "(min-width: 640px) 224px, 100vw"
          }
        />
        {category && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            {category}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {articleDate(article, locale)}
        </p>
        <h3 className="mt-1 text-lg font-semibold leading-snug group-hover:text-brand-600">
          {article.name}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm text-neutral-600">
          {text(article, "summary")}
        </p>
        <p className="mt-auto pt-3 text-sm font-medium text-brand-600">
          {t(locale).article.read}
        </p>
      </div>
    </Link>
  );
}

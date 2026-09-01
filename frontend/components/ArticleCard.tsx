import Image from "next/image";
import Link from "next/link";
import { text, type UmbracoItem } from "@/lib/umbraco";
import { sectionListImage } from "@/lib/sections";

export function articleDate(article: UmbracoItem): string {
  const value = article.properties["publishDate"];
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-DO", { dateStyle: "long" }).format(date);
}

/** Full-width horizontal article card: photo left, text right (stacked on mobile). */
export default function ArticleCard({ article }: { article: UmbracoItem }) {
  const photo =
    text(article, "heroImageUrl") || sectionListImage(article.route.path);
  const category = text(article, "category");
  return (
    <Link
      href={article.route.path}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md sm:flex-row"
    >
      <div className="relative h-40 flex-none bg-neutral-200 sm:h-auto sm:w-48 md:w-56">
        <Image
          src={photo}
          alt={article.name}
          fill
          unoptimized={photo.endsWith(".svg")}
          className="object-cover transition duration-300 group-hover:scale-105"
          sizes="(min-width: 640px) 224px, 100vw"
        />
        {category && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            {category}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {articleDate(article)}
        </p>
        <h3 className="mt-1 text-lg font-semibold leading-snug group-hover:text-brand-600">
          {article.name}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm text-neutral-600">
          {text(article, "summary")}
        </p>
        <p className="mt-auto pt-3 text-sm font-medium text-brand-600">
          Leer artículo…
        </p>
      </div>
    </Link>
  );
}

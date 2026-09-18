import Link from "next/link";
import SiteLogo from "@/components/SiteLogo";
import { localeHref, type Locale } from "@/lib/i18n";
import type { LegalDocument } from "@/lib/legal";

/**
 * La política de privacidad y los términos de uso: prosa larga a una columna. Son del
 * portal y no de una ciudad, así que viven fuera de `[city]` con la cabecera mínima de
 * la portada; el formulario de contacto al que remiten es el de Santo Domingo, que es
 * el mismo buzón para todas.
 */
export default function LegalPage({
  document,
  locale,
  updatedLabel,
}: {
  document: LegalDocument;
  locale: Locale;
  updatedLabel: string;
}) {
  return (
    <main className="flex-1">
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <Link href={localeHref(locale, "/")} aria-label="QueHacerRD.com">
            <SiteLogo className="text-2xl" locale={locale} />
          </Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold">{document.title}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {updatedLabel}: {document.updated}
        </p>
        {document.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.body.map((block, i) =>
              Array.isArray(block) ? (
                <ul key={i} className="mt-3 list-disc space-y-2 pl-5 text-neutral-700">
                  {block.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={i} className="mt-3 text-neutral-700">
                  {block}
                </p>
              ),
            )}
          </section>
        ))}
        <p className="mt-10">
          <Link
            href={localeHref(locale, "/santo-domingo/contacto")}
            className="font-medium text-brand-600 hover:underline"
          >
            {document.contact} →
          </Link>
        </p>
      </article>
    </main>
  );
}

import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { LEGAL, LEGAL_PATHS } from "@/lib/legal";
import { localeHref, otherLocale, t, localeParam } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/terminos">): Promise<Metadata> {
  const { lang } = await params;
  const locale = localeParam(lang);
  const other = otherLocale(locale);
  const document = LEGAL.terms[locale];
  return pageMetadata({
    title: document.title,
    description: document.description,
    path: localeHref(locale, LEGAL_PATHS.terms),
    locale,
    alternate: { locale: other, path: localeHref(other, LEGAL_PATHS.terms) },
  });
}

export default async function TermsPage({ params }: PageProps<"/[lang]/terminos">) {
  const { lang } = await params;
  const locale = localeParam(lang);
  return (
    <LegalPage
      document={LEGAL.terms[locale]}
      locale={locale}
      updatedLabel={t(locale).legal.updated}
    />
  );
}

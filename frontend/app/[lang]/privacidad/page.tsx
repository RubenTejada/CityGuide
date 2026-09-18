import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { LEGAL, LEGAL_PATHS } from "@/lib/legal";
import { localeHref, otherLocale, t, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/privacidad">): Promise<Metadata> {
  const { lang } = await params;
  const locale = lang as Locale;
  const other = otherLocale(locale);
  const document = LEGAL.privacy[locale];
  return pageMetadata({
    title: document.title,
    description: document.description,
    path: localeHref(locale, LEGAL_PATHS.privacy),
    locale,
    alternate: { locale: other, path: localeHref(other, LEGAL_PATHS.privacy) },
  });
}

export default async function PrivacyPage({ params }: PageProps<"/[lang]/privacidad">) {
  const { lang } = await params;
  const locale = lang as Locale;
  return (
    <LegalPage
      document={LEGAL.privacy[locale]}
      locale={locale}
      updatedLabel={t(locale).legal.updated}
    />
  );
}

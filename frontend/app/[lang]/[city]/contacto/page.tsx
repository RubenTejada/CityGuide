import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ContactForm from "@/components/ContactForm";
import { pageMetadata } from "@/lib/seo";
import { getItem } from "@/lib/cms";
import { localeHref, otherLocale, t, type Locale } from "@/lib/i18n";

export const revalidate = 600;

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/[city]/contacto">): Promise<Metadata> {
  const { lang, city: citySlug } = await params;
  const locale = lang as Locale;
  const words = t(locale).contact;
  const city = await getItem(`/${citySlug}`);
  const other = otherLocale(locale);
  return pageMetadata({
    title: words.heading,
    description: words.lead(city?.name ?? words.theCity),
    path: localeHref(locale, `/${citySlug}/contacto`),
    locale,
    // A code route, the same page in both languages under each one's prefix.
    alternate: {
      locale: other,
      path: localeHref(other, `/${citySlug}/contacto`),
    },
  });
}

export default async function ContactPage({
  params,
}: PageProps<"/[lang]/[city]/contacto">) {
  const { lang, city: citySlug } = await params;
  const locale = lang as Locale;
  const words = t(locale).contact;
  const city = await getItem(`/${citySlug}`);
  if (!city || city.contentType !== "city") notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{words.heading}</h1>
      <p className="mt-2 text-neutral-600">{words.lead(city.name)}</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-neutral-600">
        <li>
          <strong className="font-semibold">{words.bullets.addLabel}</strong>{" "}
          {words.bullets.add}
        </li>
        <li>
          <strong className="font-semibold">{words.bullets.removeLabel}</strong>{" "}
          {words.bullets.remove}
        </li>
        <li>
          <strong className="font-semibold">{words.bullets.adsLabel}</strong>{" "}
          {words.bullets.ads}
        </li>
      </ul>
      <div className="mt-8">
        <ContactForm locale={locale} />
      </div>
    </main>
  );
}

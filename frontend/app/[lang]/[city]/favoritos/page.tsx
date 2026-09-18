import type { Metadata } from "next";
import PlaceCard from "@/components/PlaceCard";
import SignInButton from "@/components/account/SignInButton";
import { getItemsById } from "@/lib/cms";
import { localeHref, t, type Locale } from "@/lib/i18n";
import { getFavorites } from "@/lib/portalApi";
import { accountsEnabled, getSession, googleEnabled } from "@/lib/session";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/[city]/favoritos">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: t(lang as Locale).favorites.heading,
    robots: { index: false, follow: false },
  };
}

/**
 * Los lugares que el visitante guardó, de todas las ciudades, del más reciente al más
 * antiguo. Es la única página personal del portal: lee la sesión, así que se pinta en
 * cada petición y nunca entra en la caché ni en el índice.
 */
export default async function FavoritesPage({
  params,
}: PageProps<"/[lang]/[city]/favoritos">) {
  const { lang, city } = await params;
  const locale = lang as Locale;
  const words = t(locale).favorites;
  const session = await getSession();
  const places = session
    ? await getItemsById(await getFavorites(session.memberKey), locale)
    : [];
  const providers = { google: googleEnabled(), email: accountsEnabled() };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold">{words.heading}</h1>
      {!session ? (
        <>
          <p className="mt-2 text-neutral-600">{words.signIn}</p>
          {(providers.google || providers.email) && (
            <SignInButton
              providers={providers}
              next={localeHref(locale, `/${city}/favoritos`)}
              className="mt-6 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {t(locale).account.signIn}
            </SignInButton>
          )}
        </>
      ) : places.length === 0 ? (
        <p className="mt-2 text-neutral-600">{words.empty}</p>
      ) : (
        <>
          <p className="mt-2 text-neutral-600">{words.lead}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} locale={locale} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

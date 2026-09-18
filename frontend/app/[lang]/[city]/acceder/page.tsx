import type { Metadata } from "next";
import RedeemForm from "@/components/account/RedeemForm";
import SignInButton from "@/components/account/SignInButton";
import { t, type Locale } from "@/lib/i18n";
import { safeReturnPath } from "@/lib/reviews";
import { accountsEnabled, googleEnabled } from "@/lib/session";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/[city]/acceder">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: t(lang as Locale).account.redeemHeading,
    robots: { index: false, follow: false },
  };
}

/**
 * A donde llevan el enlace del correo y los errores de Google. Con `?token=` es un
 * botón que canjea el enlace — un filtro de correo que abre la página para revisarla
 * no lo gasta —; con `?error=` explica qué pasó y ofrece intentarlo de nuevo.
 */
export default async function SignInPage({
  params,
  searchParams,
}: PageProps<"/[lang]/[city]/acceder">) {
  const { lang } = await params;
  const locale = lang as Locale;
  const words = t(locale).account;
  const query = await searchParams;
  const read = (key: string) => {
    const value = query[key];
    return typeof value === "string" ? value : "";
  };
  const token = read("token");
  const next = safeReturnPath(read("next"));
  const error = read("error");
  const providers = { google: googleEnabled(), email: accountsEnabled() };

  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">{words.redeemHeading}</h1>
      {token ? (
        <>
          <p className="mt-3 text-neutral-600">{words.redeemLead}</p>
          <RedeemForm token={token} next={next} locale={locale} />
        </>
      ) : (
        <>
          <p className="mt-3 text-neutral-600">
            {error === "google"
              ? words.errors.google
              : error === "blocked"
                ? words.errors.blocked
                : words.redeemMissing}
          </p>
          {(providers.google || providers.email) && (
            <SignInButton
              providers={providers}
              next={next}
              className="mt-6 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {words.signIn}
            </SignInButton>
          )}
        </>
      )}
    </main>
  );
}

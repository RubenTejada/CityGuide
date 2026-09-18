// Entrar con Google: el ida y vuelta de OAuth 2 con PKCE (arctic) y lo que se guarda
// entre la ida y la vuelta. Solo de servidor.
//
// La dirección de vuelta se construye con NEXT_PUBLIC_SITE_URL y tiene que estar dada
// de alta, idéntica, en el cliente OAuth de Google Cloud:
//   {NEXT_PUBLIC_SITE_URL}/api/auth/google/callback

import { Google } from "arctic";
import { SITE_URL } from "@/lib/seo";
import { localePrefix, withoutLocale, type Locale } from "@/lib/i18n";

export const STATE_COOKIE = "qh_oauth_state";
export const VERIFIER_COOKIE = "qh_oauth_verifier";
export const RETURN_COOKIE = "qh_oauth_return";

/** Diez minutos para volver de Google; lo que tarde más empieza de nuevo. */
export const OAUTH_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export function googleClient(): Google {
  return new Google(
    process.env.GOOGLE_CLIENT_ID ?? "",
    process.env.GOOGLE_CLIENT_SECRET ?? "",
    `${SITE_URL}/api/auth/google/callback`,
  );
}

/** El idioma de la página a la que se vuelve. */
export function localeOfPath(path: string): Locale {
  return path === "/en" || path.startsWith("/en/") ? "en" : "es";
}

/**
 * La página de acceso de la ciudad de la que se viene, que es donde se explica un
 * error y se ofrece probar de nuevo. Sin ciudad en la ruta, la portada.
 */
export function signInPage(returnPath: string, error: string): string {
  const locale = localeOfPath(returnPath);
  const city = withoutLocale(returnPath.split("?")[0]).split("/").filter(Boolean)[0];
  if (!city) return returnPath;
  const query = new URLSearchParams({ error, next: returnPath });
  return `${localePrefix(locale)}/${city}/acceder?${query}`;
}

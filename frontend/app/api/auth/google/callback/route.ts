import { decodeIdToken } from "arctic";
import { cookies } from "next/headers";
import {
  RETURN_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  googleClient,
  localeOfPath,
  signInPage,
} from "@/lib/googleAuth";
import { signInMember } from "@/lib/portalApi";
import { safeReturnPath } from "@/lib/reviews";
import { createSession, googleEnabled } from "@/lib/session";

interface GoogleClaims {
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/**
 * La vuelta de Google. El estado tiene que ser el que se guardó a la ida (o la vuelta
 * no la pidió este navegador), el código se canjea con el verificador PKCE, y del
 * token de identidad — que llega directo de Google por TLS, no del navegador — se toma
 * el correo, solo si Google lo da por verificado: es la identidad del miembro en el CMS.
 *
 * Las redirecciones son relativas, como en /api/language: detrás del proxy de Azure el
 * origen de la petición es la dirección interna del contenedor.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const next = safeReturnPath(jar.get(RETURN_COOKIE)?.value);
  const expectedState = jar.get(STATE_COOKIE)?.value;
  const verifier = jar.get(VERIFIER_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  jar.delete(VERIFIER_COOKIE);
  jar.delete(RETURN_COOKIE);

  const redirect = (location: string) =>
    new Response(null, { status: 303, headers: { Location: location } });
  const fail = (reason: string) => redirect(signInPage(next, reason));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!googleEnabled() || !code || !state || !verifier || state !== expectedState) {
    // El visitante cerró la pantalla de Google o volvió con una pestaña vieja.
    return url.searchParams.get("error") === "access_denied" ? redirect(next) : fail("google");
  }

  let claims: GoogleClaims;
  try {
    const tokens = await googleClient().validateAuthorizationCode(code, verifier);
    claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
  } catch {
    return fail("google");
  }

  if (!claims.email || claims.email_verified !== true) return fail("google");

  const member = await signInMember(claims.email, claims.name ?? "", localeOfPath(next));
  if (!member.ok) return fail(member.status === 403 ? "blocked" : "google");

  await createSession({ memberKey: member.data.key, name: member.data.name });
  return redirect(next);
}

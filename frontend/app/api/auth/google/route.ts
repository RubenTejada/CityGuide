import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import {
  OAUTH_COOKIE,
  RETURN_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  googleClient,
} from "@/lib/googleAuth";
import { safeReturnPath } from "@/lib/reviews";
import { googleEnabled } from "@/lib/session";

/**
 * La ida a Google: guarda el estado, el verificador PKCE y la página a la que volver,
 * y manda al visitante a la pantalla de consentimiento. `?next=` es esa página.
 */
export async function GET(request: Request) {
  const next = safeReturnPath(new URL(request.url).searchParams.get("next"));
  if (!googleEnabled()) {
    return new Response(null, { status: 307, headers: { Location: next } });
  }

  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = googleClient().createAuthorizationURL(state, verifier, [
    "openid",
    "profile",
    "email",
  ]);
  // Que Google pregunte con qué cuenta, en vez de entrar con la última sin decirlo.
  url.searchParams.set("prompt", "select_account");

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, OAUTH_COOKIE);
  jar.set(VERIFIER_COOKIE, verifier, OAUTH_COOKIE);
  jar.set(RETURN_COOKIE, next, OAUTH_COOKIE);

  return new Response(null, { status: 307, headers: { Location: url.toString() } });
}

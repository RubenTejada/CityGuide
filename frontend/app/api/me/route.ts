import type { AccountState } from "@/lib/reviews";
import { accountsEnabled, getSession, googleEnabled } from "@/lib/session";

/**
 * Quién está dentro, para la cabecera. Lo pide el navegador en vez de leerlo el
 * servidor al pintar la página: leer la cookie en el layout volvería dinámica cada
 * página del portal y la sacaría de la caché ISR, por un nombre en una esquina.
 */
export async function GET() {
  const session = await getSession();
  const body: AccountState = {
    user: session ? { name: session.name } : null,
    providers: { google: googleEnabled(), email: accountsEnabled() },
  };
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

import { getPlaceAccount } from "@/lib/portalApi";
import type { PlaceAccountState } from "@/lib/reviews";
import { accountsEnabled, getSession, googleEnabled } from "@/lib/session";

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lo que los controles de una ficha necesitan saber del visitante: si está dentro, su
 * opinión sobre el lugar y si lo guardó. La ficha se sirve igual a todos desde la
 * caché; esto es lo único personal, y se pide aparte desde el navegador.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/me/place/[id]">,
) {
  const { id } = await params;
  const session = await getSession();
  const own =
    session && KEY.test(id)
      ? await getPlaceAccount(id, session.memberKey)
      : { mine: null, favorite: false };
  const body: PlaceAccountState = {
    user: session ? { name: session.name } : null,
    providers: { google: googleEnabled(), email: accountsEnabled() },
    ...own,
  };
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

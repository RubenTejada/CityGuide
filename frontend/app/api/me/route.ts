import { deleteMember } from "@/lib/portalApi";
import type { AccountState } from "@/lib/reviews";
import { accountsEnabled, deleteSession, getSession, googleEnabled } from "@/lib/session";

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

/**
 * "Borrar mi cuenta": el CMS borra al miembro, y con él sus opiniones y favoritos, y
 * aquí se cierra la sesión — una cookie que nombra a un miembro que ya no existe no
 * sirve para nada, pero tampoco tiene por qué quedarse.
 */
export async function DELETE() {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const result = await deleteMember(session.memberKey);
  // Ya no existe: el objetivo del visitante está cumplido igual.
  if (!result.ok && result.status !== 404) {
    return new Response(null, { status: result.status });
  }

  await deleteSession();
  return new Response(null, { status: 204 });
}

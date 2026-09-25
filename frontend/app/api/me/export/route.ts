import { exportMember } from "@/lib/portalApi";
import { getSession } from "@/lib/session";

/**
 * "Descargar mis datos": la cuenta, las opiniones y los favoritos del visitante en un
 * JSON que el navegador guarda como archivo. Es el derecho de acceso de la Ley 172-13
 * sin tener que escribirnos para ejercerlo.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const result = await exportMember(session.memberKey);
  if (!result.ok) return new Response(null, { status: result.status });

  return new Response(JSON.stringify(result.data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="quehacerrd-mis-datos.json"',
      "Cache-Control": "private, no-store",
    },
  });
}

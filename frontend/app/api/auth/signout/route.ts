import { safeReturnPath } from "@/lib/reviews";
import { deleteSession } from "@/lib/session";

/** Cierra la sesión y vuelve a la página desde la que se pidió (un formulario POST). */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const next = form?.get("next");
  await deleteSession();
  return new Response(null, {
    status: 303,
    headers: { Location: safeReturnPath(typeof next === "string" ? next : null) },
  });
}

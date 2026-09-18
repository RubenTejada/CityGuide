// La sesión de un visitante: una cookie firmada que dice qué miembro del CMS es y
// cómo se llama. Sin estado en el servidor — el portal corre en un App Service sin
// base de datos propia —, así que lo que la cookie no puede es revocarse sola: eso
// lo hace el CMS, que se niega a escribir por un miembro bloqueado aunque la cookie
// siga siendo válida. Solo de servidor: la firma no puede salir de aquí.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "qh_session";
const LIFETIME_DAYS = 60;

export interface Session {
  /** La clave del miembro en el CMS. */
  memberKey: string;
  name: string;
}

function secretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

/**
 * Si las cuentas están configuradas: sin la firma de la sesión o sin el secreto que el
 * CMS exige, no hay nada que ofrecer, y el portal se queda como estaba — las opiniones
 * publicadas se leen igual, pero nadie puede entrar.
 */
export function accountsEnabled(): boolean {
  return Boolean(process.env.AUTH_SECRET && process.env.CMS_PORTAL_SECRET);
}

export function googleEnabled(): boolean {
  return (
    accountsEnabled() &&
    Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  );
}

export async function createSession(session: Session): Promise<void> {
  const key = secretKey();
  if (!key) return;
  const expires = new Date(Date.now() + LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.memberKey)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function getSession(): Promise<Session | null> {
  const key = secretKey();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload.sub
      ? { memberKey: payload.sub, name: String(payload.name ?? "") }
      : null;
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

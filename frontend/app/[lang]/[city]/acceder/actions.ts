"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, localePrefix, t } from "@/lib/i18n";
import { redeemLoginLink, sendLoginLink } from "@/lib/portalApi";
import { safeReturnPath } from "@/lib/reviews";
import { SITE_URL } from "@/lib/seo";
import { accountsEnabled, createSession } from "@/lib/session";

export interface LoginLinkState {
  status: "idle" | "sent" | "error";
  error?: string;
  email?: string;
}

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Pide el enlace de acceso por correo. Lo envía el CMS, que es quien tiene el servidor
 * de correo; el enlace lleva a la página de acceso de la ciudad desde la que se pidió,
 * que sabe a dónde volver después.
 */
export async function requestLoginLink(
  _prev: LoginLinkState,
  data: FormData,
): Promise<LoginLinkState> {
  const submitted = field(data, "locale");
  const locale = isLocale(submitted) ? submitted : DEFAULT_LOCALE;
  const words = t(locale).account.errors;
  const name = field(data, "name");
  const email = field(data, "email");
  const city = field(data, "city").replace(/[^a-z0-9-]/gi, "");
  const next = safeReturnPath(field(data, "next"));

  if (!accountsEnabled() || !city) return { status: "error", error: words.failed };
  if (name.length < 2) return { status: "error", error: words.name };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", error: words.email };
  }

  const link = `${SITE_URL}${localePrefix(locale)}/${city}/acceder?${new URLSearchParams({ next })}`;
  const result = await sendLoginLink(
    email,
    name,
    link,
    locale,
    (await headers()).get("x-forwarded-for"),
  );
  if (!result.ok) return { status: "error", error: result.error || words.failed };
  return { status: "sent", email };
}

export interface RedeemState {
  error?: string;
}

/**
 * Canjea el enlace. Lo hace un botón y no la visita a la página: los filtros de correo
 * abren los enlaces para revisarlos, y un enlace de un solo uso que se canjeara al
 * abrirlo le llegaría gastado a su dueño.
 */
export async function redeemLoginLinkAction(
  _prev: RedeemState,
  data: FormData,
): Promise<RedeemState> {
  const submitted = field(data, "locale");
  const locale = isLocale(submitted) ? submitted : DEFAULT_LOCALE;
  const result = await redeemLoginLink(field(data, "token"), locale);
  if (!result.ok) {
    return { error: result.error || t(locale).account.redeemMissing };
  }
  await createSession({ memberKey: result.data.key, name: result.data.name });
  redirect(safeReturnPath(field(data, "next")));
}

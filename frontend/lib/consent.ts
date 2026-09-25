// El consentimiento del visitante a la medición: Google Analytics, el píxel de Meta y
// los eventos que el servidor le manda a Meta (lib/metaCapi.ts). Nada de eso se carga
// ni se envía hasta que el visitante acepta — la Ley 172-13 pide un consentimiento
// expreso para tratar datos que no hacen falta para el servicio, y el RGPD alcanza a
// los turistas europeos a los que la versión inglesa se dirige.
//
// La elección vive en una cookie y no en localStorage porque el servidor también la
// lee: una Server Action no puede mirar el almacenamiento del navegador.

import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { META_PIXEL_ID } from "@/lib/meta";

export const CONSENT_COOKIE = "qh_consent";

export type Consent = "granted" | "denied";

/** Seis meses; después se vuelve a preguntar. */
const MAX_AGE = 60 * 60 * 24 * 182;

/** Sin medición configurada no hay nada que aceptar, y el aviso no se muestra. */
export const MEASUREMENT_ENABLED = Boolean(GA_MEASUREMENT_ID || META_PIXEL_ID);

export function parseConsent(value: string | undefined | null): Consent | null {
  return value === "granted" || value === "denied" ? value : null;
}

// --- Solo en el navegador -------------------------------------------------------

/** Lo que devuelve el store: la elección guardada y si el aviso está abierto a mano. */
export interface ConsentSnapshot {
  consent: Consent | null;
  editing: boolean;
}

const SERVER_SNAPSHOT: ConsentSnapshot = { consent: null, editing: false };
const listeners = new Set<() => void>();
let editing = false;
let snapshot: ConsentSnapshot | null = null;

function readCookie(): Consent | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  return parseConsent(match?.[1]);
}

function emit() {
  snapshot = null;
  listeners.forEach((listener) => listener());
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function consentSnapshot(): ConsentSnapshot {
  snapshot ??= { consent: readCookie(), editing };
  return snapshot;
}

/** El servidor no sabe qué eligió el visitante: ni aviso ni medición hasta hidratar. */
export function serverConsentSnapshot(): ConsentSnapshot {
  return SERVER_SNAPSHOT;
}

/** Vuelve a abrir el aviso, desde "Preferencias de cookies". */
export function editConsent() {
  editing = true;
  emit();
}

/**
 * Guarda la elección. Retirar un consentimiento ya dado borra las cookies que la
 * medición dejó y recarga la página: los scripts ya cargados no se pueden descargar,
 * y recargar es la única forma de que dejen de medir en esta misma visita.
 */
export function setConsent(consent: Consent) {
  const previous = readCookie();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${consent}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
  editing = false;
  if (previous === "granted" && consent === "denied") {
    clearMeasurementCookies();
    location.reload();
    return;
  }
  emit();
}

/** _ga, _ga_<id>, _gid, _fbp y _fbc, en el host y en el dominio que Google elige. */
function clearMeasurementCookies() {
  const names = document.cookie
    .split("; ")
    .map((pair) => pair.split("=")[0])
    .filter((name) => /^(_ga|_gid|_gat|_fbp|_fbc)/.test(name));
  const host = location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Path=/; Max-Age=0${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}

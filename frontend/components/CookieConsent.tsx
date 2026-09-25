"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "@/components/LocaleProvider";
import {
  consentSnapshot,
  editConsent,
  MEASUREMENT_ENABLED,
  serverConsentSnapshot,
  setConsent,
  subscribeConsent,
  type Consent,
} from "@/lib/consent";
import { localeHref, t } from "@/lib/i18n";
import { LEGAL_PATHS } from "@/lib/legal";

function useConsentState() {
  return useSyncExternalStore(subscribeConsent, consentSnapshot, serverConsentSnapshot);
}

/** Lo que el visitante eligió; null mientras no elige, y siempre en el servidor. */
export function useConsent(): Consent | null {
  return useConsentState().consent;
}

/**
 * El aviso de cookies, abajo y sin tapar la página: se puede seguir navegando sin
 * contestar, y mientras tanto no se mide nada. Aceptar y rechazar pesan lo mismo, que
 * es lo que hace libre la elección.
 */
export default function CookieConsent() {
  const locale = useLocale();
  const { consent, editing } = useConsentState();
  if (!MEASUREMENT_ENABLED || (consent && !editing)) return null;

  const words = t(locale).consent;
  const button =
    "flex-1 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:flex-none";
  return (
    <section
      role="region"
      aria-label={words.heading}
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-800 shadow-2xl"
    >
      <h2 className="font-semibold">{words.heading}</h2>
      <p className="mt-1 text-sm text-neutral-600">
        {words.body}{" "}
        <a
          href={localeHref(locale, LEGAL_PATHS.privacy)}
          className="underline hover:text-neutral-900"
        >
          {words.policy}
        </a>
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => setConsent("denied")}
          className={button}
        >
          {words.reject}
        </button>
        <button
          type="button"
          onClick={() => setConsent("granted")}
          className={button}
        >
          {words.accept}
        </button>
      </div>
    </section>
  );
}

/** "Preferencias de cookies", en el pie: vuelve a abrir el aviso. */
export function CookieSettingsButton({ className }: { className?: string }) {
  const locale = useLocale();
  if (!MEASUREMENT_ENABLED) return null;
  return (
    <button type="button" onClick={editConsent} className={className}>
      {t(locale).legal.cookieSettings}
    </button>
  );
}

"use client";

import { useLocale } from "@/components/LocaleProvider";
import { localeHref, t } from "@/lib/i18n";
import { LEGAL_PATHS } from "@/lib/legal";

/**
 * La línea pequeña bajo un botón que envía datos personales o publica algo: qué se
 * hace con ello, y el enlace a la política o a los términos que lo dicen entero. Se
 * abre en otra pestaña para no perder lo que el visitante ya escribió.
 */
export default function LegalNote({
  text,
  document,
  className = "mt-2 text-xs text-neutral-500",
}: {
  text: string;
  document: keyof typeof LEGAL_PATHS;
  className?: string;
}) {
  const locale = useLocale();
  return (
    <p className={className}>
      {text}{" "}
      <a
        href={localeHref(locale, LEGAL_PATHS[document])}
        target="_blank"
        className="underline hover:text-neutral-700"
      >
        {t(locale).legal[document]}
      </a>
    </p>
  );
}

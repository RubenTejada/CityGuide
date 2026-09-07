"use client";

import { useWords } from "@/components/LocaleProvider";

/**
 * De dónde salió el menú y cuándo se capturó, con la advertencia que hace falta: una
 * carta se copia una vez y el restaurante sigue cambiándola. La fecha es la del día en
 * que el portal la leyó, no la del menú, y por eso al lado va dicho que los precios
 * pueden no ser los de hoy.
 *
 * Va dentro del visor, con el menú delante, que es donde alguien está mirando un
 * precio — no bajo el botón, donde solo ocuparía la ficha.
 */
export default function MenuNote({
  source,
  captured,
  className = "",
}: {
  source: string | null;
  captured: string | null;
  className?: string;
}) {
  const words = useWords();
  const host = sourceHost(source);
  return (
    <div className={`text-xs ${className}`}>
      <p>
        {source && host && (
          <>
            {words.place.menuFrom}{" "}
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {host}
            </a>
            {captured && " · "}
          </>
        )}
        {captured && words.place.menuCaptured(captured)}
      </p>
      <p>{words.place.menuPricesMayChange}</p>
    </div>
  );
}

/** El origen lo escribe el agente, pero un editor puede corregirlo a mano: una
 *  dirección que no lo es se queda sin enlace en vez de romper la página. */
function sourceHost(source: string | null): string | null {
  try {
    return source ? new URL(source).host : null;
  } catch {
    return null;
  }
}

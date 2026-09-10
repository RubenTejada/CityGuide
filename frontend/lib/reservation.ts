// Reservas: lo que el formulario y el CMS acuerdan sobre una solicitud de mesa.
//
// El día de hoy se lee con `todayInDR` (lib/cinema.ts): el reloj dominicano ya lo
// tenía la cartelera, y "hoy" es el mismo para las dos.
//
// Puro y utilizable en el navegador, como lib/umbraco.ts: el modal es un componente de
// cliente y la Server Action valida con estos mismos límites, así que ninguno de los dos
// puede quedarse con una regla distinta.

import type { UmbracoItem } from "@/lib/umbraco";

/** Hasta cuántas personas acepta el formulario; más se habla por teléfono. */
export const MAX_PARTY = 30;

export const MAX_NOTES = 1000;

/** Con qué llega el formulario abierto: lo más común, y se cambia en un toque. */
export const DEFAULT_PARTY = 2;
export const DEFAULT_TIME = "19:30";

export interface ReservationSummary {
  /** "aaaa-mm-dd" y "HH:mm", tal como los entregan los campos del navegador. */
  date: string;
  time: string;
  partySize: number;
}

export interface ReservationState {
  status: "idle" | "sent" | "error";
  error?: string;
  /** Lo pedido, para repetírselo al visitante en la pantalla de confirmación. */
  summary?: ReservationSummary;
}

/**
 * Si la ficha del lugar ofrece el botón de reservar. Es un interruptor por nodo, no por
 * categoría: un restaurante recibe reservas porque quien lo lleva se comprometió a
 * responderlas. No se hereda de la empresa — la solicitud iría al correo de la cadena.
 */
export function acceptsReservations(item: UmbracoItem): boolean {
  return item.properties["acceptsReservations"] === true;
}

/** La fecha pedida, escrita como la lee una persona ("viernes 12 de septiembre"). */
export function formatReservationDate(date: string, locale: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(parsed);
}

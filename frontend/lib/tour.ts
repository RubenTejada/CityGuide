// Tours: lo que el portal sabe de una excursión y cómo se lee en pantalla.
//
// Un tour no es un lugar: no se visita una dirección, se planifica un día. Lo que
// decide entre uno y otro es cuánto dura, si pasan a buscarte, qué cubre y quién lo
// lleva — y eso es lo que hay aquí, en una sola pieza que leen la tarjeta, la ficha y
// los datos estructurados, para que los tres digan lo mismo.
//
// Puro y utilizable en el navegador, como lib/umbraco.ts.

import { INTL_LOCALE, type Locale } from "@/lib/i18n";
import { picked, prop, text, type UmbracoItem } from "@/lib/umbraco";

/** Cuánto dura, en horas; null cuando el nodo no lo dice. */
export function durationHours(item: UmbracoItem): number | null {
  const value = prop<number>(item, "durationHours");
  return typeof value === "number" && value > 0 ? value : null;
}

/**
 * "10 horas", "1,5 horas", "1 hora" — el número con el separador decimal del idioma
 * de la página, que en español es la coma.
 */
export function durationLabel(
  item: UmbracoItem,
  locale: Locale,
  words: { hour: string; hours: string },
): string | null {
  const hours = durationHours(item);
  if (hours === null) return null;
  const amount = new Intl.NumberFormat(INTL_LOCALE[locale], {
    maximumFractionDigits: 1,
  }).format(hours);
  return `${amount} ${hours === 1 ? words.hour : words.hours}`;
}

/** Si el operador pasa a buscar al visitante por su hotel. */
export function hasHotelPickup(item: UmbracoItem): boolean {
  return prop<boolean>(item, "hotelPickup") === true;
}

/** Qué incluye, una línea por punto, tal como se escribe en el backoffice. */
export function includedItems(item: UmbracoItem): string[] {
  return text(item, "includes")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * El precio desde el que sale, ya escrito ("Desde US$95"), o null: la mayoría de las
 * excursiones no tiene uno publicado, y el precio lo cotiza el operador. La moneda es
 * la que guarda el nodo, en dólares por defecto, que es como se cotiza una excursión
 * en esta costa.
 */
export function priceLabel(item: UmbracoItem, locale: Locale): string | null {
  const amount = prop<number>(item, "priceFrom");
  if (typeof amount !== "number" || amount <= 0) return null;
  const currency = text(item, "priceCurrency").toUpperCase() || "USD";
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Los operadores que la venden, ya expandidos por la Delivery API. */
export function tourOperators(item: UmbracoItem): UmbracoItem[] {
  return picked(item, "operators");
}

/** La temporada en la que se hace, cuando solo se hace en una. */
export function tourSeason(item: UmbracoItem): string {
  return text(item, "season");
}

/**
 * La línea que resume la excursión bajo su título: duración, recogida y temporada,
 * separadas por puntos. Es lo que decide de un vistazo si el plan cabe en el día.
 */
export function tourMeta(
  item: UmbracoItem,
  locale: Locale,
  words: { hour: string; hours: string; pickup: string },
): string[] {
  return [
    durationLabel(item, locale, words),
    hasHotelPickup(item) ? words.pickup : null,
    tourSeason(item) || null,
  ].filter((value): value is string => value !== null);
}

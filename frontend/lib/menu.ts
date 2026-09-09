import type { Locale } from "@/lib/i18n";
import { photoUrls, type UmbracoItem } from "@/lib/umbraco";

/** Un plato de la carta. El precio es la línea que escribe el menú ("RD$450",
 *  "Desde RD$284"), no un número: un menú dice más que una cifra. */
export type MenuDish = {
  name: string;
  price?: string;
  description?: string;
};

/** Una parte de la carta: "Entrantes", "Postres". */
export type MenuGroup = {
  name: string;
  items: MenuDish[];
};

/**
 * La carta que el agente guardó en "menuData", en el idioma de la página.
 *
 * Es un solo documento con los dos idiomas dentro — el nombre de la sección y la
 * descripción del plato vienen también en inglés, escritos por la misma llamada al
 * modelo — así que aquí solo se elige. El nombre del plato no se elige: un plato se
 * llama como se llama. Una descripción que no llegó en inglés no se enseña en español
 * en la página inglesa; la sección sí conserva su nombre español, porque una sección
 * sin nombre no es una sección.
 *
 * Lo que no case con la forma esperada se descarta sin romper la página: el valor lo
 * escribe un modelo y lo puede editar una persona en el backoffice.
 */
export function placeMenu(item: UmbracoItem, locale: Locale): MenuGroup[] {
  const raw = item.properties["menuData"];
  if (typeof raw !== "string" || raw.trim().length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const sections = (parsed as { sections?: unknown })?.sections;
  if (!Array.isArray(sections)) return [];

  const english = locale === "en";
  return sections
    .map((section): MenuGroup | null => {
      const { name, nameEn, items } = (section ?? {}) as Record<string, unknown>;
      if (typeof name !== "string" || !Array.isArray(items)) return null;
      const dishes = items
        .map((item): MenuDish | null => {
          const dish = (item ?? {}) as Record<string, unknown>;
          if (typeof dish.name !== "string" || dish.name.length === 0) return null;
          const description = english ? dish.descriptionEn : dish.description;
          return {
            name: dish.name,
            price: typeof dish.price === "string" ? dish.price : undefined,
            description:
              typeof description === "string" && description.length > 0
                ? description
                : undefined,
          };
        })
        .filter((dish): dish is MenuDish => dish !== null);
      if (dishes.length === 0) return null;
      return {
        name: english && typeof nameEn === "string" && nameEn.length > 0 ? nameEn : name,
        items: dishes,
      };
    })
    .filter((group): group is MenuGroup => group !== null);
}

/**
 * Si el portal tiene la carta de este lugar, en cualquiera de sus dos formas: las
 * páginas escaneadas o la carta que el modelo estructuró. Es lo que decide el filtro
 * "Con menú" de los listados, y no depende del idioma — un plato se llama igual en
 * los dos, y el listado se lee tal cual en la página inglesa.
 */
export function hasMenu(item: UmbracoItem): boolean {
  return photoUrls(item, "menu").length > 0 || placeMenu(item, "es").length > 0;
}

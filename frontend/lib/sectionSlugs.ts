import { DEFAULT_LOCALE, localePrefix, type Locale } from "./i18n";

/**
 * The portal's sections are configured by their Spanish slug — the section images,
 * the map pin glyphs, the schema.org business type, the handful of subcategories that
 * are really their category. Umbraco builds the English URL segment from the English
 * name, so under "/en" every one of those keys misses: "restaurants" is not
 * "restaurantes" and "shopping-malls" is not "plazas-comerciales-y-malls".
 *
 * Rather than keep two copies of every map, a path is reduced to its Spanish slugs
 * before any of them is read. The pairs come from the CMS itself — the English names
 * are curated in the agent (`TranslatedVocabulary`), so a section added there with a
 * new name needs a line here too, and until it gets one the page falls back to the
 * section's own defaults rather than breaking.
 */
const SPANISH_SLUG: Record<string, string> = {
  american: "americana",
  articles: "articulos",
  adventure: "aventura",
  attractions: "atracciones",
  banks: "bancos",
  bars: "bares",
  "bars-clubs": "bares-y-clubes",
  brazilian: "brasilena",
  "breakfast-brunch": "desayunos-y-brunch",
  "businesses-services": "empresas-y-servicios",
  "car-rentals": "rent-a-car",
  "clinics-hospitals": "clinicas-y-hospitales",
  "currency-exchange": "casas-de-cambio",
  "culture-history": "cultura-e-historia",
  "event-venues": "salones-de-eventos",
  chinese: "china",
  "clothing-fashion": "ropa-y-moda",
  "department-stores": "tiendas-por-departamento",
  "water-sports": "deportes-acuaticos",
  dominican: "criolla",
  entertainment: "entretenimiento",
  events: "eventos",
  fashion: "moda",
  "fast-food": "comida-rapida",
  food: "comida",
  french: "francesa",
  "islands-catamarans": "islas-y-catamaranes",
  italian: "italiana",
  japanese: "japonesa",
  "jewelry-accessories": "joyeria-y-accesorios",
  korean: "coreana",
  "lounges-rooftops": "lounges-y-rooftops",
  mediterranean: "mediterranea",
  mexican: "mexicana",
  "middle-eastern": "arabe",
  "money-transfers-shipping": "remesas-y-envios",
  "motorcycle-atv-rentals": "alquiler-de-motores-y-fourwheels",
  "movie-theaters": "cines",
  "nature-whales": "naturaleza-y-ballenas",
  nightclubs: "discotecas",
  other: "otros",
  "police-emergency": "policia-y-emergencias",
  "perfume-cosmetics": "perfumerias-y-cosmeticos",
  peruvian: "peruana",
  pharmacies: "farmacias",
  restaurants: "restaurantes",
  "sea-diving": "mar-y-buceo",
  seafood: "mariscos",
  services: "servicios",
  shoes: "calzado",
  shopping: "tiendas",
  "shopping-malls": "plazas-comerciales-y-malls",
  spanish: "espanola",
  "spas-massage": "spas-y-masajes",
  "steakhouse-grill": "parrilladas",
  "taxis-transfers": "taxis-y-traslados",
  supermarkets: "supermercados",
  "things-to-do": "que-hacer",
  "tour-operators": "tours-y-excursiones",
  vegetarian: "vegetariana",
};

const ENGLISH_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SPANISH_SLUG).map(([english, spanish]) => [spanish, english]),
);

/**
 * A section path the app builds itself, in the language it is being rendered in —
 * "/santo-domingo/cines/caribbean-cinemas" and
 * "/en/santo-domingo/movie-theaters/caribbean-cinemas". The segments are given in
 * Spanish, the way the rest of the code names them; a segment with no English
 * counterpart (a city, a company) is the same in both.
 */
export function localizedSectionPath(
  locale: Locale,
  ...spanishSegments: string[]
): string {
  const segments =
    locale === DEFAULT_LOCALE
      ? spanishSegments
      : spanishSegments.map((segment) => ENGLISH_SLUG[segment] ?? segment);
  return `${localePrefix(locale)}/${segments.join("/")}`;
}

/** The Spanish slug every section map is keyed by. A Spanish slug is already one. */
export function canonicalSlug(slug: string): string {
  return SPANISH_SLUG[slug] ?? slug;
}

/**
 * A route path with its section slugs in Spanish and its "/en" prefix dropped, so a
 * path from either language reads the same configuration. The city slug and a place's
 * own slug pass through: those are names, and a name is the same in both languages.
 */
export function canonicalPath(routePath: string): string {
  const segments = routePath.split("/").filter(Boolean);
  if (segments[0] === "en") segments.shift();
  return `/${segments.map(canonicalSlug).join("/")}`;
}

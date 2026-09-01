// Per-section default imagery, inherited by every descendant (subcategory
// places, company branches, mall establishments) that lacks its own photo:
// - list image: a real photo representing the section, used in listing cards
//   and detail headers (never an icon).
// - map icon: a small branded glyph used inside map pins, stored separately
//   in /public/sections/icons/ so lists and maps can differ.

/** Curated real photos (Wikimedia Commons) representing each section. */
export const SECTION_LIST_IMAGES: Record<string, string> = {
  restaurantes:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Al-fresco_dining_in_Marbella%2C_province_of_M%C3%A1laga%2C_Spain_2013-09-06_-_panoramio_95942885.jpg/1280px-Al-fresco_dining_in_Marbella%2C_province_of_M%C3%A1laga%2C_Spain_2013-09-06_-_panoramio_95942885.jpg",
  "bares-y-clubes":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/DFC_4574_Late-night_drinks_in_Pattaya_-_a_chilled_cocktail_with_a_slice_of_lime_and_neon_reflections.jpg/1280px-DFC_4574_Late-night_drinks_in_Pattaya_-_a_chilled_cocktail_with_a_slice_of_lime_and_neon_reflections.jpg",
  tiendas:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/DFC_2457_Interior_view_of_a_multi-level_shopping_mall_with_escalators_glass_railings_and_shoppers_moving_between_floors_under_bright_overhead_lighting.jpg/1280px-DFC_2457_Interior_view_of_a_multi-level_shopping_mall_with_escalators_glass_railings_and_shoppers_moving_between_floors_under_bright_overhead_lighting.jpg",
  cines:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Columbia_City_Cinema_main_hall.jpg/1280px-Columbia_City_Cinema_main_hall.jpg",
  "empresas-y-servicios":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Bonn%2C_Post-Tower_--_2017_--_2128.jpg/1280px-Bonn%2C_Post-Tower_--_2017_--_2128.jpg",
  atracciones:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Santo_Domingo_-_Alcazar_de_Colon_01.JPG/1280px-Santo_Domingo_-_Alcazar_de_Colon_01.JPG",
  eventos:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Heritage_Live_concert_crowd_and_stage_at_Sandringham_2023_-_geograph.org.uk_-_7586057.jpg/1280px-Heritage_Live_concert_crowd_and_stage_at_Sandringham_2023_-_geograph.org.uk_-_7586057.jpg",
  "que-hacer":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Dominican_Republic%2C_Santo_Domingo%2C_Calle_El_Conde.jpg/1280px-Dominican_Republic%2C_Santo_Domingo%2C_Calle_El_Conde.jpg",
  articulos:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Catedral_Primada_CCSD_09_2018_1234.jpg/1280px-Catedral_Primada_CCSD_09_2018_1234.jpg",
};

/** Section slugs that have a bundled map icon in /public/sections/icons/. */
const SECTION_MAP_ICON_SLUGS = new Set([
  "restaurantes",
  "bares-y-clubes",
  "tiendas",
  "cines",
  "empresas-y-servicios",
  "atracciones",
  "eventos",
]);

/** The section a content path belongs to: /<ciudad>/<seccion>/... */
function sectionSlug(routePath: string): string {
  return routePath.split("/").filter(Boolean)[1] ?? "";
}

/** Representative photo of the section a content path belongs to. */
export function sectionListImage(routePath: string): string {
  return SECTION_LIST_IMAGES[sectionSlug(routePath)] ?? "/sections/default.svg";
}

/** Map-pin icon of the section a content path belongs to. */
export function sectionMapIcon(routePath: string): string {
  const section = sectionSlug(routePath);
  return SECTION_MAP_ICON_SLUGS.has(section)
    ? `/sections/icons/${section}.svg`
    : "/sections/icons/default.svg";
}

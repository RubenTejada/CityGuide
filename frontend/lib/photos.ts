/**
 * Curated photos (Wikimedia Commons) for content the CMS holds without one.
 *
 * Everything the agent discovers arrives with a picture; what the seeder writes does
 * not — a city opens with its attractions and its excursions before any paid pass has
 * run, and a page of grey boxes is what the visitor would see. So the portal keeps a
 * table of real photos for exactly that content, keyed by slug (or "<ciudad>/<slug>"
 * where the same name belongs to two cities: every city has a Parque Duarte). A photo
 * set in the backoffice always wins — this is the floor, not the source.
 *
 * Pure and usable in the browser: the cards read it on render and so does the metadata
 * pass, which is why it lives here and not inside a component.
 */

/** Attractions and excursions, by the slug of their own page. */
const CURATED_PHOTOS: Record<string, string> = {
  // Atracciones
  "santiago/monumento-a-los-heroes-de-la-restauracion":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Santiago_de_los_Caballeros_-_Monumento_a_los_H%C3%A9roes_de_la_Restauraci%C3%B3n_0772.JPG/1280px-Santiago_de_los_Caballeros_-_Monumento_a_los_H%C3%A9roes_de_la_Restauraci%C3%B3n_0772.JPG",
  "santiago/centro-leon":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Centro_Leon_Santiago.JPG/1280px-Centro_Leon_Santiago.JPG",
  "santiago/gran-teatro-del-cibao":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/GTC_Santiago.JPG/1280px-GTC_Santiago.JPG",
  "santiago/fortaleza-san-luis":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Fortaleza_San_Luis_%28Santiago%2C_Republica_Dominicana%29.jpg/1280px-Fortaleza_San_Luis_%28Santiago%2C_Republica_Dominicana%29.jpg",
  "santiago/parque-duarte":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Park_Duarte_met_Catedral_Santiago_Ap%C3%B3stol_212.jpg/1280px-Park_Duarte_met_Catedral_Santiago_Ap%C3%B3stol_212.jpg",
  "santiago/catedral-santiago-apostol":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Catedral_Santiago_Ap%C3%B3stol-IMG_0136.JPG/1280px-Catedral_Santiago_Ap%C3%B3stol-IMG_0136.JPG",
  "punta-cana/playa-bavaro":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/RD_Punta_Cana_12_2017_6547.jpg/1280px-RD_Punta_Cana_12_2017_6547.jpg",
  "punta-cana/playa-el-cortecito":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/2024_-_B%C3%A1varo_Beach_-_44.jpg/1280px-2024_-_B%C3%A1varo_Beach_-_44.jpg",
  "punta-cana/playa-macao":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Playa_Macao.jpg/1280px-Playa_Macao.jpg",
  "punta-cana/scape-park":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Dominican_Republic_Hoyo_Azul.jpg/1280px-Dominican_Republic_Hoyo_Azul.jpg",
  "juan-dolio-y-guayacanes/playa-juan-dolio":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Juan_Dolio_Beach_1.jpg/1280px-Juan_Dolio_Beach_1.jpg",
  "juan-dolio-y-guayacanes/bulevar-de-juan-dolio":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Juan_Dolio_Beach_2.jpg/1280px-Juan_Dolio_Beach_2.jpg",
  "juan-dolio-y-guayacanes/playa-guayacanes":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Quiet_Sea_-_panoramio.jpg/1280px-Quiet_Sea_-_panoramio.jpg",
  "punta-cana/marina-cap-cana":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Cap_Cana_Marina_Dominican_Republic.jpg/1280px-Cap_Cana_Marina_Dominican_Republic.jpg",
  "malecon-de-santo-domingo":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg/1280px-Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg",
  "parque-zoologico-nacional":
    "https://upload.wikimedia.org/wikipedia/commons/7/74/Flamingos_%2833322097221%29.jpg",
  "jardin-botanico-nacional":
    "https://upload.wikimedia.org/wikipedia/commons/0/07/Jard%C3%ADn_Bot%C3%A1nico_Nacional_%2833318691991%29.jpg",
  "parque-mirador-sur":
    "https://upload.wikimedia.org/wikipedia/commons/d/d8/Parque_Mirador_Sur_-_Santo_Domingo.jpg",
  "zona-colonial":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Calle_las_Damas%2C_Santo_Domingo%2C_Zona_Colonial.jpg/1280px-Calle_las_Damas%2C_Santo_Domingo%2C_Zona_Colonial.jpg",

  // Tours: the place the excursion goes to, which is what tells one from another.
  "isla-saona-en-catamaran-dia-completo":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Isla_Saona_Dominican_Republic.jpg/1280px-Isla_Saona_Dominican_Republic.jpg",
  "isla-catalina-snorkel-y-playa":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Isla_Catalina%2C_Caribbean.jpg/1280px-Isla_Catalina%2C_Caribbean.jpg",
  "parque-nacional-los-haitises-y-cayo-levantado":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Los_Haitises_National_Park_-_Flickr_-_J_a_s_o_n_B_o_l_d_e_r_o.jpg/1280px-Los_Haitises_National_Park_-_Flickr_-_J_a_s_o_n_B_o_l_d_e_r_o.jpg",
  "avistamiento-de-ballenas-jorobadas-en-samana":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/001_Humpback_whale_breaching_in_Ballena_Marine_National_Park_Photo_by_Giles_Laurent.jpg/1280px-001_Humpback_whale_breaching_in_Ballena_Marine_National_Park_Photo_by_Giles_Laurent.jpg",
  "santo-domingo-zona-colonial-y-los-tres-ojos":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Zona_Colonial%2C_Santo_Domingo%2C_Dominican_Republic_-_panoramio_%2817%29.jpg/1280px-Zona_Colonial%2C_Santo_Domingo%2C_Dominican_Republic_-_panoramio_%2817%29.jpg",
  "cueva-de-las-maravillas-y-altos-de-chavon":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Altos_de_Chavon_1.jpg/1280px-Altos_de_Chavon_1.jpg",
  "safari-en-buggy-por-el-campo-dominicano":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Rural_Dominican_Republic_Campo.jpg/1280px-Rural_Dominican_Republic_Campo.jpg",
  "cabalgata-por-la-playa-al-atardecer":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Horse_riding_on_the_beach.jpg/1280px-Horse_riding_on_the_beach.jpg",
  "buceo-en-los-arrecifes-y-naufragios-de-juan-dolio":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Kleine_Bonaire-Underwater_life%28js%29.jpg/1280px-Kleine_Bonaire-Underwater_life%28js%29.jpg",
  "snorkel-en-el-arrecife-de-guayacanes":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Buck_Island_Reef_National_Monument%2C_Virgin_Islands_%2806523f05-6c64-4c00-abe8-c14d9a46efab%29.jpg/1280px-Buck_Island_Reef_National_Monument%2C_Virgin_Islands_%2806523f05-6c64-4c00-abe8-c14d9a46efab%29.jpg",
};

/**
 * The curated photo for a node, by its city and its own slug — the city-qualified key
 * first, so a name two cities share picks the right one. Null when there is none, and
 * the caller falls back to the section image.
 */
export function curatedPhoto(citySlug: string, slug: string): string | null {
  return CURATED_PHOTOS[`${citySlug}/${slug}`] ?? CURATED_PHOTOS[slug] ?? null;
}

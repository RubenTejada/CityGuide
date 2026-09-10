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

  // Tours: la foto del sitio adonde va la excursión, que es lo que distingue una de
  // otra. Estas se sirven desde el propio origen (`public/tours/`) y no desde
  // Commons: son diez en una misma página, y Wikimedia responde a esa ráfaga con un
  // 429 que deja el listado en gris. El crédito de cada una está en PHOTO_CREDITS.
  "isla-saona-en-catamaran-dia-completo": "/tours/isla-saona-en-catamaran-dia-completo.jpg",
  "isla-catalina-snorkel-y-playa": "/tours/isla-catalina-snorkel-y-playa.jpg",
  "parque-nacional-los-haitises-y-cayo-levantado":
    "/tours/parque-nacional-los-haitises-y-cayo-levantado.jpg",
  "avistamiento-de-ballenas-jorobadas-en-samana":
    "/tours/avistamiento-de-ballenas-jorobadas-en-samana.jpg",
  "santo-domingo-zona-colonial-y-los-tres-ojos":
    "/tours/santo-domingo-zona-colonial-y-los-tres-ojos.jpg",
  "cueva-de-las-maravillas-y-altos-de-chavon":
    "/tours/cueva-de-las-maravillas-y-altos-de-chavon.jpg",
  "safari-en-buggy-por-el-campo-dominicano":
    "/tours/safari-en-buggy-por-el-campo-dominicano.jpg",
  "cabalgata-por-la-playa-al-atardecer": "/tours/cabalgata-por-la-playa-al-atardecer.jpg",
  "buceo-en-los-arrecifes-y-naufragios-de-juan-dolio":
    "/tours/buceo-en-los-arrecifes-y-naufragios-de-juan-dolio.jpg",
  "snorkel-en-el-arrecife-de-guayacanes": "/tours/snorkel-en-el-arrecife-de-guayacanes.jpg",
};

/**
 * The curated photo for a node, by its city and its own slug — the city-qualified key
 * first, so a name two cities share picks the right one. Null when there is none, and
 * the caller falls back to the section image.
 */
export function curatedPhoto(citySlug: string, slug: string): string | null {
  return CURATED_PHOTOS[`${citySlug}/${slug}`] ?? CURATED_PHOTOS[slug] ?? null;
}

/**
 * Quién hizo cada foto curada y bajo qué licencia. Las de Commons son CC BY o CC
 * BY-SA salvo las de dominio público, y esas licencias piden crédito allí donde se
 * publican: la ficha lo imprime bajo la foto. Sin entrada aquí no se imprime nada,
 * que es lo correcto para una foto del propio CMS.
 */
const PHOTO_CREDITS: Record<string, string> = {
  "isla-saona-en-catamaran-dia-completo":
    "bez_uk (Flickr), CC BY-SA 2.0, vía Wikimedia Commons",
  "isla-catalina-snorkel-y-playa":
    "Dr. Ondřej Havelka (cestovatel), CC BY 4.0, vía Wikimedia Commons",
  "parque-nacional-los-haitises-y-cayo-levantado":
    "Jason Boldero, CC BY 2.0, vía Wikimedia Commons",
  "avistamiento-de-ballenas-jorobadas-en-samana":
    "Giles Laurent, CC BY-SA 4.0, vía Wikimedia Commons",
  "santo-domingo-zona-colonial-y-los-tres-ojos":
    "Максим Улитин, CC BY 3.0, vía Wikimedia Commons",
  "cueva-de-las-maravillas-y-altos-de-chavon":
    "Andreas Volkmer, dominio público, vía Wikimedia Commons",
  "safari-en-buggy-por-el-campo-dominicano":
    "flickr.com/photos/75277036@N00, CC BY-SA 2.0, vía Wikimedia Commons",
  "cabalgata-por-la-playa-al-atardecer":
    "Anna.Massini, CC BY-SA 4.0, vía Wikimedia Commons",
  "buceo-en-los-arrecifes-y-naufragios-de-juan-dolio":
    "Michal, Wojtek y Jerzy Strzelecki, CC BY 3.0, vía Wikimedia Commons",
  "snorkel-en-el-arrecife-de-guayacanes":
    "NPS staff, dominio público, vía Wikimedia Commons",
};

/** El crédito de la foto curada de un nodo, o null si la foto no es de las curadas. */
export function curatedPhotoCredit(
  citySlug: string,
  slug: string,
): string | null {
  return PHOTO_CREDITS[`${citySlug}/${slug}`] ?? PHOTO_CREDITS[slug] ?? null;
}

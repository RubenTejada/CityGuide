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
 * Each one carries its credit, the same three fields the agent stores on a media item
 * it downloads (photoAuthor, photoLicense, photoSource): they are CC BY or CC BY-SA
 * or public domain, and the first two ask for the author, the licence and a link
 * wherever the photo is published. The detail page prints it under the photo.
 *
 * Pure and usable in the browser: the cards read it on render and so does the metadata
 * pass, which is why it lives here and not inside a component.
 */

import type { Photo, PhotoCredit } from "@/lib/umbraco";

/** Attractions and excursions, by the slug of their own page. */
const CURATED_PHOTOS: Record<string, { url: string } & PhotoCredit> = {
  // Atracciones
  "santiago/monumento-a-los-heroes-de-la-restauracion": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Santiago_de_los_Caballeros_-_Monumento_a_los_H%C3%A9roes_de_la_Restauraci%C3%B3n_0772.JPG/1280px-Santiago_de_los_Caballeros_-_Monumento_a_los_H%C3%A9roes_de_la_Restauraci%C3%B3n_0772.JPG",
    author: "Phyrexian",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Santiago_de_los_Caballeros_-_Monumento_a_los_H%C3%A9roes_de_la_Restauraci%C3%B3n_0772.JPG",
  },
  "santiago/centro-leon": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Centro_Leon_Santiago.JPG/1280px-Centro_Leon_Santiago.JPG",
    author: "Dominican",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Centro_Leon_Santiago.JPG",
  },
  "santiago/gran-teatro-del-cibao": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/GTC_Santiago.JPG/1280px-GTC_Santiago.JPG",
    author: "Dominican",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:GTC_Santiago.JPG",
  },
  "santiago/fortaleza-san-luis": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Fortaleza_San_Luis_%28Santiago%2C_Republica_Dominicana%29.jpg/1280px-Fortaleza_San_Luis_%28Santiago%2C_Republica_Dominicana%29.jpg",
    author: "Cheposo",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Fortaleza_San_Luis_(Santiago,_Republica_Dominicana).jpg",
  },
  "santiago/parque-duarte": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Park_Duarte_met_Catedral_Santiago_Ap%C3%B3stol_212.jpg/1280px-Park_Duarte_met_Catedral_Santiago_Ap%C3%B3stol_212.jpg",
    author: "Jos1950",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Park_Duarte_met_Catedral_Santiago_Ap%C3%B3stol_212.jpg",
  },
  "santiago/catedral-santiago-apostol": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Catedral_Santiago_Ap%C3%B3stol-IMG_0136.JPG/1280px-Catedral_Santiago_Ap%C3%B3stol-IMG_0136.JPG",
    author: "Jos1950",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Catedral_Santiago_Ap%C3%B3stol-IMG_0136.JPG",
  },
  "punta-cana/playa-bavaro": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/RD_Punta_Cana_12_2017_6547.jpg/1280px-RD_Punta_Cana_12_2017_6547.jpg",
    author: "Mariordo (Mario Roberto Durán Ortiz)",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:RD_Punta_Cana_12_2017_6547.jpg",
  },
  "punta-cana/playa-el-cortecito": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/2024_-_B%C3%A1varo_Beach_-_44.jpg/1280px-2024_-_B%C3%A1varo_Beach_-_44.jpg",
    author: "Oleg Yunakov",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:2024_-_B%C3%A1varo_Beach_-_44.jpg",
  },
  "punta-cana/playa-macao": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Playa_Macao.jpg/1280px-Playa_Macao.jpg",
    author: "Carolinarondon",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Playa_Macao.jpg",
  },
  "punta-cana/scape-park": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Dominican_Republic_Hoyo_Azul.jpg/1280px-Dominican_Republic_Hoyo_Azul.jpg",
    author: "asw909 (Flickr)",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Dominican_Republic_Hoyo_Azul.jpg",
  },
  "juan-dolio-y-guayacanes/playa-juan-dolio": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Juan_Dolio_Beach_1.jpg/1280px-Juan_Dolio_Beach_1.jpg",
    author: "Kille",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Juan_Dolio_Beach_1.jpg",
  },
  "juan-dolio-y-guayacanes/bulevar-de-juan-dolio": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Juan_Dolio_Beach_2.jpg/1280px-Juan_Dolio_Beach_2.jpg",
    author: "Fanarchiv",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Juan_Dolio_Beach_2.jpg",
  },
  "juan-dolio-y-guayacanes/playa-guayacanes": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Quiet_Sea_-_panoramio.jpg/1280px-Quiet_Sea_-_panoramio.jpg",
    author: "---=XEON=---",
    license: "CC BY 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Quiet_Sea_-_panoramio.jpg",
  },
  "punta-cana/marina-cap-cana": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Cap_Cana_Marina_Dominican_Republic.jpg/1280px-Cap_Cana_Marina_Dominican_Republic.jpg",
    author: "uira (Flickr)",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Cap_Cana_Marina_Dominican_Republic.jpg",
  },
  "malecon-de-santo-domingo": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg/1280px-Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg",
    author: "Hansgarcia65",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg",
  },
  "parque-zoologico-nacional": {
    url: "https://upload.wikimedia.org/wikipedia/commons/7/74/Flamingos_%2833322097221%29.jpg",
    author: "David Stanley from Nanaimo, Canada",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Flamingos_(33322097221).jpg",
  },
  "jardin-botanico-nacional": {
    url: "https://upload.wikimedia.org/wikipedia/commons/0/07/Jard%C3%ADn_Bot%C3%A1nico_Nacional_%2833318691991%29.jpg",
    author: "David Stanley from Nanaimo, Canada",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Jard%C3%ADn_Bot%C3%A1nico_Nacional_(33318691991).jpg",
  },
  "parque-mirador-sur": {
    url: "https://upload.wikimedia.org/wikipedia/commons/d/d8/Parque_Mirador_Sur_-_Santo_Domingo.jpg",
    author: "Pisandomitierra",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Parque_Mirador_Sur_-_Santo_Domingo.jpg",
  },
  "zona-colonial": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Calle_las_Damas%2C_Santo_Domingo%2C_Zona_Colonial.jpg/1280px-Calle_las_Damas%2C_Santo_Domingo%2C_Zona_Colonial.jpg",
    author: "Desox7x",
    license: "CC0",
    source: "https://commons.wikimedia.org/wiki/File:Calle_las_Damas,_Santo_Domingo,_Zona_Colonial.jpg",
  },

  // Tours: la foto del sitio adonde va la excursión, que es lo que distingue una de
  // otra. Estas se sirven desde el propio origen (`public/tours/`) y no desde
  // Commons: son diez en una misma página, y Wikimedia responde a esa ráfaga con un
  // 429 que deja el listado en gris. La fuente sigue siendo la página del archivo en
  // Commons, que es a donde lleva el crédito.
  "isla-saona-en-catamaran-dia-completo": {
    url: "/tours/isla-saona-en-catamaran-dia-completo.jpg",
    author: "bez_uk (Flickr)",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Isla_Saona_Dominican_Republic.jpg",
  },
  "isla-catalina-snorkel-y-playa": {
    url: "/tours/isla-catalina-snorkel-y-playa.jpg",
    author: "Dr. Ondřej Havelka (cestovatel)",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Isla_Catalina,_Caribbean.jpg",
  },
  "parque-nacional-los-haitises-y-cayo-levantado": {
    url: "/tours/parque-nacional-los-haitises-y-cayo-levantado.jpg",
    author: "Jason Boldero",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Los_Haitises_National_Park_-_Flickr_-_J_a_s_o_n_B_o_l_d_e_r_o.jpg",
  },
  "avistamiento-de-ballenas-jorobadas-en-samana": {
    url: "/tours/avistamiento-de-ballenas-jorobadas-en-samana.jpg",
    author: "Giles Laurent",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:001_Humpback_whale_breaching_in_Ballena_Marine_National_Park_Photo_by_Giles_Laurent.jpg",
  },
  "santo-domingo-zona-colonial-y-los-tres-ojos": {
    url: "/tours/santo-domingo-zona-colonial-y-los-tres-ojos.jpg",
    author: "Максим Улитин",
    license: "CC BY 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Zona_Colonial,_Santo_Domingo,_Dominican_Republic_-_panoramio_(17).jpg",
  },
  "cueva-de-las-maravillas-y-altos-de-chavon": {
    url: "/tours/cueva-de-las-maravillas-y-altos-de-chavon.jpg",
    author: "Andreas Volkmer",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Altos_de_Chavon_1.jpg",
  },
  "safari-en-buggy-por-el-campo-dominicano": {
    url: "/tours/safari-en-buggy-por-el-campo-dominicano.jpg",
    author: "75277036@N00 (Flickr)",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Rural_Dominican_Republic_Campo.jpg",
  },
  "cabalgata-por-la-playa-al-atardecer": {
    url: "/tours/cabalgata-por-la-playa-al-atardecer.jpg",
    author: "Anna.Massini",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Horse_riding_on_the_beach.jpg",
  },
  "buceo-en-los-arrecifes-y-naufragios-de-juan-dolio": {
    url: "/tours/buceo-en-los-arrecifes-y-naufragios-de-juan-dolio.jpg",
    author: "Michal, Wojtek y Jerzy Strzelecki",
    license: "CC BY 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Kleine_Bonaire-Underwater_life(js).jpg",
  },
  "snorkel-en-el-arrecife-de-guayacanes": {
    url: "/tours/snorkel-en-el-arrecife-de-guayacanes.jpg",
    author: "NPS staff",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Buck_Island_Reef_National_Monument,_Virgin_Islands_(06523f05-6c64-4c00-abe8-c14d9a46efab).jpg",
  },
};

/**
 * The curated photo for a node, with its credit, by its city and its own slug — the
 * city-qualified key first, so a name two cities share picks the right one. Null when
 * there is none, and the caller falls back to the section image.
 */
export function curatedPhoto(citySlug: string, slug: string): Photo | null {
  const curated = CURATED_PHOTOS[`${citySlug}/${slug}`] ?? CURATED_PHOTOS[slug];
  if (!curated) return null;
  const { url, ...credit } = curated;
  return { url, focalPoint: null, credit };
}

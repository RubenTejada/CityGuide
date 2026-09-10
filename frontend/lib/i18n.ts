// The portal's two languages: what they are called in the URL, in the CMS, and in
// the markup, and the dictionary for the text the frontend writes itself.
//
// Content comes from Umbraco, which serves each culture its own text and its own
// route paths; this module covers the rest — the chrome, the labels the CMS has no
// field for, and the closed vocabularies the agent deliberately leaves in Spanish
// because they are keys rather than prose (a place's facilities).

import type { WeatherCondition } from "@/lib/weather";

/** URL segment of each language. Spanish is the portal's own and carries none. */
export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

/** The Umbraco culture each language reads, sent as `Accept-Language`. */
export const CULTURE: Record<Locale, string> = { es: "es-DO", en: "en-US" };

/** `<html lang>` and `og:locale`. */
export const HTML_LANG: Record<Locale, string> = { es: "es-DO", en: "en-US" };
export const OG_LOCALE: Record<Locale, string> = { es: "es_DO", en: "en_US" };

/** The `hreflang` of each language, plus the `x-default` every page also declares. */
export const HREFLANG: Record<Locale, string> = { es: "es-do", en: "en" };

/** The language a page offers as its alternate. */
export function otherLocale(locale: Locale): Locale {
  return locale === "es" ? "en" : "es";
}

/** The BCP-47 tag `Intl` formats dates and numbers with, per language. */
export const INTL_LOCALE: Record<Locale, string> = { es: "es-DO", en: "en-US" };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * The prefix a language's URLs carry. Spanish keeps the URLs the portal has always
 * had — they are indexed and linked — so only English is prefixed.
 */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/**
 * A path the app builds itself ("/santo-domingo/contacto"), in one language. Paths
 * that come from the CMS need no help: Umbraco already answers each culture with its
 * own route, "/en" included.
 */
export function localeHref(locale: Locale, path: string): string {
  return `${localePrefix(locale)}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The segments of a route path with the language prefix dropped, so [0] is always
 * the city and [1] the section, in either language. Umbraco prefixes every English
 * route with "/en", which would otherwise shift every index by one.
 */
export function contentSegments(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  return segments[0] === "en" ? segments.slice(1) : segments;
}

/**
 * The same page in the other language, from a path in this one. Only correct for
 * paths the app builds — a CMS route differs by more than its prefix, since the
 * segments themselves are translated.
 */
export function withoutLocale(path: string): string {
  return path === "/en" ? "/" : path.startsWith("/en/") ? path.slice(3) : path;
}

/**
 * The day the "Qué Hacer" guide is planning: whether it is today or tomorrow —
 * which each language names rather than dates — and the formatted date
 * otherwise ("sábado, 12 de septiembre", "Saturday, September 12").
 */
export type GuideDay = {
  relative: "today" | "tomorrow" | null;
  formatted: string;
};

/** "hoy" / "mañana" / "el sábado, 12 de…", or with "de" for a heading that owns it. */
function dayEs(day: GuideDay, article: "el" | "del"): string {
  if (day.relative === "today") return article === "del" ? "de hoy" : "hoy";
  if (day.relative === "tomorrow")
    return article === "del" ? "de mañana" : "mañana";
  return `${article} ${day.formatted}`;
}

/** "today" / "tomorrow" / "on Saturday, September 12". */
function dayEn(day: GuideDay): string {
  if (day.relative === "today") return "today";
  if (day.relative === "tomorrow") return "tomorrow";
  return `on ${day.formatted}`;
}

// ---- dictionary ----
//
// The text the frontend writes itself: chrome, empty states, and the labels no CMS
// field carries. Content — names, descriptions, intros, opening hours — comes from
// Umbraco in the culture the page asked for and never passes through here.
//
// Entries are functions where the sentence changes with what it counts or names, so
// plurals and word order stay each language's own instead of being assembled from
// fragments.

const es = {
  site: {
    title: "QueHacerRD.com — Planes, lugares y experiencias en RD",
    description:
      "Planes, lugares y experiencias en República Dominicana. Bares, restaurantes, tiendas, cines, eventos y un poco más. Ubícate con un clic.",
    tagline: "Planes, lugares y experiencias en RD",
    organizationDescription:
      "Guía de ciudades de República Dominicana: restaurantes, bares, tiendas, cines, atracciones y eventos.",
    keywords: [
      "qué hacer en República Dominicana",
      "restaurantes República Dominicana",
      "bares y discotecas",
      "eventos",
      "cartelera de cine",
      "guía de ciudad",
    ],
    rights: "Todos los derechos reservados.",
  },
  nav: {
    home: "Inicio",
    contact: "Contacto",
    search: "Busca por nombre, sector, calle o categoría",
    searchButton: "Buscar",
    changeCity: "Cambiar ciudad",
    changeTheme: "Cambiar tema",
    themeHint: "Cambiar entre modo claro y oscuro",
    language: "Idioma",
    otherLanguage: "English",
    loadingSection: "Cargando sección…",
    loading: "Cargando…",
    breadcrumb: "Ruta de navegación",
    /** Botón que abre, en una migaja, las páginas hermanas de esa página. */
    otherOptions: "Otras opciones",
    /** Short label for a section whose CMS name is too long for the nav bar. */
    shortLabels: { "empresas-y-servicios": "Empresas" } as Record<
      string,
      string
    >,
  },
  social: {
    /** Encabeza los enlaces a las cuentas del portal, en el pie de página. */
    follow: "Síguenos",
    share: "Compartir",
    shareOn: (network: string) => `Compartir en ${network}`,
    /** El menú de compartir del propio teléfono: Instagram, Threads, lo que tenga instalado. */
    shareMore: "Más opciones para compartir",
    copyLink: "Copiar enlace",
    copied: "Enlace copiado",
  },
  home: {
    heading: "Elige tu ciudad",
    lead: "Bares, restaurantes, atracciones y un poco más — ubícate con un clic.",
    listTitle: "Ciudades en QueHacerRD.com",
    empty: "No hay ciudades publicadas todavía.",
  },
  city: {
    lookingFor: "¿Qué buscas?",
    bestRated: "Lugares mejores valorados",
    upcomingEvents: "Próximos eventos",
    noEvents: "No hay eventos publicados todavía.",
    latestArticles: "Últimos artículos",
    // One button per block, each naming what it opens: two "Ver todos" on the
    // same page say nothing about which listing they lead to.
    seeAllEvents: "Ver eventos",
    seeAllArticles: "Ver artículos",
    otherCity: "Elegir otra ciudad",
    comingSoon: "En construcción",
    comingSoonHeading: (city: string): string => `${city} está en construcción`,
    comingSoonBody: (city: string): string =>
      `Todavía estamos armando la guía de ${city}. Vuelve pronto.`,
  },
  weather: {
    /** El dato de la cabecera es el de este momento, no el del día. */
    now: "Ahora",
    nowTemperature: (temperature: string): string => `Ahora ${temperature}`,
    /** El termómetro y lo que se siente al salir se alejan mucho en el Caribe. */
    feelsLike: (temperature: string): string => `sensación ${temperature}`,
    conditions: {
      clear: "Despejado",
      partlyCloudy: "Parcialmente nublado",
      cloudy: "Nublado",
      fog: "Neblina",
      drizzle: "Llovizna",
      rain: "Lluvia",
      thunderstorm: "Tormenta",
      snow: "Nieve",
    } as Record<WeatherCondition, string>,
    /** Lo que lee un lector de pantalla del termómetro de la cabecera. */
    inCity: (city: string, temperature: string, condition: string): string =>
      `Clima en ${city}: ${temperature}, ${condition.toLowerCase()}`,
    range: (max: string, min: string): string => `Máx ${max} · Mín ${min}`,
    rainChance: (percent: number): string =>
      `${percent} % de probabilidad de lluvia`,
  },
  listing: {
    clearFilters: "Limpiar filtros",
    closeFilter: "Cerrar filtro",
    empty: "No hay lugares publicados todavía.",
    noMatches: "No hay lugares que coincidan con los filtros seleccionados.",
    noneOnMap: "Ninguno de estos resultados tiene ubicación en el mapa.",
    grid: "Cuadrícula",
    map: "Mapa",
    previous: "Anterior",
    next: "Siguiente",
    previousPage: "Página anterior",
    nextPage: "Página siguiente",
    page: (n: number): string => `Página ${n}`,
    /** Appended to the title of a listing's second page onwards. */
    pageSuffix: (n: number): string => ` — Página ${n}`,
    pagination: "Paginación",
    cuisine: "Tipo de comida",
    venueType: "Tipo de local",
    shopType: "Tipo de tienda",
    serviceType: "Servicio",
    /** Encabezado del bloque de enlaces a las subcategorías, bajo el listado. */
    goToCategory: "Ir a la categoría",
    /** "12 lugares en Santo Domingo con dirección, teléfono…" */
    places: (count: number): string =>
      count === 1 ? "1 lugar" : `${count} lugares`,
    inCity: (city: string): string => ` en ${city}`,
    what: "con dirección, teléfono, horario, valoración de Google y mapa.",
  },
  place: {
    about: (name: string): string => `Acerca de ${name}`,
    facilities: "Facilidades del lugar",
    gallery: "Galería de fotos",
    galleryOpen: (n: number, total: number): string =>
      `Ver la foto ${n} de ${total} en grande`,
    galleryPrevious: "Foto anterior",
    galleryNext: "Foto siguiente",
    galleryClose: "Cerrar la galería",
    galleryCount: (n: number, total: number): string => `${n} de ${total}`,
    menu: "Ver el menú",
    menuHeading: "Menú",
    menuPages: (n: number): string => (n === 1 ? "1 página" : `${n} páginas`),
    menuFrom: "Tomado de",
    menuDishes: (n: number): string => (n === 1 ? "1 plato" : `${n} platos`),
    menuCaptured: (date: string): string => `capturado el ${date}`,
    menuPricesMayChange:
      "Los precios y los platos pueden haber cambiado desde esa fecha.",
    menuOpen: (n: number, total: number): string =>
      `Ver la página ${n} de ${total} del menú`,
    menuPrevious: "Página anterior",
    menuNext: "Página siguiente",
    menuClose: "Cerrar el menú",
    /** Los controles de zoom del visor, iguales para una foto y para una página del menú. */
    viewerZoomIn: "Acercar",
    viewerZoomOut: "Alejar",
    viewerZoomReset: "Tamaño original",
    location: "Ubicación",
    map: "Mapa",
    date: "Fecha",
    venue: "Lugar",
    company: "Empresa",
    category: "Categoría",
    filterByFacilities: "Filtrar por facilidades",
    /** La opción del filtro de facilidades que deja solo los lugares cuya carta
     *  está en el portal. */
    filterWithMenu: "Con menú",
    website: "Sitio Web",
    phone: "Teléfono",
    address: "Dirección",
    hours: "Horario",
    directions: "Cómo llegar",
    googleRating: "Calificación de Google",
    nearby: "¿Qué está cerca?",
    nearbySearching: "Buscando cerca…",
    nearbyEmpty: "Nada cerca por ahora.",
    nearbyEmptyInCategories: "Nada cerca en esas categorías.",
    branchesEmpty: "No hay sucursales publicadas todavía.",
    establishments: "Otros establecimientos",
    establishmentsEmpty: "No hay establecimientos publicados todavía.",
  },
  reservation: {
    /**
     * Una excursión se pide igual que una mesa, pero no es una mesa: la lleva una
     * empresa que el portal no es, el cupo y el precio los confirma ella, y lo que
     * cambia es lo que el formulario promete. Solo esas frases se sustituyen.
     */
    tour: {
      open: "Solicitar esta excursión",
      openHint: "Respuesta por correo",
      heading: (name: string): string => `Solicitar ${name}`,
      lead: (name: string): string =>
        `Dinos qué día quieres ir y cuántos son. Pasamos tu solicitud al operador de ${name}, que te confirma el cupo y el precio por correo. Nada queda reservado hasta que te respondan.`,
      notesHint: "(dónde te alojas, edades, algo que debamos saber…)",
      confirmedByEmail:
        "Al enviarla te llega un correo con lo que pediste, y la confirmación llega después desde el operador.",
      sentBody: (name: string): string =>
        `Recibimos tu solicitud para ${name} y te respondemos al correo que nos dejaste. Revisa también la carpeta de correo no deseado.`,
      privacy:
        "Usamos tus datos solo para gestionar esta excursión con el operador.",
    },
    /** El botón de la ficha: lo que el visitante viene a hacer, dicho en una palabra. */
    open: "Reservar una mesa",
    openHint: "Respuesta por correo",
    heading: (name: string): string => `Reservar en ${name}`,
    /** Lo primero del modal: qué es esto y qué pasa después de enviarlo. */
    lead: (name: string): string =>
      `Cuéntanos cuándo quieres ir y ${name} te confirma la mesa por correo. La reserva no queda hecha hasta que te respondan.`,
    fields: {
      date: "Fecha",
      time: "Hora",
      party: "Personas",
      name: "Tu nombre",
      email: "Tu correo",
      phone: "Tu teléfono",
      notes: "Algo que debamos saber",
    },
    notesHint: "(alergias, celebración, silla para niños…)",
    optional: "(opcional)",
    phoneHint: "(por si necesitan llamarte)",
    partyHint: (max: number): string => `Hasta ${max} personas`,
    /** La promesa que el formulario hace, repetida donde se pulsa enviar. */
    confirmedByEmail:
      "Al enviarla te llega un correo con lo que pediste, y la confirmación llega después desde el propio establecimiento.",
    submit: "Enviar solicitud",
    sending: "Enviando…",
    sentHeading: "¡Solicitud enviada!",
    sentBody: (name: string): string =>
      `${name} recibió tu solicitud y te responde al correo que nos dejaste. Revisa también la carpeta de correo no deseado.`,
    /** Lo pedido, repetido en la confirmación: "viernes 12 de septiembre · 20:30 · 4 personas". */
    summary: (date: string, time: string, party: number): string =>
      `${date} · ${time} · ${party === 1 ? "1 persona" : `${party} personas`}`,
    close: "Cerrar",
    privacy:
      "Usamos tus datos solo para gestionar esta reserva con el establecimiento.",
    honeypot: "No llenar",
    errors: {
      date: "Elige la fecha y la hora.",
      past: "Elige una fecha y hora que no hayan pasado.",
      party: (max: number): string => `¿Cuántas personas van? Hasta ${max}.`,
      name: "Escribe tu nombre.",
      email: "Escribe un correo válido.",
      phone: "Escribe un teléfono donde te puedan llamar.",
      tooMany: "Ya recibimos varias solicitudes tuyas. Intenta de nuevo en un rato.",
      failed: "No pudimos enviar tu solicitud. Inténtalo más tarde.",
    },
  },
  tours: {
    /** Lo que dice la línea bajo el título de una excursión. */
    hour: "hora",
    hours: "horas",
    pickup: "Recogida en el hotel",
    priceFrom: (price: string): string => `Desde ${price} por persona`,
    /** Casi ninguna excursión publica precio: lo cotiza quien la lleva. */
    priceOnRequest: "Precio a consultar",
    includes: "Qué incluye",
    meetingPoint: "Dónde empieza",
    operators: "Quién la lleva",
    operatorsHint:
      "La excursión la opera y la confirma la empresa; el portal solo traslada tu solicitud.",
    bookWithOperator: "Ver al operador",
    photoCredit: (credit: string): string => `Foto: ${credit}`,
  },
  events: {
    about: "Acerca del evento",
    past: "Eventos pasados",
    dateToBeConfirmed: "Fecha por confirmar",
    empty: "No hay eventos publicados todavía.",
    noMatches: "No hay eventos de esas categorías.",
    noneOnMap: "Ninguno de estos eventos tiene ubicación en el mapa.",
    tickets: "Entradas",
    everyWeek: (day: string): string => `Cada ${day}`,
  },
  thingsToDo: {
    heading: (city: string): string => `Qué Hacer en ${city}`,
    when: "¿Cuándo?",
    what: "¿Qué quieres hacer?",
    all: "Todo",
    openOn: (day: GuideDay): string =>
      `Parques y atracciones abiertos ${dayEs(day, "el")}`,
    eventsOn: (day: GuideDay): string => `Eventos ${dayEs(day, "del")}`,
    upcomingEvents: "Próximos eventos",
    showingOn: (day: GuideDay): string => `En cartelera ${dayEs(day, "el")}`,
    /** The chip of the cartelera: what it counts is films, not theaters. */
    movies: "Películas",
    seeAll: (feminine = false): string => `Ver ${feminine ? "todas" : "todos"}`,
    seeAllCount: (count: number, feminine = false): string =>
      `Ver ${feminine ? "las" : "los"} ${count.toLocaleString("es-DO")}`,
  },
  movies: {
    whereToWatch: "¿Dónde verla?",
    fullListings: "Ver la cartelera completa",
    updating: "Actualizando cartelera…",
    showtimes: "Ver horarios y cines",
    hideShowtimes: "Ocultar horarios",
    detail: "Ver detalle",
    trailer: "Ver trailer",
    profile: "Ver ficha",
    noShowtimes: (name: string): string =>
      `No hay funciones de ${name} para esta fecha.`,
    cinemas: (count: number): string => (count === 1 ? "cine" : "cines"),
    screenings: (count: number): string =>
      count === 1 ? "función" : "funciones",
    today: "Hoy",
    tomorrow: "Mañana",
    dubbed: "Doblada al Español",
    subtitled: "Inglés Subtitulada",
    spanish: "Español",
  },
  map: {
    nearYou: "Cerca de ti",
    yourLocation: "Tu ubicación",
    locating: "Ubicando…",
    locateFailed: "No pudimos obtener tu ubicación.",
    locateUnsupported: "Tu navegador no comparte la ubicación.",
    empty: "Nada cerca por ahora.",
    missingKey: "Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para ver el mapa.",
    locateSearching: "Buscando tu ubicación…",
    locateUpdate: "Actualizar mi ubicación",
    locateUse: "Usar mi ubicación",
    categories: "Categorías",
    category: "Categoría",
    attractions: "Atracciones",
    events: "Eventos",
    cinemas: "Cines",
    close: "Cerrar",
  },
  search: {
    prompt:
      "Escribe algo en la barra de búsqueda para encontrar lugares, empresas y eventos.",
    title: (city: string): string => `Buscar en ${city}`,
    metaDescription: (city: string): string =>
      `Busca lugares, empresas y eventos en ${city}.`,
    theCity: "la ciudad",
    /** What the autocomplete calls each kind of result. */
    kinds: {
      place: "Lugar",
      company: "Empresa",
      eventItem: "Evento",
      categoryPage: "Categoría",
      subcategory: "Subcategoría",
      article: "Artículo",
      mall: "Plaza",
      movie: "Película",
      tour: "Excursión",
    } as Record<string, string>,
    heading: (query: string): string => `Resultados para «${query}»`,
    count: (total: number): string =>
      total === 1 ? "1 resultado" : `${total} resultados`,
    inCity: (city: string): string => ` en ${city}`,
    empty:
      "No encontramos nada con ese término. Prueba con otra palabra o revisa la ortografía.",
    noSuggestions: "Sin sugerencias",
    moreLinks: "Secciones, artículos y películas",
    seeAllResults: (query: string): string =>
      `Ver todos los resultados para «${query}»`,
  },
  notFound: {
    title: "No encontramos esta página",
    body: "El enlace puede estar roto o el contenido ya no existe. Busca lo que necesitas o vuelve a la portada de la ciudad.",
    backToCity: "Volver a la ciudad",
    backHome: "Elegir otra ciudad",
  },
  article: {
    more: "Más artículos",
    empty: "No hay artículos publicados todavía.",
    read: "Leer artículo…",
  },
  contact: {
    heading: "Contacto",
    lead: (city: string): string =>
      `Escríbenos para una consulta general, para pedir que agreguemos o quitemos un negocio de la guía de ${city}, o para anunciarte en ella.`,
    theCity: "la ciudad",
    bullets: {
      addLabel: "Agregar mi negocio:",
      add: "dinos cómo se llama, dónde está y a qué se dedica.",
      removeLabel: "Quitar mi negocio:",
      remove: "pásanos el enlace de su página en el portal y lo retiramos.",
      adsLabel: "Publicidad en el sitio:",
      ads: "cuéntanos qué quieres promocionar y te enviamos las opciones y precios.",
    },
    requestType: "Tipo de solicitud",
    fields: {
      name: "Nombre",
      email: "Correo",
      phone: "Teléfono",
      business: "Negocio",
      businessUrl: "Enlace del negocio",
      message: "Mensaje",
    },
    sentBody:
      "Gracias por escribirnos. Revisamos cada solicitud y te respondemos al correo que nos dejaste.",
    errors: {
      requestType: "Elige el tipo de solicitud.",
      name: "Escribe tu nombre.",
      email: "Escribe un correo válido.",
      message: "Cuéntanos un poco más en el mensaje.",
      tooMany: "Recibimos varios mensajes tuyos. Intenta de nuevo en un rato.",
      failed: "No pudimos enviar tu mensaje. Inténtalo más tarde.",
    },
    /** Labels for the request types; the values themselves are what the CMS stores. */
    typeLabels: {
      "Consulta general": "Consulta general",
      "Agregar mi negocio": "Agregar mi negocio",
      "Quitar mi negocio": "Quitar mi negocio",
      "Publicidad en el sitio": "Publicidad en el sitio",
    } as Record<string, string>,
    optional: "(opcional)",
    ifApplicable: "(si aplica)",
    businessHint: "(web, redes o su página en el portal)",
    send: "Enviar mensaje",
    sending: "Enviando…",
    sent: "¡Mensaje enviado!",
    privacy: "Usamos tus datos solo para responderte esta solicitud.",
    honeypot: "No llenar",
    types: {
      general: "Consulta general",
      add: "Agregar mi negocio",
      remove: "Quitar mi negocio",
      advertising: "Publicidad en el sitio",
    },
  },
  /**
   * A place's facilities are stored as a closed vocabulary in Spanish — they are keys
   * the agent and the backoffice share, not prose — so the English page translates
   * them on render.
   */
  /**
   * The sentences the SEO layer derives when the CMS carries no override: the title
   * shapes and the fallback meta descriptions. `where` is already " en Santo Domingo"
   * or empty — the city is left out when the name already says it.
   */
  seo: {
    inCity: (city: string): string => ` en ${city}`,
    cityTitle: (city: string): string =>
      `${city}: qué hacer, dónde comer y salir`,
    cityTitleShort: (city: string): string => `Qué hacer en ${city}`,
    cityFallback: (city: string): string =>
      `Guía de ${city}: restaurantes, bares, tiendas, cines, atracciones y eventos, con mapas, horarios y contactos.`,
    contactTitle: (city: string): string =>
      `Contacto${city ? ` — ${city}` : ""}`,
    contactDescription:
      "Escríbenos para agregar o quitar un negocio del portal, anunciarte o cualquier otra consulta.",
    searchTitle: (query: string, city: string): string =>
      query ? `Resultados para "${query}" en ${city}` : `Buscar en ${city}`,
    categoryFallback: (name: string, where: string): string =>
      `${name}${where}: direcciones, teléfonos, horarios, valoraciones y mapa.`,
    subcategoryFallback: (
      name: string,
      parent: string,
      where: string,
    ): string =>
      `${name} ${parent ? `— ${parent} ` : ""}${where}: los lugares recomendados con dirección, horario, teléfono y mapa.`,
    placeFallback: (name: string, address: string, where: string): string =>
      `${name}${address ? `, ${address}` : ""}${where}. Horario, teléfono, ubicación y cómo llegar.`,
    companyTitle: (name: string, where: string): string =>
      `${name} — sucursales${where}`,
    companyFallback: (name: string, where: string): string =>
      `Sucursales de ${name}${where}: direcciones, teléfonos, horarios y mapa.`,
    movieTitle: (name: string, where: string): string =>
      `${name} — cartelera${where}`,
    movieFallback: (name: string, where: string): string =>
      `Horarios, sinopsis y trailer de ${name} en los cines${where}.`,
    eventsTitle: (where: string): string => `Eventos${where}`,
    eventsFallback: (where: string): string =>
      `Agenda de eventos${where}: conciertos, festivales, ferias y actividades con fecha, lugar y entradas.`,
    eventFallback: (
      name: string,
      dates: string,
      venue: string,
      where: string,
    ): string =>
      `${name}${dates ? `, ${dates}` : ""}${venue ? ` en ${venue}` : where}. Fecha, lugar y entradas.`,
    thingsToDoTitle: (where: string): string => `Qué hacer${where}`,
    thingsToDoFallback: (where: string): string =>
      `Ideas de planes${where}: eventos de los próximos días, atracciones abiertas hoy y lugares para comer y salir.`,
    articlesFallback: (where: string): string =>
      `Artículos, guías y recomendaciones${where}.`,
    tourFallback: (name: string, duration: string, where: string): string =>
      `${name}${where}${duration ? `, ${duration}` : ""}. Qué incluye, dónde empieza y quién la lleva.`,
  },
  facilities: {} as Record<string, string>,
};

const en: typeof es = {
  site: {
    title: "QueHacerRD.com — Things to do in the Dominican Republic",
    description:
      "Places, plans and experiences across the Dominican Republic. Bars, restaurants, shops, movie theaters, events and a little more. Find your way with one click.",
    tagline: "Plans, places and experiences in the DR",
    organizationDescription:
      "A city guide to the Dominican Republic: restaurants, bars, shops, movie theaters, attractions and events.",
    keywords: [
      "things to do in the Dominican Republic",
      "Dominican Republic restaurants",
      "bars and nightclubs",
      "events",
      "movie showtimes",
      "city guide",
    ],
    rights: "All rights reserved.",
  },
  nav: {
    home: "Home",
    contact: "Contact",
    search: "Search by name, neighborhood, street or category",
    searchButton: "Search",
    changeCity: "Change city",
    changeTheme: "Change theme",
    themeHint: "Switch between light and dark mode",
    language: "Language",
    otherLanguage: "Español",
    loadingSection: "Loading section…",
    loading: "Loading…",
    breadcrumb: "Breadcrumb",
    otherOptions: "Other options",
    shortLabels: {
      "businesses-services": "Businesses",
      // Nine English tabs overflow the bar by a hair; the section keeps its full
      // name everywhere else.
      "movie-theaters": "Movies",
    } as Record<string, string>,
  },
  social: {
    follow: "Follow us",
    share: "Share",
    shareOn: (network: string) => `Share on ${network}`,
    shareMore: "More ways to share",
    copyLink: "Copy link",
    copied: "Link copied",
  },
  home: {
    heading: "Choose your city",
    lead: "Bars, restaurants, attractions and a little more — find your way with one click.",
    listTitle: "Cities on QueHacerRD.com",
    empty: "No cities published yet.",
  },
  city: {
    lookingFor: "What are you looking for?",
    bestRated: "Best rated places",
    upcomingEvents: "Upcoming events",
    noEvents: "No events published yet.",
    latestArticles: "Latest articles",
    seeAllEvents: "See events",
    seeAllArticles: "See articles",
    otherCity: "Choose another city",
    comingSoon: "Coming soon",
    comingSoonHeading: (city: string): string =>
      `${city} is under construction`,
    comingSoonBody: (city: string): string =>
      `We are still putting the ${city} guide together. Come back soon.`,
  },
  weather: {
    now: "Now",
    nowTemperature: (temperature: string): string => `Now ${temperature}`,
    feelsLike: (temperature: string): string => `feels like ${temperature}`,
    conditions: {
      clear: "Clear",
      partlyCloudy: "Partly cloudy",
      cloudy: "Cloudy",
      fog: "Fog",
      drizzle: "Drizzle",
      rain: "Rain",
      thunderstorm: "Thunderstorm",
      snow: "Snow",
    },
    inCity: (city: string, temperature: string, condition: string): string =>
      `Weather in ${city}: ${temperature}, ${condition.toLowerCase()}`,
    range: (max: string, min: string): string => `High ${max} · Low ${min}`,
    rainChance: (percent: number): string => `${percent}% chance of rain`,
  },
  listing: {
    clearFilters: "Clear filters",
    closeFilter: "Close filter",
    empty: "No places published yet.",
    noMatches: "No places match the selected filters.",
    noneOnMap: "None of these results has a location on the map.",
    grid: "Grid",
    map: "Map",
    previous: "Previous",
    next: "Next",
    previousPage: "Previous page",
    nextPage: "Next page",
    page: (n: number): string => `Page ${n}`,
    pageSuffix: (n: number): string => ` — Page ${n}`,
    pagination: "Pagination",
    cuisine: "Cuisine",
    venueType: "Venue type",
    shopType: "Shop type",
    serviceType: "Service",
    goToCategory: "Go to a category",
    places: (count: number): string =>
      count === 1 ? "1 place" : `${count} places`,
    inCity: (city: string): string => ` in ${city}`,
    what: "with address, phone, opening hours, Google rating and a map.",
  },
  place: {
    about: (name: string): string => `About ${name}`,
    facilities: "Amenities",
    gallery: "Photo gallery",
    galleryOpen: (n: number, total: number): string =>
      `View photo ${n} of ${total} full size`,
    galleryPrevious: "Previous photo",
    galleryNext: "Next photo",
    galleryClose: "Close the gallery",
    galleryCount: (n: number, total: number): string => `${n} of ${total}`,
    menu: "See the menu",
    menuHeading: "Menu",
    menuPages: (n: number): string => (n === 1 ? "1 page" : `${n} pages`),
    menuFrom: "From",
    menuDishes: (n: number): string => (n === 1 ? "1 dish" : `${n} dishes`),
    menuCaptured: (date: string): string => `captured on ${date}`,
    menuPricesMayChange: "Prices and dishes may have changed since that date.",
    menuOpen: (n: number, total: number): string =>
      `See page ${n} of ${total} of the menu`,
    menuPrevious: "Previous page",
    menuNext: "Next page",
    menuClose: "Close the menu",
    viewerZoomIn: "Zoom in",
    viewerZoomOut: "Zoom out",
    viewerZoomReset: "Actual size",
    location: "Location",
    map: "Map",
    date: "Date",
    venue: "Venue",
    company: "Company",
    category: "Category",
    filterByFacilities: "Filter by amenities",
    filterWithMenu: "With menu",
    website: "Website",
    phone: "Phone",
    address: "Address",
    hours: "Hours",
    directions: "Directions",
    googleRating: "Google rating",
    nearby: "What's nearby?",
    nearbySearching: "Looking around…",
    nearbyEmpty: "Nothing nearby for now.",
    nearbyEmptyInCategories: "Nothing nearby in those categories.",
    branchesEmpty: "No locations published yet.",
    establishments: "Other stores",
    establishmentsEmpty: "No stores published yet.",
  },
  reservation: {
    tour: {
      open: "Request this tour",
      openHint: "Answered by email",
      heading: (name: string): string => `Request ${name}`,
      lead: (name: string): string =>
        `Tell us which day you would like to go and how many of you there are. We pass your request to the operator of ${name}, who confirms availability and the price by email. Nothing is booked until they answer.`,
      notesHint: "(where you are staying, ages, anything we should know…)",
      confirmedByEmail:
        "You get an email with what you asked for right away, and the confirmation comes afterwards from the operator.",
      sentBody: (name: string): string =>
        `We have your request for ${name} and will answer the email address you gave us. Check your spam folder too.`,
      privacy:
        "We use your details only to arrange this tour with the operator.",
    },
    open: "Book a table",
    openHint: "Answered by email",
    heading: (name: string): string => `Book at ${name}`,
    lead: (name: string): string =>
      `Tell us when you would like to come and ${name} confirms the table by email. The booking is not held until they answer.`,
    fields: {
      date: "Date",
      time: "Time",
      party: "People",
      name: "Your name",
      email: "Your email",
      phone: "Your phone",
      notes: "Anything we should know",
    },
    notesHint: "(allergies, a celebration, a high chair…)",
    optional: "(optional)",
    phoneHint: "(in case they need to call you)",
    partyHint: (max: number): string => `Up to ${max} people`,
    confirmedByEmail:
      "You get an email with what you asked for right away, and the confirmation comes afterwards from the venue itself.",
    submit: "Send request",
    sending: "Sending…",
    sentHeading: "Request sent!",
    sentBody: (name: string): string =>
      `${name} has your request and will answer the email address you gave us. Check your spam folder too.`,
    summary: (date: string, time: string, party: number): string =>
      `${date} · ${time} · ${party === 1 ? "1 person" : `${party} people`}`,
    close: "Close",
    privacy:
      "We use your details only to arrange this booking with the venue.",
    honeypot: "Do not fill in",
    errors: {
      date: "Choose a date and a time.",
      past: "Choose a date and time still to come.",
      party: (max: number): string => `How many people are coming? Up to ${max}.`,
      name: "Write your name.",
      email: "Write a valid email address.",
      phone: "Write a phone number they can reach you on.",
      tooMany: "We already have several requests from you. Try again in a while.",
      failed: "We could not send your request. Please try again later.",
    },
  },
  tours: {
    hour: "hour",
    hours: "hours",
    pickup: "Hotel pickup",
    priceFrom: (price: string): string => `From ${price} per person`,
    priceOnRequest: "Price on request",
    includes: "What is included",
    meetingPoint: "Where it starts",
    operators: "Who runs it",
    operatorsHint:
      "The tour is run and confirmed by the operator; the portal only passes your request on.",
    bookWithOperator: "See the operator",
    photoCredit: (credit: string): string => `Photo: ${credit}`,
  },
  events: {
    about: "About this event",
    past: "Past events",
    dateToBeConfirmed: "Date to be confirmed",
    empty: "No events published yet.",
    noMatches: "No events in those categories.",
    noneOnMap: "None of these events has a location on the map.",
    tickets: "Tickets",
    everyWeek: (day: string): string => `Every ${day}`,
  },
  thingsToDo: {
    heading: (city: string): string => `Things to Do in ${city}`,
    when: "When?",
    what: "What do you want to do?",
    all: "All",
    openOn: (day: GuideDay): string =>
      `Parks and attractions open ${dayEn(day)}`,
    eventsOn: (day: GuideDay): string => `Events ${dayEn(day)}`,
    upcomingEvents: "Upcoming events",
    showingOn: (day: GuideDay): string => `Showing ${dayEn(day)}`,
    movies: "Movies",
    seeAll: (): string => "See all",
    seeAllCount: (count: number): string =>
      `See all ${count.toLocaleString("en-US")}`,
  },
  movies: {
    whereToWatch: "Where to watch",
    fullListings: "See all showtimes",
    updating: "Updating showtimes…",
    showtimes: "Showtimes and theaters",
    hideShowtimes: "Hide showtimes",
    detail: "Details",
    trailer: "Watch trailer",
    profile: "Open profile",
    noShowtimes: (name: string): string =>
      `No showtimes for ${name} on this date.`,
    cinemas: (count: number): string => (count === 1 ? "theater" : "theaters"),
    screenings: (count: number): string =>
      count === 1 ? "showtime" : "showtimes",
    today: "Today",
    tomorrow: "Tomorrow",
    dubbed: "Dubbed in Spanish",
    subtitled: "English with subtitles",
    spanish: "In Spanish",
  },
  map: {
    nearYou: "Near you",
    yourLocation: "Your location",
    locating: "Locating…",
    locateFailed: "We could not get your location.",
    locateUnsupported: "Your browser does not share your location.",
    empty: "Nothing nearby for now.",
    missingKey: "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to see the map.",
    locateSearching: "Finding your location…",
    locateUpdate: "Update my location",
    locateUse: "Use my location",
    categories: "Categories",
    category: "Category",
    attractions: "Attractions",
    events: "Events",
    cinemas: "Movie theaters",
    close: "Close",
  },
  search: {
    prompt:
      "Type something in the search bar to find places, businesses and events.",
    title: (city: string): string => `Search in ${city}`,
    metaDescription: (city: string): string =>
      `Search places, businesses and events in ${city}.`,
    theCity: "the city",
    kinds: {
      place: "Place",
      company: "Business",
      eventItem: "Event",
      categoryPage: "Section",
      subcategory: "Subcategory",
      article: "Article",
      mall: "Mall",
      movie: "Movie",
      tour: "Tour",
    } as Record<string, string>,
    heading: (query: string): string => `Results for “${query}”`,
    count: (total: number): string =>
      total === 1 ? "1 result" : `${total} results`,
    inCity: (city: string): string => ` in ${city}`,
    empty: "Nothing matched that term. Try another word or check the spelling.",
    noSuggestions: "No suggestions",
    moreLinks: "Sections, articles and movies",
    seeAllResults: (query: string): string => `See all results for “${query}”`,
  },
  notFound: {
    title: "We could not find this page",
    body: "The link may be broken, or the content is no longer there. Search for what you need, or go back to the city home page.",
    backToCity: "Back to the city",
    backHome: "Choose another city",
  },
  article: {
    more: "More articles",
    empty: "No articles published yet.",
    read: "Read article…",
  },
  contact: {
    heading: "Contact",
    lead: (city: string): string =>
      `Write to us with a general question, to ask us to add or remove a business from the ${city} guide, or to advertise on it.`,
    theCity: "city",
    bullets: {
      addLabel: "Add my business:",
      add: "tell us what it is called, where it is and what it does.",
      removeLabel: "Remove my business:",
      remove:
        "send us the link to its page on the portal and we will take it down.",
      adsLabel: "Advertise on the site:",
      ads: "tell us what you want to promote and we will send you the options and prices.",
    },
    requestType: "Request type",
    fields: {
      name: "Name",
      email: "Email",
      phone: "Phone",
      business: "Business",
      businessUrl: "Business link",
      message: "Message",
    },
    sentBody:
      "Thanks for writing. We read every request and will reply to the address you gave us.",
    errors: {
      requestType: "Choose the type of request.",
      name: "Enter your name.",
      email: "Enter a valid email address.",
      message: "Tell us a little more in the message.",
      tooMany: "We have had several messages from you. Try again in a while.",
      failed: "We could not send your message. Please try again later.",
    },
    typeLabels: {
      "Consulta general": "General enquiry",
      "Agregar mi negocio": "Add my business",
      "Quitar mi negocio": "Remove my business",
      "Publicidad en el sitio": "Advertise on the site",
    } as Record<string, string>,
    optional: "(optional)",
    ifApplicable: "(if applicable)",
    businessHint: "(website, social media or its page on the portal)",
    send: "Send message",
    sending: "Sending…",
    sent: "Message sent!",
    privacy: "We only use your details to answer this request.",
    honeypot: "Do not fill in",
    types: {
      general: "General enquiry",
      add: "Add my business",
      remove: "Remove my business",
      advertising: "Advertise on the site",
    },
  },
  seo: {
    inCity: (city: string): string => ` in ${city}`,
    cityTitle: (city: string): string =>
      `${city}: what to do, where to eat and go out`,
    cityTitleShort: (city: string): string => `Things to do in ${city}`,
    cityFallback: (city: string): string =>
      `A guide to ${city}: restaurants, bars, shops, movie theaters, attractions and events, with maps, hours and contacts.`,
    contactTitle: (city: string): string =>
      `Contact${city ? ` — ${city}` : ""}`,
    contactDescription:
      "Write to us to add or remove a business from the portal, to advertise, or with any other question.",
    searchTitle: (query: string, city: string): string =>
      query ? `Results for "${query}" in ${city}` : `Search in ${city}`,
    categoryFallback: (name: string, where: string): string =>
      `${name}${where}: addresses, phone numbers, opening hours, ratings and a map.`,
    subcategoryFallback: (
      name: string,
      parent: string,
      where: string,
    ): string =>
      `${name} ${parent ? `— ${parent} ` : ""}${where}: the places worth knowing, with address, hours, phone and a map.`,
    placeFallback: (name: string, address: string, where: string): string =>
      `${name}${address ? `, ${address}` : ""}${where}. Opening hours, phone, location and directions.`,
    companyTitle: (name: string, where: string): string =>
      `${name} — locations${where}`,
    companyFallback: (name: string, where: string): string =>
      `${name} locations${where}: addresses, phone numbers, opening hours and a map.`,
    movieTitle: (name: string, where: string): string =>
      `${name} — showtimes${where}`,
    movieFallback: (name: string, where: string): string =>
      `Showtimes, synopsis and trailer for ${name} in theaters${where}.`,
    eventsTitle: (where: string): string => `Events${where}`,
    eventsFallback: (where: string): string =>
      `What's on${where}: concerts, festivals, fairs and more, with dates, venues and tickets.`,
    eventFallback: (
      name: string,
      dates: string,
      venue: string,
      where: string,
    ): string =>
      `${name}${dates ? `, ${dates}` : ""}${venue ? ` at ${venue}` : where}. Date, venue and tickets.`,
    thingsToDoTitle: (where: string): string => `Things to do${where}`,
    thingsToDoFallback: (where: string): string =>
      `Ideas${where}: events in the days ahead, attractions open today, and places to eat and go out.`,
    articlesFallback: (where: string): string =>
      `Articles, guides and recommendations${where}.`,
    tourFallback: (name: string, duration: string, where: string): string =>
      `${name}${where}${duration ? `, ${duration}` : ""}. What is included, where it starts and who runs it.`,
  },
  facilities: {
    Romántico: "Romantic",
    "Aire Acondicionado": "Air Conditioning",
    "Horario Extendido": "Open Late",
    "Restaurante en el Lugar": "On-site Restaurant",
    Parqueo: "Parking",
    WiFi: "WiFi",
    Delivery: "Delivery",
    Terraza: "Terrace",
    "Música en Vivo": "Live Music",
    "Apto para Niños": "Kid Friendly",
  },
};

export type Dictionary = typeof es;

const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

/** The dictionary of a language. */
export function t(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * A facility as the page shows it. The stored value is the Spanish key both the
 * agent and the backoffice write, so an unmapped one falls back to itself rather
 * than disappearing from the badges.
 */
export function facilityLabel(locale: Locale, facility: string): string {
  return t(locale).facilities[facility] ?? facility;
}

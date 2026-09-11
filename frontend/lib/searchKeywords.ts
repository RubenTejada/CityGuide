// The words a visitor types that the content itself never spells. A place is
// called "Farmacia Carol" and a bank branch "Banreservas — ATM"; nobody writes
// "cajero automático", "casa de cambio" or "traslado al aeropuerto" into a name,
// an address or a section title, so a search for those matched nothing at all.
//
// The synonyms belong to the *kind* of business, not to each node, so they are
// keyed by the section or subcategory slug the node lives under and read off its
// path — which the index already carries. Nothing extra ships to the browser,
// and one line here covers every place filed under that subcategory, today and
// tomorrow.

import { canonicalPath } from "./sectionSlugs";

/**
 * Extra words the entries under a section or subcategory answer to, keyed by its
 * Spanish slug (an English path is folded back to it first). Written as the
 * phrases a visitor types, singular and plural both, because the matcher asks
 * for every word of the query as a substring: "alquileres" does not contain
 * "alquiler", and "traslado al aeropuerto" needs the "al" to be somewhere.
 */
const KEYWORDS: Record<string, string> = {
  bancos:
    "cajero cajeros cajeros automaticos cajero automatico atm autobanco sucursal bancaria retirar efectivo",
  "casas-de-cambio":
    "casa de cambio casas de cambios cambio de divisas divisas dolares euros exchange currency money exchange remesas",
  "clinicas-y-hospitales":
    "hospital hospitales clinica clinicas dispensario dispensarios dispensarios medicos medico medicos centro medico consultorio urgencias emergencias medicas salud doctor",
  "policia-y-emergencias":
    "policia destacamento destacamentos destacamentos de policias destacamento policial politur cuartel denuncia emergencia emergencias bomberos 911 seguridad",
  "spas-y-masajes":
    "masaje masajes centro de masajes centros de masajes spa spas masajista relajacion terapia bienestar wellness",
  "taxis-y-traslados":
    "taxi taxis servicio de taxis motoconcho chofer traslado traslados traslado al aeropuerto transfer transporte aeropuerto la romana las americas",
  "alquiler-de-motores-y-fourwheels":
    "alquiler alquileres alquileres de motocicleta motocicleta motocicletas moto motos motor motores pasola pasolas scooter fourwheels forweels forwheels four wheels cuatrimoto cuatrimotos atv buggy buggies rentar",
  "call-centers":
    "call center call centers centro de llamadas contact center bpo teleoperador telemercadeo",
  "deportes-acuaticos":
    "deporte deportes acuaticos water sports kitesurf kite surf paddle kayak jet ski snorkel buceo diving windsurf",
  "mar-y-buceo":
    "deportes acuaticos water sports snorkel buceo diving inmersion arrecife",
  farmacias: "farmacia botica medicamentos medicinas droguería",
  // Western Union y Caribe Express cambian divisas además de girar dinero, que es
  // lo que hay en Juan Dolio: quien busca "casa de cambio" llega a ellos o a nada.
  "remesas-y-envios":
    "envio de dinero remesa remesas courier paqueteria casa de cambio casas de cambios cambio de divisas dolares euros",
};

/**
 * Every extra word an entry answers to, from the sections and subcategories its
 * path runs through. A segment nobody has listed contributes nothing.
 */
export function keywordsFor(routePath: string): string {
  const segments = canonicalPath(routePath).split("/").filter(Boolean);
  // The first segment is the city: a city name is not a kind of business.
  return segments
    .slice(1)
    .map((segment) => KEYWORDS[segment])
    .filter(Boolean)
    .join(" ");
}

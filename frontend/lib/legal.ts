// La política de privacidad y los términos de uso, en los dos idiomas. Viven aparte
// de lib/i18n.ts porque son prosa larga que se lee entera en una sola página, no
// palabras sueltas de la interfaz.
//
// Lo que declaran tiene que coincidir con lo que el portal hace de verdad: si una
// función empieza a recoger o compartir otro dato (un píxel nuevo, un formulario
// nuevo), se dice aquí y se cambia la fecha.

import type { Locale } from "@/lib/i18n";

/** Un párrafo, o una lista cuando es un arreglo. */
export type LegalBlock = string | string[];

export interface LegalDocument {
  title: string;
  description: string;
  updated: string;
  sections: { heading: string; body: LegalBlock[] }[];
  /** El texto del enlace al formulario de contacto que cierra la página. */
  contact: string;
}

const UPDATED = { es: "25 de septiembre de 2026", en: "September 25, 2026" };

/**
 * Quién responde del portal y de los datos (Ley 172-13, Ley 358-05). Lo dicen los dos
 * documentos, y de aquí sale en los dos idiomas.
 */
const OPERATOR = {
  es: "Rubén Tejada, persona física con domicilio en Santo Domingo, República Dominicana",
  en: "Rubén Tejada, an individual domiciled in Santo Domingo, Dominican Republic",
};

const privacy: Record<Locale, LegalDocument> = {
  es: {
    title: "Política de privacidad",
    description:
      "Quién es el responsable de QueHacerRD.com, qué datos recoge, para qué y con qué base, con quién los comparte, cuánto los guarda y cómo ejercer tus derechos.",
    updated: UPDATED.es,
    sections: [
      {
        heading: "Quién es el responsable",
        body: [
          `QueHacerRD.com es una guía de restaurantes, lugares, eventos y planes en ciudades de la República Dominicana. El responsable del portal y de los datos personales que se tratan en él es ${OPERATOR.es}.`,
          "Esta política explica, conforme a la Ley 172-13 sobre protección de datos de carácter personal, qué datos tratamos cuando usas el portal y qué puedes hacer con ellos. Para cualquier asunto sobre tus datos, escríbenos desde el formulario de contacto eligiendo «Mis datos personales».",
        ],
      },
      {
        heading: "Qué datos recogemos",
        body: [
          [
            "Tu cuenta: cuando entras con Google o con el enlace que te enviamos por correo, guardamos tu nombre, tu dirección de correo, la fecha en que creaste la cuenta y la de tu último acceso. No guardamos contraseñas: Google o tu propio correo son los que confirman que eres tú. De Google solo recibimos tu nombre, tu correo y si está verificado.",
            "Tus opiniones: la valoración y el comentario que publiques sobre un lugar, con la fecha. Se muestran públicamente junto a tu nombre; tu correo nunca se muestra.",
            "Tus favoritos: los lugares que guardas. Solo los ves tú.",
            "Formulario de contacto: tu nombre, tu correo, el teléfono y el negocio si los das, y tu mensaje.",
            "Solicitudes de reserva: la fecha, la hora, cuántas personas van, tu nombre, tu correo, tu teléfono y tus notas.",
            "Datos técnicos: la dirección IP y el navegador con el que nos visitas, que usamos para limitar el abuso de los formularios.",
            "Medición, solo si la aceptas: las páginas que visitas y cómo llegaste a ellas, que recogen Google Analytics y el píxel de Meta.",
          ],
          "No pedimos ni queremos datos sensibles (salud, religión, opiniones políticas y similares). No los escribas en una opinión ni en un mensaje.",
        ],
      },
      {
        heading: "Para qué los usamos y con qué base",
        body: [
          [
            "Tu cuenta, tus opiniones y tus favoritos: para darte el servicio que pides al crear la cuenta. La base es tu consentimiento, que das al registrarte y retiras borrando la cuenta.",
            "Tus mensajes y solicitudes de reserva: para atender lo que tú nos pides, lo que incluye pasar la solicitud de reserva al establecimiento o al operador que elegiste. La base es tu propia solicitud.",
            "Moderación y prevención del abuso: ocultar una opinión o suspender una cuenta que incumpla los términos de uso, y limitar los envíos de una misma IP. La base es nuestro interés legítimo en proteger el portal y a quienes lo usan.",
            "Medición del uso del portal y de nuestros anuncios: solo si la aceptas en el aviso de cookies. Puedes retirarla cuando quieras en «Preferencias de cookies», al pie de cada página.",
            "Cumplir la ley: conservar o entregar datos cuando una ley o un tribunal lo exija.",
          ],
          "No vendemos tus datos, no los usamos para enviarte publicidad por correo y no tomamos decisiones automatizadas que te afecten.",
        ],
      },
      {
        heading: "Con quién los compartimos",
        body: [
          [
            "Establecimientos y operadores: cuando pides una reserva, reciben tu solicitud y tus datos de contacto para confirmarla. A partir de ahí los tratan como responsables propios.",
            "Google: el inicio de sesión con Google y los mapas. Si aceptas la medición, también Google Analytics.",
            "Meta (Facebook e Instagram): solo si aceptas la medición. Su píxel mide las visitas que llegan desde nuestros anuncios, y cuando envías el formulario de contacto le comunicamos ese hecho con tu correo y tu teléfono cifrados de forma irreversible (hash), tu IP y tu navegador.",
            "Microsoft Azure: aloja el portal y su base de datos.",
            "Nuestro proveedor de correo: envía el enlace de acceso, las confirmaciones y los avisos de los formularios.",
            "Autoridades: cuando una ley o una orden judicial nos obligue.",
          ],
          "Varios de estos proveedores guardan la información fuera de la República Dominicana, principalmente en Estados Unidos. Solo trabajamos con proveedores que se comprometen por contrato a proteger los datos, y la medición, que es lo que no hace falta para darte el servicio, solo se activa con tu consentimiento. Cada uno trata los datos según su propia política de privacidad.",
        ],
      },
      {
        heading: "Cookies y almacenamiento en tu navegador",
        body: [
          "Imprescindibles, que no necesitan tu consentimiento:",
          [
            "Sesión (qh_session): mantiene tu cuenta abierta hasta 60 días.",
            "Inicio con Google: tres cookies de diez minutos que protegen el ida y vuelta con Google.",
            "Tu elección sobre las cookies (qh_consent): la recuerda seis meses; después te volvemos a preguntar.",
            "Tema claro u oscuro: tu preferencia se guarda en el almacenamiento local del navegador.",
          ],
          "De medición, solo si las aceptas: Google Analytics (_ga, _ga_*) y el píxel de Meta (_fbp, _fbc). Mientras no contestes el aviso, o si lo rechazas, no se cargan. Si retiras un consentimiento ya dado, las borramos.",
          "Puedes cambiar tu elección en «Preferencias de cookies», al pie de cada página, y borrar o bloquear las cookies desde tu navegador. Si bloqueas la de sesión no podrás entrar en tu cuenta.",
        ],
      },
      {
        heading: "Cuánto tiempo los guardamos",
        body: [
          [
            "Tu cuenta, tus opiniones y tus favoritos: mientras la cuenta exista. Al borrarla se borran también tus opiniones y tus favoritos.",
            "Mensajes de contacto: dos años, y después se borran automáticamente.",
            "Solicitudes de reserva: un año, y después se borran automáticamente.",
            "Datos de medición: lo que fije la configuración de Google Analytics y de Meta.",
          ],
          "Una copia de seguridad puede conservar un dato borrado durante el breve tiempo que tarda en renovarse.",
        ],
      },
      {
        heading: "Tus derechos",
        body: [
          "La Ley 172-13 te reconoce, sin coste, el derecho a:",
          [
            "Acceder a tus datos: desde el menú de tu cuenta, «Descargar mis datos» te da al momento tu cuenta, tus opiniones y tus favoritos.",
            "Rectificarlos: cambia tu nombre entrando de nuevo con el enlace por correo, y tus opiniones editándolas en la ficha del lugar.",
            "Suprimirlos (cancelación): «Borrar mi cuenta», en el menú de tu cuenta, lo borra todo en el momento. Tus opiniones también se pueden borrar una a una.",
            "Oponerte a su uso y retirar tu consentimiento: rechaza la medición en «Preferencias de cookies»; lo ya hecho con él sigue siendo válido.",
          ],
          "Para lo demás —los datos de un mensaje o de una reserva, por ejemplo— escríbenos desde el formulario de contacto con el tipo «Mis datos personales», desde el mismo correo que usaste, para que podamos comprobar que eres tú. Si no te respondemos o no estás conforme con la respuesta, la Constitución (artículo 70) y la Ley 172-13 te permiten reclamar ante los tribunales mediante la acción de hábeas data.",
          "Si vives en la Unión Europea o en el Reino Unido, el Reglamento General de Protección de Datos te reconoce además el derecho a la portabilidad (la descarga de tus datos sirve para eso) y el de reclamar ante la autoridad de protección de datos de tu país.",
        ],
      },
      {
        heading: "Seguridad",
        body: [
          "El portal solo se sirve por HTTPS; la sesión es una cookie firmada que no se puede alterar; no guardamos contraseñas; los mensajes y las reservas nunca se publican y solo los ven los editores del portal; y lo que enviamos a Meta viaja cifrado de forma irreversible. Ningún sistema es infalible: si ocurriera una brecha que afectara a tus datos, te lo haríamos saber.",
        ],
      },
      {
        heading: "Menores",
        body: [
          "El portal no está dirigido a menores de edad. Para crear una cuenta, publicar opiniones o pedir una reserva tienes que tener al menos 18 años. Si sabemos que una cuenta es de un menor, la borramos.",
        ],
      },
      {
        heading: "Cambios en esta política",
        body: [
          "Si cambiamos lo que hacemos con tus datos, actualizaremos esta página y su fecha. Si el cambio necesita tu consentimiento, te lo volveremos a pedir.",
        ],
      },
    ],
    contact: "Escríbenos desde el formulario de contacto",
  },
  en: {
    title: "Privacy policy",
    description:
      "Who is responsible for QueHacerRD.com, what data it collects, why and on what basis, who it is shared with, how long it is kept and how to exercise your rights.",
    updated: UPDATED.en,
    sections: [
      {
        heading: "Who is responsible",
        body: [
          `QueHacerRD.com is a guide to restaurants, places, events and plans in cities of the Dominican Republic. The portal and the personal data processed on it are the responsibility of ${OPERATOR.en}.`,
          "This policy explains, under Dominican Law 172-13 on the protection of personal data, what data we process when you use the portal and what you can do about it. For anything about your data, write to us through the contact form choosing “My personal data”.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          [
            "Your account: when you sign in with Google or with the link we email you, we store your name, your email address, the date you created the account and the date you last signed in. We store no passwords: Google or your own inbox is what proves it is you. From Google we receive only your name, your email and whether it is verified.",
            "Your reviews: the rating and comment you publish about a place, with the date. They are shown publicly next to your name; your email is never shown.",
            "Your favourites: the places you save. Only you can see them.",
            "Contact form: your name, your email, your phone and business if you give them, and your message.",
            "Reservation requests: the date, time, party size, your name, email, phone and notes.",
            "Technical data: the IP address and browser you visit with, which we use to limit abuse of the forms.",
            "Measurement, only if you accept it: the pages you visit and how you reached them, collected by Google Analytics and the Meta pixel.",
          ],
          "We do not ask for or want sensitive data (health, religion, political opinions and the like). Please do not write it in a review or a message.",
        ],
      },
      {
        heading: "What we use it for, and on what basis",
        body: [
          [
            "Your account, reviews and favourites: to provide the service you ask for when you create the account. The basis is your consent, given when you sign up and withdrawn by deleting the account.",
            "Your messages and reservation requests: to deal with what you ask us, which includes passing the reservation request on to the venue or operator you chose. The basis is your own request.",
            "Moderation and abuse prevention: hiding a review or suspending an account that breaks the terms of use, and limiting submissions from one IP. The basis is our legitimate interest in protecting the portal and the people who use it.",
            "Measuring how the portal and our ads are used: only if you accept it in the cookie notice. You can withdraw it at any time under “Cookie preferences” at the foot of every page.",
            "Complying with the law: keeping or handing over data when a law or a court requires it.",
          ],
          "We do not sell your data, we do not use it to send you marketing email, and we make no automated decisions that affect you.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          [
            "Venues and operators: when you request a reservation, they receive your request and contact details to confirm it. From then on they process them as controllers in their own right.",
            "Google: Google sign-in and the maps. If you accept measurement, Google Analytics too.",
            "Meta (Facebook and Instagram): only if you accept measurement. Its pixel measures visits coming from our ads, and when you send the contact form we report that event with your email and phone irreversibly hashed, your IP and your browser.",
            "Microsoft Azure: hosts the portal and its database.",
            "Our email provider: sends the sign-in link, the confirmations and the form notifications.",
            "Authorities: when a law or a court order obliges us.",
          ],
          "Several of these providers store information outside the Dominican Republic, mainly in the United States. We only work with providers that commit by contract to protecting the data, and measurement — the part not needed to provide the service — only runs with your consent. Each of them processes the data under its own privacy policy.",
        ],
      },
      {
        heading: "Cookies and browser storage",
        body: [
          "Essential, which need no consent:",
          [
            "Session (qh_session): keeps you signed in for up to 60 days.",
            "Google sign-in: three ten-minute cookies that protect the round trip to Google.",
            "Your cookie choice (qh_consent): remembered for six months, after which we ask again.",
            "Light or dark theme: your preference is kept in the browser's local storage.",
          ],
          "Measurement, only if you accept it: Google Analytics (_ga, _ga_*) and the Meta pixel (_fbp, _fbc). Until you answer the notice, or if you reject it, they are not loaded. If you withdraw consent you gave earlier, we delete them.",
          "You can change your choice under “Cookie preferences” at the foot of every page, and delete or block cookies in your browser. If you block the session cookie you will not be able to sign in.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          [
            "Your account, reviews and favourites: while the account exists. Deleting it deletes your reviews and favourites too.",
            "Contact messages: two years, then deleted automatically.",
            "Reservation requests: one year, then deleted automatically.",
            "Measurement data: as set in the Google Analytics and Meta configuration.",
          ],
          "A backup may hold deleted data for the short time it takes to be replaced.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "Law 172-13 gives you, free of charge, the right to:",
          [
            "Access your data: “Download my data” in your account menu gives you your account, reviews and favourites at once.",
            "Correct it: change your name by signing in again with the email link, and your reviews by editing them on the place's page.",
            "Delete it: “Delete my account” in your account menu erases everything on the spot. Reviews can also be deleted one by one.",
            "Object to its use and withdraw your consent: reject measurement under “Cookie preferences”; what was done with it before remains valid.",
          ],
          "For anything else — the data in a message or a reservation, for instance — write to us through the contact form with the type “My personal data”, from the same email you used, so we can check it is you. If we do not answer or you disagree with the answer, the Constitution (article 70) and Law 172-13 let you go to court through a habeas data action.",
          "If you live in the European Union or the United Kingdom, the General Data Protection Regulation also gives you the right to data portability (the data download serves that purpose) and to complain to your country's data protection authority.",
        ],
      },
      {
        heading: "Security",
        body: [
          "The portal is served over HTTPS only; the session is a signed cookie that cannot be tampered with; we store no passwords; messages and reservations are never published and only the portal's editors see them; and what we send to Meta travels irreversibly hashed. No system is infallible: if a breach affected your data, we would let you know.",
        ],
      },
      {
        heading: "Children",
        body: [
          "The portal is not aimed at minors. You must be at least 18 to create an account, publish reviews or request a reservation. If we learn an account belongs to a minor, we delete it.",
        ],
      },
      {
        heading: "Changes to this policy",
        body: [
          "If we change what we do with your data, we will update this page and its date. If the change needs your consent, we will ask for it again.",
        ],
      },
    ],
    contact: "Write to us through the contact form",
  },
};

const terms: Record<Locale, LegalDocument> = {
  es: {
    title: "Términos de uso",
    description:
      "Las condiciones para usar QueHacerRD.com, publicar opiniones, pedir reservas y denunciar contenido.",
    updated: UPDATED.es,
    sections: [
      {
        heading: "Quién presta el servicio",
        body: [
          `QueHacerRD.com lo presta ${OPERATOR.es}. Puedes escribirnos desde el formulario de contacto.`,
        ],
      },
      {
        heading: "El servicio",
        body: [
          "QueHacerRD.com es una guía gratuita de lugares, eventos y planes. Al usar el portal aceptas estos términos y la política de privacidad; si no estás de acuerdo, no lo uses. Para crear una cuenta, publicar opiniones o pedir una reserva tienes que tener al menos 18 años.",
        ],
      },
      {
        heading: "La información del portal",
        body: [
          "Buena parte de lo que publicamos procede de terceros: Google, los portales de venta de entradas, la cartelera de los cines, las redes sociales y los sitios de los propios establecimientos, y parte de los textos se redacta o se traduce con ayuda de herramientas automáticas. La revisamos, pero puede estar incompleta o haber cambiado: horarios, precios, menús y fechas cambian sin aviso. Confírmalos con el establecimiento antes de ir. No somos responsables de los servicios que prestan los establecimientos ni de su calidad.",
        ],
      },
      {
        heading: "Precios",
        body: [
          "No vendemos nada en el portal. Los precios que mostramos —de una carta, de una excursión, de una entrada— los publica el establecimiento o un tercero, son orientativos y no son una oferta nuestra: el precio que vale es el que te indique quien presta el servicio. Las entradas se compran en el sitio del vendedor, con sus condiciones.",
        ],
      },
      {
        heading: "Cómo ordenamos los listados y qué es publicidad",
        body: [
          "Los listados se ordenan por la valoración de Google y, a igualdad, por cuántas personas la dieron; lo que no tiene valoración va al final. Ningún pago cambia ese orden. Si publicamos contenido patrocinado o anuncios, irán identificados como tales.",
        ],
      },
      {
        heading: "Reservas",
        body: [
          "Una solicitud de reserva no es una reserva confirmada. La pasamos al establecimiento o al operador, que es quien la confirma, la rechaza o te propone otra hora. No cobramos nada por ella ni intervenimos en el pago.",
        ],
      },
      {
        heading: "Tu cuenta",
        body: [
          "Una cuenta es de una persona. Usa tu nombre real o uno que te identifique, y no te hagas pasar por otra persona o por un negocio. Eres responsable de lo que se publique desde tu cuenta. Puedes borrarla cuando quieras desde su menú.",
        ],
      },
      {
        heading: "Tus opiniones",
        body: [
          "Las opiniones sirven para que otros visitantes decidan. Por eso deben:",
          [
            "Contar tu propia experiencia en ese lugar.",
            "No contener insultos, amenazas, discriminación, contenido sexual, datos personales de otras personas ni nada ilegal.",
            "No ser publicidad, spam ni opiniones falsas, compradas o escritas por el dueño, un empleado o un competidor del lugar.",
          ],
          "Cómo funcionan: cualquier persona con cuenta puede opinar, una vez por lugar; no comprobamos que haya visitado el sitio. Se publican al momento, sin revisión previa, y se muestran de la más reciente a la más antigua. La valoración de QueHacerRD es la media de las opiniones visibles y se muestra siempre aparte de la de Google, que procede de Google y que no controlamos.",
          "Al publicar una opinión nos das permiso, sin coste y mientras siga publicada, para mostrarla en el portal y en sus traducciones. Puedes editarla o borrarla cuando quieras. Podemos ocultar una opinión que incumpla estas reglas y suspender la cuenta de quien las incumpla repetidamente.",
        ],
      },
      {
        heading: "Denunciar contenido",
        body: [
          "Si una opinión, una foto o cualquier otro contenido del portal infringe la ley o tus derechos —tu intimidad, tu honor, o tus derechos de autor sobre una foto conforme a la Ley 65-00—, escríbenos desde el formulario de contacto con el tipo «Denunciar contenido», el enlace a la página y el motivo. Lo revisamos, lo retiramos si procede y te respondemos con lo que decidimos. Si eres el autor de una opinión retirada, también te lo explicamos.",
        ],
      },
      {
        heading: "Enlaces a otros sitios",
        body: [
          "El portal enlaza a sitios de terceros (establecimientos, venta de entradas, mapas, redes sociales). No controlamos su contenido ni sus condiciones.",
        ],
      },
      {
        heading: "Propiedad intelectual",
        body: [
          "Los textos, el diseño y la marca QueHacerRD pertenecen al portal. Las fotos pertenecen a sus autores. Las de Wikimedia Commons se publican bajo la licencia que eligió su autor (Creative Commons o dominio público) y las de Google Maps bajo las condiciones de Google: unas y otras llevan junto a la foto el nombre de su autor, la licencia cuando la hay y un enlace a su origen, y es esa licencia, no lo que dice este apartado, la que decide cómo se pueden reutilizar. Las demás fotos proceden de los propios establecimientos. Si eres autor de una foto y tu nombre falta o está mal, o quieres que la retiremos, usa «Denunciar contenido». No copies el contenido del portal de forma masiva ni con fines comerciales sin nuestro permiso.",
        ],
      },
      {
        heading: "Responsabilidad",
        body: [
          "El portal se ofrece tal como está. En la medida en que la ley lo permita, no respondemos de los daños que resulten de usar la información publicada, de una reserva no atendida o de una interrupción del servicio. Nada de esto limita los derechos que te reconocen la Ley 358-05 de protección de los derechos del consumidor o cualquier otra norma que no se pueda renunciar.",
        ],
      },
      {
        heading: "Ley aplicable y cambios",
        body: [
          "Estos términos se rigen por las leyes de la República Dominicana, sin perjuicio de las normas de protección al consumidor que te correspondan. Si los cambiamos, actualizaremos esta página y su fecha; seguir usando el portal después significa aceptar la nueva versión.",
        ],
      },
    ],
    contact: "Dudas sobre estos términos: escríbenos desde el formulario de contacto",
  },
  en: {
    title: "Terms of use",
    description:
      "The terms for using QueHacerRD.com, publishing reviews, requesting reservations and reporting content.",
    updated: UPDATED.en,
    sections: [
      {
        heading: "Who provides the service",
        body: [
          `QueHacerRD.com is provided by ${OPERATOR.en}. You can write to us through the contact form.`,
        ],
      },
      {
        heading: "The service",
        body: [
          "QueHacerRD.com is a free guide to places, events and plans. By using the portal you accept these terms and the privacy policy; if you do not agree, do not use it. You must be at least 18 to create an account, publish reviews or request a reservation.",
        ],
      },
      {
        heading: "The portal's information",
        body: [
          "Much of what we publish comes from third parties: Google, ticketing sites, the cinemas' listings, social networks and the venues' own websites, and some of the text is written or translated with the help of automated tools. We review it, but it may be incomplete or out of date: opening hours, prices, menus and dates change without notice. Confirm them with the venue before you go. We are not responsible for the services venues provide or their quality.",
        ],
      },
      {
        heading: "Prices",
        body: [
          "We sell nothing on the portal. The prices we show — on a menu, for a tour, for a ticket — are published by the venue or a third party, are for guidance only and are not an offer of ours: the price that counts is the one the provider gives you. Tickets are bought on the seller's site, under its terms.",
        ],
      },
      {
        heading: "How listings are ordered, and what is advertising",
        body: [
          "Listings are ordered by Google rating and, when tied, by how many people gave it; anything without a rating goes last. No payment changes that order. If we publish sponsored content or ads, they will be labelled as such.",
        ],
      },
      {
        heading: "Reservations",
        body: [
          "A reservation request is not a confirmed reservation. We pass it on to the venue or operator, who confirms it, declines it or suggests another time. We charge nothing for it and take no part in payment.",
        ],
      },
      {
        heading: "Your account",
        body: [
          "An account belongs to one person. Use your real name or one that identifies you, and do not impersonate another person or a business. You are responsible for what is published from your account. You can delete it at any time from its menu.",
        ],
      },
      {
        heading: "Your reviews",
        body: [
          "Reviews exist to help other visitors decide. That is why they must:",
          [
            "Describe your own experience at that place.",
            "Contain no insults, threats, discrimination, sexual content, other people's personal data or anything illegal.",
            "Not be advertising, spam, or fake or paid reviews, nor be written by the owner, an employee or a competitor of the place.",
          ],
          "How they work: anyone with an account can review, once per place; we do not check that they visited it. Reviews are published right away, without prior checks, and shown newest first. The QueHacerRD rating is the average of the visible reviews and is always shown apart from Google's, which comes from Google and which we do not control.",
          "By publishing a review you allow us, free of charge and for as long as it stays published, to show it on the portal and in its translations. You can edit or delete it at any time. We may hide a review that breaks these rules and suspend the account of anyone who breaks them repeatedly.",
        ],
      },
      {
        heading: "Reporting content",
        body: [
          "If a review, a photo or any other content on the portal breaks the law or infringes your rights — your privacy, your reputation, or your copyright in a photo under Dominican Law 65-00 — write to us through the contact form with the type “Report content”, the link to the page and the reason. We review it, take it down if warranted and reply with what we decided. If you wrote a review that was taken down, we explain why to you as well.",
        ],
      },
      {
        heading: "Links to other sites",
        body: [
          "The portal links to third-party sites (venues, ticketing, maps, social networks). We do not control their content or their terms.",
        ],
      },
      {
        heading: "Intellectual property",
        body: [
          "The text, design and QueHacerRD brand belong to the portal. Photos belong to their authors. Those from Wikimedia Commons are published under the licence their author chose (Creative Commons or public domain) and those from Google Maps under Google's terms: both carry, next to the photo, the author's name, the licence where there is one and a link to where it comes from, and it is that licence, not this section, that decides how they may be reused. The other photos come from the venues themselves. If you are the author of a photo and your name is missing or wrong, or you want the photo removed, use “Report content”. Do not copy the portal's content in bulk or for commercial purposes without our permission.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "The portal is provided as is. To the extent the law allows, we are not liable for damage resulting from using the published information, from a reservation that was not honoured, or from an interruption of the service. None of this limits the rights you have under Dominican consumer protection Law 358-05 or any other rule that cannot be waived.",
        ],
      },
      {
        heading: "Governing law and changes",
        body: [
          "These terms are governed by the laws of the Dominican Republic, without prejudice to the consumer protection rules that apply to you. If we change them, we will update this page and its date; continuing to use the portal afterwards means accepting the new version.",
        ],
      },
    ],
    contact: "Questions about these terms: write to us through the contact form",
  },
};

export const LEGAL = { privacy, terms };

/** Code routes, the same Spanish segment in both languages, like /contacto. */
export const LEGAL_PATHS = { privacy: "/privacidad", terms: "/terminos" } as const;

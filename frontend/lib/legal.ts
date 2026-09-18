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

const UPDATED = { es: "18 de septiembre de 2026", en: "September 18, 2026" };

const privacy: Record<Locale, LegalDocument> = {
  es: {
    title: "Política de privacidad",
    description:
      "Qué datos recoge QueHacerRD.com, para qué los usa, con quién los comparte y cómo pedir que se borren.",
    updated: UPDATED.es,
    sections: [
      {
        heading: "Quiénes somos",
        body: [
          "QueHacerRD.com es una guía de restaurantes, lugares, eventos y planes en ciudades de la República Dominicana. Esta política explica qué datos personales tratamos cuando usas el portal y qué puedes hacer con ellos.",
        ],
      },
      {
        heading: "Qué datos recogemos",
        body: [
          [
            "Tu cuenta: cuando entras con Google o con el enlace que te enviamos por correo, guardamos tu nombre y tu dirección de correo. No guardamos contraseñas: Google o tu propio correo son los que confirman que eres tú. De Google solo recibimos tu nombre, tu correo y si está verificado.",
            "Tus opiniones: la valoración y el comentario que publiques sobre un lugar, con la fecha. Se muestran públicamente junto a tu nombre; tu correo nunca se muestra.",
            "Tus favoritos: los lugares que guardas. Solo los ves tú.",
            "Formulario de contacto: tu nombre, tu correo, el teléfono si lo das y tu mensaje.",
            "Solicitudes de reserva: la fecha, la hora, cuántas personas van, tu nombre, tu correo, tu teléfono y tus notas.",
            "Datos técnicos: la dirección IP y el navegador con el que nos visitas, que usamos para limitar el abuso de los formularios y que reciben los servicios de medición descritos más abajo.",
          ],
        ],
      },
      {
        heading: "Para qué los usamos",
        body: [
          [
            "Para que puedas entrar, publicar opiniones y guardar favoritos.",
            "Para responder a tus mensajes y pasar tus solicitudes de reserva al establecimiento que elegiste.",
            "Para moderar el contenido: un editor puede ocultar una opinión o suspender una cuenta que incumpla los términos de uso.",
            "Para saber cómo se usa el portal y medir nuestras campañas de publicidad.",
          ],
          "No vendemos tus datos ni los usamos para enviarte publicidad por correo.",
        ],
      },
      {
        heading: "Con quién los compartimos",
        body: [
          [
            "Establecimientos: cuando pides una reserva, el establecimiento recibe tu solicitud y tus datos de contacto para confirmarla.",
            "Google: el inicio de sesión con Google, los mapas y Google Analytics, que mide las visitas con cookies propias.",
            "Meta (Facebook e Instagram): su píxel mide las visitas desde nuestros anuncios. Cuando envías el formulario de contacto le comunicamos ese hecho con tu correo y tu teléfono cifrados de forma irreversible (hash), tu IP y tu navegador.",
            "Microsoft Azure: aloja el portal y su base de datos.",
            "Nuestro proveedor de correo: envía el enlace de acceso, las confirmaciones y los avisos de los formularios.",
          ],
          "Cada uno de ellos trata los datos según su propia política de privacidad. Algunos de estos servicios guardan la información fuera de la República Dominicana.",
        ],
      },
      {
        heading: "Cookies y almacenamiento en tu navegador",
        body: [
          [
            "Sesión (qh_session): mantiene tu cuenta abierta hasta 60 días. Es imprescindible para entrar.",
            "Inicio con Google: tres cookies de diez minutos que protegen el ida y vuelta con Google.",
            "Tema claro u oscuro: tu preferencia se guarda en el almacenamiento local del navegador.",
            "Medición: Google Analytics y el píxel de Meta ponen sus propias cookies (por ejemplo _ga y _fbp).",
          ],
          "Puedes borrar o bloquear las cookies desde tu navegador. Si bloqueas la de sesión no podrás entrar en tu cuenta.",
        ],
      },
      {
        heading: "Cuánto tiempo los guardamos",
        body: [
          "Tu cuenta, tus opiniones y tus favoritos se guardan mientras la cuenta exista. Si nos pides borrarla, se borran también tus opiniones y tus favoritos. Los mensajes de contacto y las solicitudes de reserva se guardan el tiempo necesario para atenderlos y resolver cualquier reclamación posterior.",
        ],
      },
      {
        heading: "Tus derechos",
        body: [
          "Conforme a la Ley 172-13 de la República Dominicana sobre protección de datos personales, puedes pedirnos acceso a tus datos, que los corrijamos o que los borremos, y oponerte a su uso. Escríbenos desde el formulario de contacto con el correo de tu cuenta y te responderemos. Puedes borrar tus opiniones tú mismo en cualquier momento desde la ficha del lugar.",
        ],
      },
      {
        heading: "Menores",
        body: [
          "El portal no está dirigido a menores de 13 años y no creamos cuentas para ellos a sabiendas.",
        ],
      },
      {
        heading: "Cambios en esta política",
        body: [
          "Si cambiamos lo que hacemos con tus datos, actualizaremos esta página y su fecha.",
        ],
      },
    ],
    contact: "Escríbenos desde el formulario de contacto",
  },
  en: {
    title: "Privacy policy",
    description:
      "What data QueHacerRD.com collects, what it is used for, who it is shared with and how to have it deleted.",
    updated: UPDATED.en,
    sections: [
      {
        heading: "Who we are",
        body: [
          "QueHacerRD.com is a guide to restaurants, places, events and plans in cities of the Dominican Republic. This policy explains what personal data we process when you use the portal and what you can do about it.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          [
            "Your account: when you sign in with Google or with the link we email you, we store your name and email address. We store no passwords: Google or your own inbox is what proves it is you. From Google we receive only your name, your email and whether it is verified.",
            "Your reviews: the rating and comment you publish about a place, with the date. They are shown publicly next to your name; your email is never shown.",
            "Your favourites: the places you save. Only you can see them.",
            "Contact form: your name, your email, your phone if you give it, and your message.",
            "Reservation requests: the date, time, party size, your name, email, phone and notes.",
            "Technical data: the IP address and browser you visit with, which we use to limit abuse of the forms and which the measurement services described below receive.",
          ],
        ],
      },
      {
        heading: "What we use it for",
        body: [
          [
            "To let you sign in, publish reviews and save favourites.",
            "To answer your messages and pass your reservation requests on to the venue you chose.",
            "To moderate content: an editor can hide a review or suspend an account that breaks the terms of use.",
            "To understand how the portal is used and measure our advertising campaigns.",
          ],
          "We do not sell your data or use it to send you marketing email.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          [
            "Venues: when you request a reservation, the venue receives your request and contact details to confirm it.",
            "Google: Google sign-in, the maps, and Google Analytics, which measures visits with its own cookies.",
            "Meta (Facebook and Instagram): its pixel measures visits coming from our ads. When you send the contact form we report that event with your email and phone irreversibly hashed, your IP and your browser.",
            "Microsoft Azure: hosts the portal and its database.",
            "Our email provider: sends the sign-in link, the confirmations and the form notifications.",
          ],
          "Each of them processes the data under its own privacy policy. Some of these services store information outside the Dominican Republic.",
        ],
      },
      {
        heading: "Cookies and browser storage",
        body: [
          [
            "Session (qh_session): keeps you signed in for up to 60 days. Required to sign in.",
            "Google sign-in: three ten-minute cookies that protect the round trip to Google.",
            "Light or dark theme: your preference is kept in the browser's local storage.",
            "Measurement: Google Analytics and the Meta pixel set their own cookies (for example _ga and _fbp).",
          ],
          "You can delete or block cookies in your browser. If you block the session cookie you will not be able to sign in.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "Your account, reviews and favourites are kept while the account exists. If you ask us to delete it, your reviews and favourites are deleted with it. Contact messages and reservation requests are kept as long as needed to deal with them and with any later claim.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "Under Dominican Law 172-13 on personal data protection you can ask us for access to your data, have it corrected or deleted, and object to its use. Write to us through the contact form from your account's email and we will answer. You can delete your own reviews at any time from the place's page.",
        ],
      },
      {
        heading: "Children",
        body: [
          "The portal is not aimed at children under 13 and we do not knowingly create accounts for them.",
        ],
      },
      {
        heading: "Changes to this policy",
        body: [
          "If we change what we do with your data, we will update this page and its date.",
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
      "Las condiciones para usar QueHacerRD.com, publicar opiniones y pedir reservas.",
    updated: UPDATED.es,
    sections: [
      {
        heading: "El servicio",
        body: [
          "QueHacerRD.com es una guía gratuita de lugares, eventos y planes. Al usar el portal aceptas estos términos; si no estás de acuerdo, no lo uses.",
        ],
      },
      {
        heading: "La información del portal",
        body: [
          "Buena parte de lo que publicamos procede de terceros: Google, los portales de venta de entradas, la cartelera de los cines y los sitios de los propios establecimientos. La revisamos, pero puede estar incompleta o haber cambiado: horarios, precios, menús y fechas cambian sin aviso. Confírmalos con el establecimiento antes de ir. No somos responsables de los servicios que prestan los establecimientos ni de su calidad.",
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
          "Una cuenta es de una persona. Usa tu nombre real o uno que te identifique, y no te hagas pasar por otra persona o por un negocio. Eres responsable de lo que se publique desde tu cuenta.",
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
          "Al publicar una opinión nos das permiso, sin coste y mientras siga publicada, para mostrarla en el portal y en sus traducciones. Puedes editarla o borrarla cuando quieras. Podemos ocultar una opinión que incumpla estas reglas y suspender la cuenta de quien las incumpla repetidamente.",
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
          "Los textos, el diseño y la marca QueHacerRD pertenecen al portal. Las fotos pertenecen a sus autores y se muestran con su crédito o con permiso. No copies el contenido del portal de forma masiva ni con fines comerciales sin nuestro permiso.",
        ],
      },
      {
        heading: "Responsabilidad",
        body: [
          "El portal se ofrece tal como está. En la medida en que la ley lo permita, no respondemos de los daños que resulten de usar la información publicada, de una reserva no atendida o de una interrupción del servicio.",
        ],
      },
      {
        heading: "Ley aplicable y cambios",
        body: [
          "Estos términos se rigen por las leyes de la República Dominicana. Si los cambiamos, actualizaremos esta página y su fecha; seguir usando el portal después significa aceptar la nueva versión.",
        ],
      },
    ],
    contact: "Dudas sobre estos términos: escríbenos desde el formulario de contacto",
  },
  en: {
    title: "Terms of use",
    description:
      "The terms for using QueHacerRD.com, publishing reviews and requesting reservations.",
    updated: UPDATED.en,
    sections: [
      {
        heading: "The service",
        body: [
          "QueHacerRD.com is a free guide to places, events and plans. By using the portal you accept these terms; if you do not agree, do not use it.",
        ],
      },
      {
        heading: "The portal's information",
        body: [
          "Much of what we publish comes from third parties: Google, ticketing sites, the cinemas' listings and the venues' own websites. We review it, but it may be incomplete or out of date: opening hours, prices, menus and dates change without notice. Confirm them with the venue before you go. We are not responsible for the services venues provide or their quality.",
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
          "An account belongs to one person. Use your real name or one that identifies you, and do not impersonate another person or a business. You are responsible for what is published from your account.",
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
          "By publishing a review you allow us, free of charge and for as long as it stays published, to show it on the portal and in its translations. You can edit or delete it at any time. We may hide a review that breaks these rules and suspend the account of anyone who breaks them repeatedly.",
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
          "The text, design and QueHacerRD brand belong to the portal. Photos belong to their authors and are shown with their credit or with permission. Do not copy the portal's content in bulk or for commercial purposes without our permission.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "The portal is provided as is. To the extent the law allows, we are not liable for damage resulting from using the published information, from a reservation that was not honoured, or from an interruption of the service.",
        ],
      },
      {
        heading: "Governing law and changes",
        body: [
          "These terms are governed by the laws of the Dominican Republic. If we change them, we will update this page and its date; continuing to use the portal afterwards means accepting the new version.",
        ],
      },
    ],
    contact: "Questions about these terms: write to us through the contact form",
  },
};

export const LEGAL = { privacy, terms };

/** Code routes, the same Spanish segment in both languages, like /contacto. */
export const LEGAL_PATHS = { privacy: "/privacidad", terms: "/terminos" } as const;

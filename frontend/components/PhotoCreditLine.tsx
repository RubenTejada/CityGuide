import { Fragment, type ReactNode } from "react";

import type { Dictionary } from "@/lib/i18n";
import type { PhotoCredit } from "@/lib/umbraco";

/**
 * El crédito de una foto, en una línea pequeña bajo ella: "Foto: Autor · CC BY-SA 4.0 ·
 * Wikimedia Commons", o "Foto: Autor · Google Maps". El autor enlaza a la fuente — la
 * página del archivo en Commons, el perfil del autor en Google Maps —, la licencia a su
 * texto cuando es Creative Commons, y el proveedor se lee de la dirección de la fuente.
 * Es lo que piden CC BY y CC BY-SA (autor, licencia y enlace) y lo que piden las
 * condiciones de Google para sus fotos. Sin crédito no se dibuja nada: la foto que
 * publica el propio lugar, o la que sube un editor, no lleva ninguno.
 *
 * Varias fotos a la vez — las de una galería, que se ven juntas — van en una sola línea
 * con sus autores seguidos: "Fotos: Ana, Luis · Google Maps".
 *
 * Sin estado ni hooks, para que la usen igual la ficha (servidor) y la galería y el
 * visor (cliente); cada uno le pasa su diccionario.
 */
export default function PhotoCreditLine({
  credit,
  words,
  className = "",
}: {
  credit: PhotoCredit | (PhotoCredit | null | undefined)[] | null | undefined;
  words: Pick<
    Dictionary["place"],
    "photoCredit" | "photoCredits" | "photoPublicDomain"
  >;
  className?: string;
}) {
  const credits = distinct(
    (Array.isArray(credit) ? credit : [credit]).filter(
      (c): c is PhotoCredit => Boolean(c),
    ),
  );
  if (credits.length === 0) return null;

  // Sin autor conocido, el nombre del proveedor ocupa su sitio y enlaza a la fuente.
  const authors = credits.map((c) => {
    const label = c.author || providerOf(c.source);
    return label ? link(label, c.source) : null;
  });
  const licenses = unique(credits.map((c) => c.license)).map((license) =>
    link(
      /^public domain$/i.test(license) ? words.photoPublicDomain : license,
      licenseUrl(license),
    ),
  );
  const providers = unique(
    credits.map((c) => (c.author ? providerOf(c.source) : null)),
  );
  const parts = [
    joined(authors.filter(Boolean), ", "),
    joined(licenses, ", "),
    providers.join(", "),
  ].filter((part) => part !== null && part !== "");

  return (
    <p className={`text-[11px] leading-snug ${className}`}>
      {credits.length > 1 ? words.photoCredits : words.photoCredit}:{" "}
      {joined(parts, " · ")}
    </p>
  );
}

function distinct(credits: PhotoCredit[]): PhotoCredit[] {
  const seen = new Set<string>();
  return credits.filter((c) => {
    const key = `${c.author}|${c.source}|${c.license}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function joined(parts: ReactNode[], separator: string): ReactNode {
  if (parts.length === 0) return null;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && separator}
      {part}
    </Fragment>
  ));
}

function link(label: string, href: string | null | undefined) {
  if (!href || !/^https?:\/\//.test(href)) return label;
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {label}
    </a>
  );
}

/** Quién sirve la foto, por la dirección de su fuente. */
function providerOf(source: string): string | null {
  let host: string;
  try {
    host = new URL(source).hostname;
  } catch {
    return null;
  }
  if (host.endsWith("wikimedia.org")) return "Wikimedia Commons";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "Google Maps";
  return null;
}

/**
 * La dirección del texto de una licencia Creative Commons a partir de su nombre corto,
 * tal como lo escribe Commons ("CC BY-SA 4.0", "CC BY 3.0 de", "CC0"). Cualquier otra
 * cosa no enlaza: la fuente ya lleva a la página del archivo, que la dice.
 */
function licenseUrl(license: string): string | null {
  if (/^CC0\b/i.test(license)) {
    return "https://creativecommons.org/publicdomain/zero/1.0/";
  }
  const cc = /^CC BY(-(?:NC-)?(?:SA|ND)|-NC)? (\d\.\d)(?: ([a-z]{2}))?$/i.exec(
    license.trim(),
  );
  if (!cc) return null;
  const kind = `by${(cc[1] ?? "").toLowerCase()}`;
  return `https://creativecommons.org/licenses/${kind}/${cc[2]}/${cc[3] ? `${cc[3].toLowerCase()}/` : ""}`;
}

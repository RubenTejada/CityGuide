import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ContactForm from "@/components/ContactForm";
import { pageMetadata } from "@/lib/seo";
import { getItem } from "@/lib/umbraco";

export const revalidate = 600;

function description(cityName: string): string {
  return `Escríbenos para una consulta general, para pedir que agreguemos o quitemos un negocio de la guía de ${cityName}, o para anunciarte en ella.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = await getItem(`/${citySlug}`);
  return pageMetadata({
    title: "Contacto",
    description: description(city?.name ?? "la ciudad"),
    path: `/${citySlug}/contacto`,
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: citySlug } = await params;
  const city = await getItem(`/${citySlug}`);
  if (!city || city.contentType !== "city") notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Contacto</h1>
      <p className="mt-2 text-neutral-600">{description(city.name)}</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-neutral-600">
        <li>
          <strong className="font-semibold">Agregar mi negocio:</strong> dinos
          cómo se llama, dónde está y a qué se dedica.
        </li>
        <li>
          <strong className="font-semibold">Quitar mi negocio:</strong> pásanos
          el enlace de su página en el portal y lo retiramos.
        </li>
        <li>
          <strong className="font-semibold">Publicidad en el sitio:</strong>{" "}
          cuéntanos qué quieres promocionar y te enviamos las opciones y
          precios.
        </li>
      </ul>
      <div className="mt-8">
        <ContactForm />
      </div>
    </main>
  );
}

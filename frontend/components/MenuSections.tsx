import type { MenuGroup } from "@/lib/menu";

/**
 * La carta escrita: secciones, platos y precios tal como los publica el sitio del
 * restaurante. Solo la lista — quién la abre y de dónde salió lo pone MenuDialog.
 */
export default function MenuSections({ sections }: { sections: MenuGroup[] }) {
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
      {sections.map((section) => (
        <div key={section.name}>
          <h3 className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
            {section.name}
          </h3>
          <ul className="mt-2">
            {section.items.map((dish, index) => (
              <li
                key={`${dish.name}-${index}`}
                className="flex justify-between gap-4 border-b border-dashed border-neutral-200 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{dish.name}</p>
                  {dish.description && (
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {dish.description}
                    </p>
                  )}
                </div>
                {dish.price && (
                  <p className="shrink-0 text-sm font-semibold text-neutral-700 tabular-nums">
                    {dish.price}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

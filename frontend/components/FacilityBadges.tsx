import { facilityLabel, type Locale } from "@/lib/i18n";

export const FACILITY_ICONS: Record<string, string> = {
  Romántico: "❤",
  "Aire Acondicionado": "❄",
  "Horario Extendido": "🕐",
  "Restaurante en el Lugar": "🍴",
  Parqueo: "🅿",
  WiFi: "📶",
  Delivery: "🛵",
  Terraza: "🌴",
  "Música en Vivo": "🎵",
  "Apto para Niños": "👶",
};

/**
 * A place's facilities. The stored values are a closed Spanish vocabulary the agent
 * and the backoffice share — keys, not prose — so the English page translates them
 * here instead of the CMS holding a second copy.
 */
export default function FacilityBadges({
  facilities,
  locale,
}: {
  facilities: string[];
  locale: Locale;
}) {
  if (facilities.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {facilities.map((facility) => (
        <li
          key={facility}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700"
        >
          <span aria-hidden>{FACILITY_ICONS[facility] ?? "•"}</span>
          {facilityLabel(locale, facility)}
        </li>
      ))}
    </ul>
  );
}

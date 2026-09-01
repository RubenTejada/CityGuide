export const FACILITY_ICONS: Record<string, string> = {
  "Romántico": "❤",
  "Aire Acondicionado": "❄",
  "Horario Extendido": "🕐",
  "Restaurante en el Lugar": "🍴",
  "Parqueo": "🅿",
  "WiFi": "📶",
  "Delivery": "🛵",
  "Terraza": "🌴",
  "Música en Vivo": "🎵",
  "Apto para Niños": "👶",
};

export default function FacilityBadges({ facilities }: { facilities: string[] }) {
  if (facilities.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {facilities.map((facility) => (
        <li
          key={facility}
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700"
        >
          <span aria-hidden>{FACILITY_ICONS[facility] ?? "•"}</span>
          {facility}
        </li>
      ))}
    </ul>
  );
}

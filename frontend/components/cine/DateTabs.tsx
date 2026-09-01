import { PendingLink } from "@/components/LoadingOverlay";

function dateLabel(date: string, today: string): string {
  if (date === today) return "Hoy";
  const d = new Date(`${date}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  if (d.getTime() - t.getTime() === 86_400_000) return "Mañana";
  return new Intl.DateTimeFormat("es-DO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/**
 * The days a cartelera can be read for, as links carrying `?fecha=`. The first
 * date is the page's own default, so it links to the bare path and keeps the
 * canonical URL free of a query string.
 */
export default function DateTabs({
  dates,
  selected,
  today,
  basePath,
}: {
  dates: string[];
  selected: string;
  today: string;
  basePath: string;
}) {
  if (dates.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {dates.map((date) => (
        <PendingLink
          key={date}
          href={date === dates[0] ? basePath : `${basePath}?fecha=${date}`}
          className={
            date === selected
              ? "rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white"
              : "rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-brand-500 hover:text-brand-600"
          }
        >
          {dateLabel(date, today)}
        </PendingLink>
      ))}
    </div>
  );
}

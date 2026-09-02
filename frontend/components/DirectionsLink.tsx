/**
 * "Cómo llegar": opens Google Maps with directions to the place. The icon
 * variant is the Google Maps marker beside the page's title, where a labelled
 * pill would compete with the name; the link variant carries the words instead,
 * beside a map heading or inside a map popup.
 */
export default function DirectionsLink({
  href,
  label = "Cómo llegar",
  variant = "icon",
  className = "",
}: {
  href: string;
  label?: string;
  variant?: "icon" | "link";
  className?: string;
}) {
  const isIcon = variant === "icon";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={isIcon ? label : undefined}
      className={`inline-flex items-center ${
        isIcon
          ? "h-8 w-8 justify-center rounded-full border border-neutral-200 bg-white shadow-sm transition hover:bg-neutral-50"
          : "gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700 hover:underline"
      } ${className}`}
    >
      <MapsMarker className={isIcon ? "h-5 w-5" : "h-3.5 w-3.5"} />
      {!isIcon && label}
    </a>
  );
}

/** Google Maps' marker: its own colours, so the link reads as "go to Maps". */
function MapsMarker({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
    >
      <path
        d="M12 22s7-7.4 7-12a7 7 0 1 0-14 0c0 4.6 7 12 7 12z"
        fill="#EA4335"
      />
      <path d="M12 3a7 7 0 0 0-6.1 3.6l8.4 7.2A28 28 0 0 0 19 10a7 7 0 0 0-7-7z" fill="#FBBC04" />
      <path d="M5.9 6.6A7 7 0 0 0 5 10c0 2 1.3 4.5 2.8 6.6l6.5-2.8-8.4-7.2z" fill="#34A853" />
      <circle cx="12" cy="10" r="2.6" fill="#ffffff" />
    </svg>
  );
}

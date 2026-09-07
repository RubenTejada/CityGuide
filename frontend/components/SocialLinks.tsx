import { t, type Locale } from "@/lib/i18n";
import { SOCIAL_ACCOUNTS } from "@/lib/social";
import { FacebookIcon, InstagramIcon } from "./SocialIcons";

/**
 * The portal's own profiles, in the footer of every city. The same accounts the
 * Organization JSON-LD declares as `sameAs` (see `lib/social.ts`), so the page
 * says the same thing to a reader and to a crawler.
 */
export default function SocialLinks({
  locale,
  className = "",
}: {
  locale: Locale;
  className?: string;
}) {
  const words = t(locale).social;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-sm">{words.follow}</span>
      {SOCIAL_ACCOUNTS.map((account) => (
        <a
          key={account.url}
          href={account.url}
          target="_blank"
          rel="me noopener noreferrer"
          title={account.label}
          aria-label={account.label}
          className="text-neutral-400 transition hover:text-white"
        >
          {account.network === "facebook" ? <FacebookIcon /> : <InstagramIcon />}
        </a>
      ))}
    </div>
  );
}

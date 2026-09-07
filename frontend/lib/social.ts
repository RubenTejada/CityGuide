// The portal's own social accounts, and the links a visitor shares a page with.
//
// Both are here rather than in `seo.ts` because they are the same handful of
// facts seen from two sides: the profiles the site links to and declares as
// `sameAs`, and the networks a page is sent to. Nothing here fetches.

export type SocialNetwork = "facebook" | "instagram";

export type SocialAccount = {
  network: SocialNetwork;
  /** Shown as the accessible name of the footer link. */
  label: string;
  url: string;
};

/**
 * The accounts the portal publishes to. They are also what the Organization
 * JSON-LD declares as `sameAs`, which is how a search engine ties the site and
 * the profiles together — so a handle that changes has to change here.
 */
export const SOCIAL_ACCOUNTS: SocialAccount[] = [
  {
    network: "facebook",
    label: "Facebook",
    url: "https://www.facebook.com/quehacerrd",
  },
  {
    network: "instagram",
    label: "Instagram",
    url: "https://www.instagram.com/quehacerrd",
  },
];

export type ShareTarget = {
  id: "whatsapp" | "facebook" | "x" | "telegram";
  href: string;
};

/**
 * Where a page can be sent through a link. Instagram is absent from this list
 * because it publishes no share URL — a button for it would only open the app
 * on an empty composer; it is reached, like Threads or Messenger, through the
 * phone's own share sheet, which `ShareButtons` offers where the browser has
 * one (`navigator.share`).
 */
export function shareTargets(url: string, title: string): ShareTarget[] {
  const text = encodeURIComponent(`${title} — ${url}`);
  const link = encodeURIComponent(url);
  return [
    { id: "whatsapp", href: `https://wa.me/?text=${text}` },
    {
      id: "facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${link}`,
    },
    {
      id: "x",
      href: `https://twitter.com/intent/tweet?url=${link}&text=${encodeURIComponent(title)}`,
    },
    {
      id: "telegram",
      href: `https://t.me/share/url?url=${link}&text=${encodeURIComponent(title)}`,
    },
  ];
}

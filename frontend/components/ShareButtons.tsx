"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useWords } from "./LocaleProvider";
import { shareTargets, type ShareTarget } from "@/lib/social";
import {
  CheckIcon,
  FacebookIcon,
  LinkIcon,
  ShareIcon,
  TelegramIcon,
  WhatsAppIcon,
  XIcon,
} from "./SocialIcons";

const ICONS: Record<ShareTarget["id"], typeof FacebookIcon> = {
  whatsapp: WhatsAppIcon,
  facebook: FacebookIcon,
  x: XIcon,
  telegram: TelegramIcon,
};

const LABELS: Record<ShareTarget["id"], string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  x: "X",
  telegram: "Telegram",
};

/**
 * Sends the page somewhere else: the networks that publish a share URL, the
 * phone's own share sheet for the ones that do not — Instagram, Threads,
 * Messenger, whatever the visitor has installed — and the link itself for
 * everywhere else.
 *
 * The sheet is only offered where the browser really has one, and that is
 * decided after mount: `navigator.share` exists on the phone and not on the
 * desktop, so rendering it on the server would either hydrate into a mismatch
 * or show a button that does nothing.
 *
 * The URL is built on the server from the item's route, so it is the canonical
 * one rather than whatever query string the visitor arrived with.
 */
export default function ShareButtons({
  url,
  title,
  className = "",
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const words = useWords().social;
  const [copied, setCopied] = useState(false);
  // Whether the browser has a share sheet is a fact about the client, not state
  // this component owns: it never changes, so nothing subscribes, and the server
  // snapshot is `false` — the button appears on the first client render.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => !!navigator.share,
    () => false,
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard (no permission, insecure origin)
      // leaves the button as it was: the link is on screen anyway.
    }
  }

  async function shareNative() {
    try {
      await navigator.share({ title, text: title, url });
    } catch {
      // The visitor closed the sheet, or the browser refused it. Nothing to
      // report: the other buttons are right there.
    }
  }

  const button =
    "inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-900";

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-sm font-semibold text-brand-700">
        {words.share}
      </span>
      {shareTargets(url, title).map((target) => {
        const Icon = ICONS[target.id];
        const label = words.shareOn(LABELS[target.id]);
        return (
          <a
            key={target.id}
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            aria-label={label}
            className={button}
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
      {canShare && (
        <button
          type="button"
          onClick={shareNative}
          title={words.shareMore}
          aria-label={words.shareMore}
          className={button}
        >
          <ShareIcon className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={copy}
        title={copied ? words.copied : words.copyLink}
        aria-label={copied ? words.copied : words.copyLink}
        className={button}
      >
        {copied ? (
          <CheckIcon className="h-4 w-4 text-brand-600" />
        ) : (
          <LinkIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

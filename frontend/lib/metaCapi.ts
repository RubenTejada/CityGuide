import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { META_PIXEL_ID } from "./meta";

/**
 * Meta's Conversions API: the server's side of the pixel.
 *
 * The browser pixel reports what a visitor does on the page; this reports what
 * the server sees happen — a contact message actually filed. That is the event
 * an ad campaign optimizes toward, and the one most likely to be lost to an ad
 * blocker, so it is sent from here instead of from the form.
 *
 * Nothing is sent unless both the pixel id and META_CONVERSIONS_TOKEN are set:
 * this posts personal data (a hashed email, the visitor's IP and user agent) to
 * Meta, so an installation that has not opted in by configuring the token sends
 * nothing at all.
 */
const API_VERSION = "v21.0";

/** Meta matches on hashes, never on the value itself. */
function hash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type MetaEvent = {
  /** Standard event name — "Lead", "Contact", "Purchase"… */
  name: string;
  /** The page the event happened on, absolute. */
  sourceUrl: string;
  /** Hashed before it leaves the process. */
  email?: string;
  phone?: string;
  /** Free-form label shown in Events Manager (the kind of enquiry). */
  contentName?: string;
};

export async function sendMetaEvent(event: MetaEvent): Promise<void> {
  const token = process.env.META_CONVERSIONS_TOKEN;
  if (!META_PIXEL_ID || !token) return;

  const headerList = await headers();
  const cookieList = await cookies();
  // The pixel's own cookies, when the visitor loaded it: they are what ties a
  // server event to the browser session and the ad click that started it.
  const fbp = cookieList.get("_fbp")?.value;
  const fbc = cookieList.get("_fbc")?.value;
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();

  const payload = {
    data: [
      {
        event_name: event.name,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: event.sourceUrl,
        user_data: {
          ...(event.email ? { em: [hash(event.email)] } : {}),
          ...(event.phone ? { ph: [hash(event.phone.replace(/\D/g, ""))] } : {}),
          ...(fbp ? { fbp } : {}),
          ...(fbc ? { fbc } : {}),
          ...(ip ? { client_ip_address: ip } : {}),
          ...(headerList.get("user-agent")
            ? { client_user_agent: headerList.get("user-agent") }
            : {}),
        },
        ...(event.contentName
          ? { custom_data: { content_name: event.contentName } }
          : {}),
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_TEST_EVENT_CODE }
      : {}),
  };

  try {
    await fetch(
      `https://graph.facebook.com/${API_VERSION}/${META_PIXEL_ID}/events?access_token=${token}`,
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch {
    // The message is already filed in the CMS. A conversion Meta never hears
    // about is a worse ad campaign, not a failed contact form.
  }
}

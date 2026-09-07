"use server";

import { headers } from "next/headers";
import {
  REQUEST_TYPES,
  type ContactState,
  type RequestType,
} from "@/lib/contact";
import { DEFAULT_LOCALE, isLocale, t } from "@/lib/i18n";
import { sendMetaEvent } from "@/lib/metaCapi";
import { SITE_URL } from "@/lib/seo";

const BASE_URL = process.env.UMBRACO_BASE_URL ?? "http://localhost:54509";

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Files a contact message in the CMS, where editors read it in the backoffice
 * (`/api/contact` in CityGuideWeb). Server-side so the CMS never has to be
 * reachable from the browser; the visitor's address is forwarded because the
 * hop through this server would otherwise make every message look like one
 * sender to the endpoint's rate limit.
 */
export async function sendContactMessage(
  _prev: ContactState,
  data: FormData,
): Promise<ContactState> {
  // A Server Action has no route to read the language from; the form states it.
  const submitted = field(data, "locale");
  const words = t(isLocale(submitted) ? submitted : DEFAULT_LOCALE).contact
    .errors;

  const requestType = field(data, "requestType");
  const name = field(data, "name");
  const email = field(data, "email");
  const message = field(data, "message");

  if (!REQUEST_TYPES.includes(requestType as RequestType)) {
    return { status: "error", error: words.requestType };
  }
  if (name.length < 2) return { status: "error", error: words.name };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", error: words.email };
  }
  if (message.length < 10) {
    return { status: "error", error: words.message };
  }

  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");

  try {
    const response = await fetch(`${BASE_URL}/api/contact`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(forwarded ? { "X-Forwarded-For": forwarded } : {}),
      },
      body: JSON.stringify({
        requestType,
        name,
        email,
        phone: field(data, "phone"),
        businessName: field(data, "businessName"),
        businessUrl: field(data, "businessUrl"),
        message,
        website: field(data, "website"),
      }),
    });

    if (response.status === 429) {
      return { status: "error", error: words.tooMany };
    }
    if (!response.ok) {
      return { status: "error", error: words.failed };
    }
  } catch {
    return { status: "error", error: words.failed };
  }

  // The conversion an ad campaign optimizes toward, reported from here rather
  // than from the form: the message is filed, and a server event survives the
  // ad blockers that swallow the browser pixel. Does nothing unless the
  // Conversions API token is configured.
  await sendMetaEvent({
    name: "Lead",
    sourceUrl: headerList.get("referer") ?? SITE_URL,
    email,
    phone: field(data, "phone"),
    contentName: requestType,
  });

  return { status: "sent" };
}

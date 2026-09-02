"use server";

import { headers } from "next/headers";
import { REQUEST_TYPES, type ContactState, type RequestType } from "@/lib/contact";

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
  const requestType = field(data, "requestType");
  const name = field(data, "name");
  const email = field(data, "email");
  const message = field(data, "message");

  if (!REQUEST_TYPES.includes(requestType as RequestType)) {
    return { status: "error", error: "Elige el tipo de solicitud." };
  }
  if (name.length < 2) return { status: "error", error: "Escribe tu nombre." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "error", error: "Escribe un correo válido." };
  }
  if (message.length < 10) {
    return { status: "error", error: "Cuéntanos un poco más en el mensaje." };
  }

  const forwarded = (await headers()).get("x-forwarded-for");

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
      return {
        status: "error",
        error: "Recibimos varios mensajes tuyos. Intenta de nuevo en un rato.",
      };
    }
    if (!response.ok) {
      return {
        status: "error",
        error: "No pudimos enviar tu mensaje. Inténtalo más tarde.",
      };
    }
  } catch {
    return {
      status: "error",
      error: "No pudimos enviar tu mensaje. Inténtalo más tarde.",
    };
  }

  return { status: "sent" };
}

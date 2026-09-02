"use client";

import { useActionState } from "react";
import { sendContactMessage } from "@/app/[city]/contacto/actions";
import { REQUEST_TYPES, type ContactState } from "@/lib/contact";

const INITIAL: ContactState = { status: "idle" };

const FIELD =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm " +
  "text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/**
 * The public contact form. Submits through a Server Action, so it also works
 * before hydration; the CMS files the message for an editor to read.
 */
export default function ContactForm() {
  const [state, formAction, pending] = useActionState(
    sendContactMessage,
    INITIAL,
  );

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="rounded-xl border border-palm-500/40 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-neutral-900">
          ¡Mensaje enviado!
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Gracias por escribirnos. Revisamos cada solicitud y te respondemos al
          correo que nos dejaste.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      {/* Trampa para bots: fuera de pantalla, nunca enfocable ni leída. */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label>
          No llenar
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 block text-sm font-medium text-neutral-700">
          Tipo de solicitud
          <select
            name="requestType"
            required
            defaultValue={REQUEST_TYPES[0]}
            className={FIELD}
          >
            {REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          Nombre
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            className={FIELD}
          />
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          Correo
          <input
            type="email"
            name="email"
            required
            maxLength={200}
            autoComplete="email"
            className={FIELD}
          />
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          Teléfono <span className="font-normal text-neutral-400">(opcional)</span>
          <input
            type="tel"
            name="phone"
            maxLength={50}
            autoComplete="tel"
            className={FIELD}
          />
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          Negocio <span className="font-normal text-neutral-400">(si aplica)</span>
          <input name="businessName" maxLength={200} className={FIELD} />
        </label>

        <label className="sm:col-span-2 block text-sm font-medium text-neutral-700">
          Enlace del negocio{" "}
          <span className="font-normal text-neutral-400">
            (web, redes o su página en el portal)
          </span>
          <input name="businessUrl" maxLength={500} className={FIELD} />
        </label>

        <label className="sm:col-span-2 block text-sm font-medium text-neutral-700">
          Mensaje
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={4000}
            rows={6}
            className={FIELD}
          />
        </label>
      </div>

      {state.status === "error" && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar mensaje"}
      </button>
      <p className="mt-3 text-xs text-neutral-500">
        Usamos tus datos solo para responderte esta solicitud.
      </p>
    </form>
  );
}

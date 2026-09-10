"use client";

import { useActionState, useState } from "react";

import Modal from "@/components/Modal";
import { requestReservation } from "@/app/[lang]/[city]/[...slug]/actions";
import { INTL_LOCALE, t, type Locale } from "@/lib/i18n";
import {
  DEFAULT_PARTY,
  DEFAULT_TIME,
  MAX_NOTES,
  MAX_PARTY,
  formatReservationDate,
  type ReservationState,
} from "@/lib/reservation";

const INITIAL: ReservationState = { status: "idle" };

const FIELD =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm " +
  "text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

const LABEL = "block text-sm font-medium text-neutral-700";

/**
 * Reservar una mesa en un lugar que las acepta: un botón en la ficha y, detrás, el
 * formulario en un modal.
 *
 * No reserva nada — eso lo hace el establecimiento —, así que lo que el formulario
 * promete es exactamente lo que ocurre: la solicitud se envía, llega un correo con lo
 * pedido y la confirmación llega después desde el propio lugar. Eso se dice antes de
 * enviar y se repite al terminar, que es donde alguien se pregunta si ya tiene mesa.
 *
 * Llega relleno con lo más común (hoy, la hora de la cena, dos personas) para que
 * enviarlo sea decir quién eres, y se envía por Server Action, así que también funciona
 * antes de la hidratación.
 */
export default function ReservationDialog({
  placeId,
  placeName,
  placeUrl,
  minDate,
  locale,
  variant = "table",
}: {
  placeId: string;
  placeName: string;
  placeUrl: string;
  /** Hoy en la ciudad, calculado en el servidor: el cliente no lo adivina. */
  minDate: string;
  locale: Locale;
  /**
   * Qué se está pidiendo. El formulario es el mismo — un día, una hora, cuántos
   * son y quién eres —, pero lo que promete no: una mesa la confirma el
   * restaurante y una excursión la confirma el operador que la lleva.
   */
  variant?: "table" | "tour";
}) {
  const base = t(locale).reservation;
  const words = variant === "tour" ? { ...base, ...base.tour } : base;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    requestReservation,
    INITIAL,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl bg-brand-600 px-4 py-3 text-left text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <CalendarIcon />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{words.open}</span>
          <span className="block text-xs text-white/80">{words.openHint}</span>
        </span>
      </button>

      {open && (
        <Modal
          title={words.heading(placeName)}
          close={words.close}
          onClose={() => setOpen(false)}
        >
          {state.status === "sent" ? (
            <Sent
              placeName={placeName}
              state={state}
              locale={locale}
              variant={variant}
              onClose={() => setOpen(false)}
            />
          ) : (
            <form action={formAction} className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <p className="text-sm text-neutral-600">
                  {words.lead(placeName)}
                </p>

                {/* Trampa para bots: fuera de pantalla, nunca enfocable ni leída. */}
                <div
                  className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
                  aria-hidden
                >
                  <label>
                    {words.honeypot}
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                {/* Una Server Action no puede leer la ruta desde la que se envió. */}
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="placeId" value={placeId} />
                <input type="hidden" name="placeUrl" value={placeUrl} />

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className={LABEL}>
                    {words.fields.date}
                    <input
                      type="date"
                      name="date"
                      required
                      min={minDate}
                      defaultValue={minDate}
                      className={FIELD}
                    />
                  </label>

                  <label className={LABEL}>
                    {words.fields.time}
                    <input
                      type="time"
                      name="time"
                      required
                      step={900}
                      defaultValue={DEFAULT_TIME}
                      className={FIELD}
                    />
                  </label>

                  <div className="sm:col-span-2">
                    <PartySize label={words.fields.party} />
                    <p className="mt-1 text-xs text-neutral-500">
                      {words.partyHint(MAX_PARTY)}
                    </p>
                  </div>

                  <label className={LABEL}>
                    {words.fields.name}
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      className={FIELD}
                    />
                  </label>

                  <label className={LABEL}>
                    {words.fields.email}
                    <input
                      type="email"
                      name="email"
                      required
                      maxLength={200}
                      autoComplete="email"
                      className={FIELD}
                    />
                  </label>

                  <label className={`sm:col-span-2 ${LABEL}`}>
                    {words.fields.phone}{" "}
                    <span className="font-normal text-neutral-400">
                      {words.phoneHint}
                    </span>
                    <input
                      type="tel"
                      name="phone"
                      required
                      maxLength={50}
                      autoComplete="tel"
                      className={FIELD}
                    />
                  </label>

                  <label className={`sm:col-span-2 ${LABEL}`}>
                    {words.fields.notes}{" "}
                    <span className="font-normal text-neutral-400">
                      {words.notesHint}
                    </span>
                    <textarea
                      name="notes"
                      maxLength={MAX_NOTES}
                      rows={3}
                      className={FIELD}
                    />
                  </label>
                </div>

                {state.status === "error" && (
                  <p role="alert" className="mt-4 text-sm text-red-600">
                    {state.error}
                  </p>
                )}
              </div>

              <div className="border-t border-neutral-200 bg-neutral-50 px-5 py-4">
                <p className="text-xs text-neutral-600">
                  {words.confirmedByEmail}
                </p>
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-3 w-full rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60 sm:w-auto"
                >
                  {pending ? words.sending : words.submit}
                </button>
                <p className="mt-2 text-xs text-neutral-500">{words.privacy}</p>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

/**
 * Cuántas personas van: los dos botones son para el pulgar en un teléfono, y el campo
 * sigue siendo un número que se escribe. El valor vive aquí porque los botones lo
 * cambian; el formulario lo envía como cualquier otro campo.
 */
function PartySize({ label }: { label: string }) {
  const [party, setParty] = useState(DEFAULT_PARTY);
  const step = (by: number) =>
    setParty((current) => Math.min(MAX_PARTY, Math.max(1, current + by)));

  return (
    <label className={LABEL}>
      {label}
      <span className="mt-1 flex items-center gap-2">
        <StepButton label="−" onClick={() => step(-1)} disabled={party <= 1} />
        <input
          type="number"
          name="partySize"
          required
          min={1}
          max={MAX_PARTY}
          inputMode="numeric"
          value={party}
          onChange={(event) => setParty(Number(event.target.value))}
          className="w-20 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-center text-sm text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <StepButton
          label="+"
          onClick={() => step(1)}
          disabled={party >= MAX_PARTY}
        />
      </span>
    </label>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-hidden
      tabIndex={-1}
      className="flex size-9 items-center justify-center rounded-lg border border-neutral-300 bg-white text-lg text-neutral-700 transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40"
    >
      {label}
    </button>
  );
}

/** Enviada: lo pedido, repetido, y qué falta para tener mesa. */
function Sent({
  placeName,
  state,
  locale,
  variant,
  onClose,
}: {
  placeName: string;
  state: ReservationState;
  locale: Locale;
  variant: "table" | "tour";
  onClose: () => void;
}) {
  const base = t(locale).reservation;
  const words = variant === "tour" ? { ...base, ...base.tour } : base;
  const summary = state.summary;

  return (
    <div className="px-5 py-6" role="status">
      <h3 className="text-lg font-semibold text-neutral-900">
        {words.sentHeading}
      </h3>
      {summary && (
        <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
          {words.summary(
            formatReservationDate(summary.date, INTL_LOCALE[locale]),
            summary.time,
            summary.partySize,
          )}
        </p>
      )}
      <p className="mt-3 text-sm text-neutral-600">{words.sentBody(placeName)}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        {words.close}
      </button>
    </div>
  );
}

/** Un calendario: lo que dice "reservar" sin una palabra. */
function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-7 shrink-0"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}

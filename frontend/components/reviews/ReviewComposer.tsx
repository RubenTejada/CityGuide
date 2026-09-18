"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteReview, saveReview } from "@/app/[lang]/[city]/[...slug]/actions";
import { useLocale } from "@/components/LocaleProvider";
import SignInButton from "@/components/account/SignInButton";
import { usePlaceAccount } from "@/components/account/useAccount";
import { t } from "@/lib/i18n";
import {
  MAX_COMMENT,
  MAX_RATING,
  type OwnReview,
  type ReviewState,
} from "@/lib/reviews";

const INITIAL: ReviewState = { status: "idle" };

/**
 * La caja de opinar de una ficha. Fuera de la cuenta es un botón que abre el acceso;
 * dentro, las estrellas y el comentario, rellenos con la opinión propia si ya la hay —
 * un visitante tiene una por lugar, y la edita en vez de sumar otra.
 *
 * Al guardar, la acción descarta la caché de opiniones y `router.refresh()` vuelve a
 * pintar la lista del servidor con la nueva ya dentro.
 */
export default function ReviewComposer({ placeId }: { placeId: string }) {
  const locale = useLocale();
  const words = t(locale).reviews;
  const router = useRouter();
  const [account] = usePlaceAccount(placeId);
  const [state, formAction, saving] = useActionState(saveReview, INITIAL);
  const [removing, startRemoving] = useTransition();
  const [removed, setRemoved] = useState<ReviewState | null>(null);

  // La opinión propia: la que dijo el servidor, reemplazada por lo último guardado.
  const latest = removed ?? (state.status === "saved" ? state : null);
  const mine: OwnReview | null = latest ? (latest.mine ?? null) : (account?.mine ?? null);

  useEffect(() => {
    if (state.status === "saved") router.refresh();
  }, [state, router]);

  if (!account || (!account.providers.email && !account.providers.google)) {
    return null;
  }

  if (!account.user) {
    return (
      <SignInButton
        providers={account.providers}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        {words.signInToReview}
      </SignInButton>
    );
  }

  const message =
    removed?.status === "deleted"
      ? words.deleted
      : state.status === "saved" && !removed
        ? words.saved
        : null;
  const error = removed?.status === "error" ? removed.error : state.status === "error" ? state.error : null;

  return (
    <form
      // Una opinión nueva o borrada vuelve a montar el formulario con sus valores.
      key={mine ? `${mine.updatedUtc}` : "new"}
      action={(data) => {
        setRemoved(null);
        formAction(data);
      }}
      className="rounded-xl border border-neutral-200 bg-white p-4"
    >
      <h3 className="font-semibold">{mine ? words.yours : words.write}</h3>
      {mine?.hidden && (
        <p className="mt-1 text-sm text-neutral-500">{words.hidden}</p>
      )}
      <input type="hidden" name="placeId" value={placeId} />
      <input type="hidden" name="locale" value={locale} />
      <StarPicker
        label={words.stars}
        starLabel={words.star}
        initial={mine?.rating ?? 0}
      />
      <label className="mt-3 block text-sm font-medium text-neutral-700">
        {words.comment}{" "}
        <span className="font-normal text-neutral-500">{words.optional}</span>
        <textarea
          name="comment"
          rows={3}
          maxLength={MAX_COMMENT}
          defaultValue={mine?.comment ?? ""}
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>
      <p className="mt-1 text-xs text-neutral-500">{words.publicNote}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-brand-700">
          {message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving || removing}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? words.saving : mine ? words.update : words.submit}
        </button>
        {mine && (
          <button
            type="button"
            disabled={saving || removing}
            onClick={() =>
              startRemoving(async () => {
                const result = await deleteReview(placeId, locale);
                setRemoved(result);
                if (result.status === "deleted") router.refresh();
              })
            }
            className="text-sm text-neutral-500 underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-60"
          >
            {words.delete}
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Cinco radios, uno por estrella: un control de formulario de verdad (se envía, se
 * recorre con las flechas, lo anuncia un lector de pantalla) dibujado como estrellas.
 */
function StarPicker({
  label,
  starLabel,
  initial,
}: {
  label: string;
  starLabel: (n: number) => string;
  initial: number;
}) {
  const [value, setValue] = useState(initial);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="mt-3">
      <legend className="text-sm font-medium text-neutral-700">{label}</legend>
      <div className="mt-1 flex gap-1" onMouseLeave={() => setHover(0)}>
        {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((n) => (
          <label
            key={n}
            onMouseEnter={() => setHover(n)}
            className={`cursor-pointer text-3xl leading-none transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
              n <= shown ? "text-brand-600" : "text-neutral-300"
            }`}
          >
            <input
              type="radio"
              name="rating"
              value={n}
              required
              checked={value === n}
              onChange={() => setValue(n)}
              className="sr-only"
            />
            <span aria-hidden>★</span>
            <span className="sr-only">{starLabel(n)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

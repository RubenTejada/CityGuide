"use client";

import { useActionState } from "react";
import {
  redeemLoginLinkAction,
  type RedeemState,
} from "@/app/[lang]/[city]/acceder/actions";
import { useWords } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n";

/** El botón que canjea el enlace del correo; la acción abre la sesión y vuelve a `next`. */
export default function RedeemForm({
  token,
  next,
  locale,
}: {
  token: string;
  next: string;
  locale: Locale;
}) {
  const words = useWords().account;
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(
    redeemLoginLinkAction,
    {},
  );
  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {words.redeemButton}
      </button>
      {state.error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import Modal from "@/components/Modal";
import { useLocale } from "@/components/LocaleProvider";
import {
  requestLoginLink,
  type LoginLinkState,
} from "@/app/[lang]/[city]/acceder/actions";
import { localeHref, t, withoutLocale } from "@/lib/i18n";
import { LEGAL_PATHS } from "@/lib/legal";
import type { AuthProviders } from "@/lib/reviews";

const INITIAL: LoginLinkState = { status: "idle" };

const FIELD =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm " +
  "text-neutral-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/** La página en la que está el visitante, que es a donde vuelve después de entrar. */
function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Un botón que abre el acceso: Google y, debajo, el enlace por correo. Lo usan la
 * cabecera, el favorito y la caja de opiniones — cada uno con su propio texto —, así
 * que el modal vive aquí y no en ninguno de ellos.
 */
export default function SignInButton({
  providers,
  next: returnTo,
  className,
  children,
}: {
  providers: AuthProviders;
  /** A dónde volver; por omisión, la página en la que está el visitante. */
  next?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [next, setNext] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setNext(returnTo ?? currentPath())}
        className={className}
      >
        {children}
      </button>
      {next !== null && (
        <SignInDialog
          providers={providers}
          next={next}
          onClose={() => setNext(null)}
        />
      )}
    </>
  );
}

export function SignInDialog({
  providers,
  next,
  onClose,
  error,
}: {
  providers: AuthProviders;
  next: string;
  onClose: () => void;
  error?: string;
}) {
  const locale = useLocale();
  const words = t(locale).account;
  const [state, formAction, pending] = useActionState(requestLoginLink, INITIAL);
  // La ciudad del enlace por correo: la página de acceso vive bajo cada una.
  const city = withoutLocale(next.split("?")[0]).split("/").filter(Boolean)[0] ?? "";

  return (
    <Modal title={words.heading} close={words.close} onClose={onClose}>
      <div className="overflow-y-auto px-5 py-4">
        {state.status === "sent" ? (
          <div className="py-4 text-center">
            <p className="text-lg font-semibold">{words.linkSentHeading}</p>
            <p className="mt-2 text-sm text-neutral-600">
              {words.linkSent(state.email ?? "")}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-600">{words.lead}</p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
            {providers.google && (
              <a
                href={`/api/auth/google?${new URLSearchParams({ next })}`}
                className="mt-4 flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
              >
                <GoogleIcon />
                {words.google}
              </a>
            )}
            {providers.email && city && (
              <form action={formAction} className="mt-4">
                {providers.google && (
                  <p className="mb-3 flex items-center gap-3 text-xs text-neutral-500 before:h-px before:flex-1 before:bg-neutral-200 after:h-px after:flex-1 after:bg-neutral-200">
                    {words.orEmail}
                  </p>
                )}
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="city" value={city} />
                <input type="hidden" name="next" value={next} />
                <label className="block text-sm font-medium text-neutral-700">
                  {words.name}
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={60}
                    autoComplete="name"
                    className={FIELD}
                  />
                  <span className="mt-1 block text-xs font-normal text-neutral-500">
                    {words.nameHint}
                  </span>
                </label>
                <label className="mt-3 block text-sm font-medium text-neutral-700">
                  {words.email}
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className={FIELD}
                  />
                </label>
                {state.status === "error" && (
                  <p role="alert" className="mt-3 text-sm text-red-600">
                    {state.error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {pending ? words.sending : words.sendLink}
                </button>
              </form>
            )}
            <p className="mt-4 text-xs text-neutral-500">
              {words.privacy}{" "}
              <a
                href={localeHref(locale, LEGAL_PATHS.privacy)}
                target="_blank"
                className="underline hover:text-neutral-700"
              >
                {t(locale).legal.privacy}
              </a>
              {" · "}
              <a
                href={localeHref(locale, LEGAL_PATHS.terms)}
                target="_blank"
                className="underline hover:text-neutral-700"
              >
                {t(locale).legal.terms}
              </a>
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-5">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

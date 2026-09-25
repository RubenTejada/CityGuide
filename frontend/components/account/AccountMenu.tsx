"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useLocale } from "@/components/LocaleProvider";
import { localeHref, t } from "@/lib/i18n";
import SignInButton from "./SignInButton";
import { useAccount } from "./useAccount";

const CORNER_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-full text-sm text-white/80 transition-colors " +
  "hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun-300";

/**
 * La cuenta del visitante en la esquina de la cabecera, junto al idioma y el tema:
 * "Entrar" o, dentro, su inicial con un menú (favoritos, salir). No dibuja nada hasta
 * saber quién es, ni nada en absoluto en una instalación sin cuentas configuradas.
 */
export default function AccountMenu({ citySlug }: { citySlug: string }) {
  // Reading the path suspends in the static shell Cache Components prerenders
  // for a city's pages before their segments are known. Nothing is lost by
  // waiting: the menu draws nothing on the server anyway, since who the
  // visitor is is only asked from the browser.
  return (
    <Suspense fallback={null}>
      <Menu citySlug={citySlug} />
    </Suspense>
  );
}

function Menu({ citySlug }: { citySlug: string }) {
  const locale = useLocale();
  const words = t(locale).account;
  const account = useAccount();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!account || (!account.providers.email && !account.providers.google)) {
    return null;
  }

  if (!account.user) {
    return (
      <SignInButton providers={account.providers} className={`${CORNER_BUTTON} px-3`}>
        {words.signIn}
      </SignInButton>
    );
  }

  const name = account.user.name;
  return (
    <div ref={menu} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={words.menu(name)}
        title={name}
        className={`${CORNER_BUTTON} w-9`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sun-400 text-sm font-bold text-neutral-900">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm text-neutral-800 shadow-xl"
        >
          <p className="truncate border-b border-neutral-100 px-4 py-3 font-semibold">{name}</p>
          <Link
            role="menuitem"
            href={localeHref(locale, `/${citySlug}/favoritos`)}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 hover:bg-neutral-50"
          >
            {words.favorites}
          </Link>
          <a
            role="menuitem"
            href="/api/me/export"
            download
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 hover:bg-neutral-50"
          >
            {words.exportData}
          </a>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              setDeleting(true);
            }}
            className="block w-full px-4 py-2.5 text-left hover:bg-neutral-50"
          >
            {words.deleteAccount}
          </button>
          <form action="/api/auth/signout" method="post">
            <input type="hidden" name="next" value={pathname} />
            <button
              role="menuitem"
              type="submit"
              className="block w-full px-4 py-2.5 text-left hover:bg-neutral-50"
            >
              {words.signOut}
            </button>
          </form>
        </div>
      )}
      {deleting && (
        <DeleteAccountDialog
          home={localeHref(locale, `/${citySlug}`)}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

/**
 * La confirmación de borrar la cuenta, que no se deshace. Sale bien, y el visitante
 * vuelve a la portada de la ciudad ya fuera de su cuenta: una recarga completa, para
 * que cada control que lo sabía dentro lo lea de nuevo.
 */
function DeleteAccountDialog({ home, onClose }: { home: string; onClose: () => void }) {
  const locale = useLocale();
  const words = t(locale).account;
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    setPending(true);
    setFailed(false);
    const response = await fetch("/api/me", { method: "DELETE" }).catch(() => null);
    if (response?.ok) {
      window.location.assign(home);
      return;
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <Modal title={words.deleteAccount} close={words.close} onClose={onClose}>
      <div className="p-5 text-sm text-neutral-700">
        <p>{words.deleteBody}</p>
        <p className="mt-3">
          <a href="/api/me/export" download className="font-medium text-brand-600 underline">
            {words.exportData}
          </a>
        </p>
        {failed && (
          <p role="alert" className="mt-3 text-red-600">
            {words.errors.deleteFailed}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? words.deleting : words.deleteConfirm}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
          >
            {words.cancel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

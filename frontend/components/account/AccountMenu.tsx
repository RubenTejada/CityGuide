"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
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
    </div>
  );
}

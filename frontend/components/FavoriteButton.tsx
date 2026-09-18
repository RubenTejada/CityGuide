"use client";

import { useTransition } from "react";
import { toggleFavorite } from "@/app/[lang]/[city]/[...slug]/actions";
import { useWords } from "@/components/LocaleProvider";
import SignInButton from "@/components/account/SignInButton";
import { usePlaceAccount } from "@/components/account/useAccount";

const BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/**
 * Guardar el lugar en los favoritos del visitante, junto a "Compartir". Fuera de la
 * cuenta el mismo botón abre el acceso; sin cuentas configuradas no aparece.
 */
export default function FavoriteButton({
  placeId,
  name,
}: {
  placeId: string;
  name: string;
}) {
  const words = useWords().favorites;
  const [account, setAccount] = usePlaceAccount(placeId);
  const [pending, startTransition] = useTransition();

  if (!account || (!account.providers.email && !account.providers.google)) {
    return null;
  }

  const idle = `${BUTTON} border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50`;

  if (!account.user) {
    return (
      <SignInButton providers={account.providers} className={idle}>
        <Heart filled={false} />
        {words.add}
      </SignInButton>
    );
  }

  const favorite = account.favorite;
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? words.removeLabel(name) : words.addLabel(name)}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleFavorite(placeId, !favorite);
          if (result) setAccount({ ...account, favorite: result.favorite });
        })
      }
      className={
        favorite
          ? `${BUTTON} border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100`
          : idle
      }
    >
      <Heart filled={favorite} />
      {favorite ? words.remove : words.add}
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`size-4 ${filled ? "fill-current" : "fill-none"}`}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
    </svg>
  );
}

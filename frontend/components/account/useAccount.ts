"use client";

import { useEffect, useState } from "react";
import type { AccountState, PlaceAccountState } from "@/lib/reviews";

/**
 * Quién está dentro, leído desde el navegador (`/api/me`). Las páginas se sirven
 * iguales para todos desde la caché, y lo personal llega aparte: null mientras llega.
 */
export function useAccount(): AccountState | null {
  const [state, setState] = useState<AccountState | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: AccountState) => live && setState(body))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/**
 * Una sola petición por ficha aunque la pidan dos controles (el favorito y la
 * opinión): montan en el mismo instante y comparten la promesa, que se suelta al
 * resolverse para que volver a la ficha lea el estado de nuevo.
 */
const placeRequests = new Map<string, Promise<PlaceAccountState>>();

function requestPlace(placeId: string): Promise<PlaceAccountState> {
  let request = placeRequests.get(placeId);
  if (!request) {
    request = fetch(`/api/me/place/${placeId}`, { cache: "no-store" }).then(
      (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<PlaceAccountState>;
      },
    );
    placeRequests.set(placeId, request);
    request.finally(() => placeRequests.delete(placeId)).catch(() => {});
  }
  return request;
}

/** El visitante frente a un lugar: si está dentro, su opinión y si lo guardó. */
export function usePlaceAccount(
  placeId: string,
): [PlaceAccountState | null, (next: PlaceAccountState) => void] {
  const [state, setState] = useState<PlaceAccountState | null>(null);
  useEffect(() => {
    let live = true;
    requestPlace(placeId)
      .then((body) => live && setState(body))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [placeId]);
  return [state, setState];
}

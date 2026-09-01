// Display naming for company branches (sucursales).

import { fold } from "./search";

/** Words that name the trade, not the chain, so they identify nothing on their own. */
const GENERIC_WORDS = new Set([
  "banco",
  "banca",
  "supermercado",
  "supermercados",
  "farmacia",
  "farmacias",
  "cine",
  "cines",
  "cinemas",
  "tienda",
  "tiendas",
  "grupo",
  "plaza",
  "la",
  "el",
  "los",
  "las",
  "de",
  "del",
]);

/**
 * Name shown for a branch. A branch node stores only its local name, and those
 * repeat across chains ("Oficina Principal" is seven different banks, "Sucursal
 * Naco" three), so the company is prefixed unless the branch name already says
 * which chain it belongs to ("Jumbo Luperón" stays as it is).
 */
export function branchDisplayName(
  branchName: string,
  companyName: string | null | undefined,
): string {
  if (!companyName) return branchName;
  const branch = fold(branchName);
  const identified = fold(companyName)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !GENERIC_WORDS.has(word))
    .some((word) => branch.includes(word));
  return identified ? branchName : `${companyName} — ${branchName}`;
}

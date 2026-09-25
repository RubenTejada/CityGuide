/**
 * The Google Analytics 4 measurement id. Empty is the normal case in development,
 * and nothing is loaded then. `NEXT_PUBLIC_*` values are inlined by `next build`,
 * not read at runtime.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

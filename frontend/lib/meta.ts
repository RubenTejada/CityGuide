/**
 * The Meta pixel id, read by the browser snippet and by the server-side
 * Conversions API. It is one id for both sides: an event sent from the server
 * lands in the same dataset the pixel writes to, which is what lets an ad
 * campaign optimize toward a conversion an ad blocker would have hidden.
 *
 * Empty is the normal case in development, and every caller does nothing then.
 * `NEXT_PUBLIC_*` values are inlined by `next build`, not read at runtime.
 */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

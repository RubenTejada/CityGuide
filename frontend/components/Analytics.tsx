"use client";

import Script from "next/script";
import { useConsent } from "@/components/CookieConsent";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

/**
 * Google Analytics 4 (gtag.js), rendered site-wide from the root layout. Nothing is
 * emitted when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset, so local development and
 * preview builds do not report traffic — nor until the visitor accepts measurement
 * in the cookie notice (lib/consent.ts).
 */
export default function Analytics() {
  const consent = useConsent();
  if (!GA_MEASUREMENT_ID || consent !== "granted") return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}

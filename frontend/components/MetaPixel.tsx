"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useConsent } from "@/components/CookieConsent";
import { META_PIXEL_ID } from "@/lib/meta";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * The Meta pixel (Facebook + Instagram ads), rendered site-wide from the root
 * layout beside Google Analytics. Nothing is emitted when
 * NEXT_PUBLIC_META_PIXEL_ID is unset, so local development and preview builds
 * report no traffic — nor until the visitor accepts measurement in the cookie
 * notice (lib/consent.ts).
 *
 * The base snippet fires one PageView when it loads. Every navigation after
 * that is a client-side route change the pixel cannot see on its own — unlike
 * GA4, it does not listen to the History API — so each new path fires its own,
 * and the first one is skipped because the snippet already sent it.
 */
export default function MetaPixel() {
  const consent = useConsent();
  if (!META_PIXEL_ID || consent !== "granted") return null;

  return (
    <>
      <BaseSnippet />
      {/* Reading the path suspends in the static shell prerendered before a
          page's segments are known, so the watcher waits behind its own
          boundary and the snippet above ships in the shell regardless. */}
      <Suspense fallback={null}>
        <PageViews />
      </Suspense>
    </>
  );
}

/** One PageView per client-side navigation after the first. */
function PageViews() {
  const pathname = usePathname();
  const firstPath = useRef(true);

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    window.fbq?.("track", "PageView");
  }, [pathname]);

  return null;
}

function BaseSnippet() {
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
    </Script>
  );
}

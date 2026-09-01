import Script from "next/script";

/**
 * Google Analytics 4 (gtag.js), rendered site-wide from the root layout.
 * Nothing is emitted when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset, so local
 * development and preview builds do not report traffic.
 */
export default function Analytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!measurementId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');`}
      </Script>
    </>
  );
}

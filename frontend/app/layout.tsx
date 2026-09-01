import type { Metadata } from "next";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import Analytics from "@/components/Analytics";
import InlineScript from "@/components/InlineScript";
import JsonLd from "@/components/JsonLd";
import { SITE_LOCALE, SITE_NAME, SITE_URL, siteJsonLd } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Tipografía del wordmark del logo: sans condensada al estilo del logo
// clásico de TuSantoDomingo.com
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "Planes, lugares y experiencias en República Dominicana. Bares, restaurantes, tiendas, cines, eventos y un poco más. Ubícate con un clic.";
const SITE_TITLE = "QueHacerRD.com — Planes, lugares y experiencias en RD";

export const metadata: Metadata = {
  // Lets every page below express canonical/OG URLs as paths.
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: `${SITE_NAME}.com`,
  keywords: [
    "qué hacer en República Dominicana",
    "restaurantes República Dominicana",
    "bares y discotecas",
    "eventos",
    "cartelera de cine",
    "guía de ciudad",
  ],
  authors: [{ name: `${SITE_NAME}.com`, url: SITE_URL }],
  creator: `${SITE_NAME}.com`,
  publisher: `${SITE_NAME}.com`,
  alternates: { canonical: "/" },
  icons: { icon: "/logo.svg", shortcut: "/logo.svg", apple: "/logo.svg" },
  formatDetection: { telephone: true, address: true },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: `${SITE_NAME}.com`,
    locale: SITE_LOCALE,
    url: SITE_URL,
    title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} h-full antialiased`}
      // El script de abajo añade class="dark" antes de hidratar.
      suppressHydrationWarning
    >
      <head>
        {/* Aplica el tema antes del primer pintado: leerlo ya hidratado
            mostraría la página clara y luego saltaría a oscura. */}
        <InlineScript html={`(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`} />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-100 text-neutral-900">
        <JsonLd data={siteJsonLd()} />
        <Analytics />
        {children}
      </body>
    </html>
  );
}

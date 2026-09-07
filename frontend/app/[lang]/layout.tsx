import type { Metadata } from "next";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import Analytics from "@/components/Analytics";
import InlineScript from "@/components/InlineScript";
import JsonLd from "@/components/JsonLd";
import MetaPixel from "@/components/MetaPixel";
import LocaleProvider from "@/components/LocaleProvider";
import { HTML_LANG, LOCALES, OG_LOCALE, type Locale } from "@/lib/i18n";
import {
  siteDescription,
  SITE_NAME,
  siteTitle,
  SITE_URL,
  siteJsonLd,
  siteKeywords,
} from "@/lib/seo";
import "../globals.css";

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

/** Both languages are known ahead of time, so both are prerendered. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const locale = lang as Locale;
  const title = siteTitle(locale);
  const description = siteDescription(locale);
  return {
    // Lets every page below express canonical/OG URLs as paths.
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${SITE_NAME}` },
    description,
    applicationName: `${SITE_NAME}.com`,
    keywords: siteKeywords(locale),
    authors: [{ name: `${SITE_NAME}.com`, url: SITE_URL }],
    creator: `${SITE_NAME}.com`,
    publisher: `${SITE_NAME}.com`,
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
      locale: OG_LOCALE[locale],
      title: { default: title, template: `%s | ${SITE_NAME}` },
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: { default: title, template: `%s | ${SITE_NAME}` },
      description,
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  const locale = lang as Locale;
  return (
    <html
      lang={HTML_LANG[locale]}
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} h-full antialiased`}
      // El script de abajo añade class="dark" antes de hidratar.
      suppressHydrationWarning
    >
      <head>
        {/* Aplica el tema antes del primer pintado: leerlo ya hidratado
            mostraría la página clara y luego saltaría a oscura. */}
        <InlineScript
          html={`(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`}
        />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-100 text-neutral-900">
        <JsonLd data={siteJsonLd(locale)} />
        <Analytics />
        <MetaPixel />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "QueHacerRD.com — Planes, lugares y experiencias en RD",
    template: "%s | QueHacerRD",
  },
  description:
    "Planes, lugares y experiencias en República Dominicana. Bares, restaurantes, tiendas, cines, eventos y un poco más. Ubícate con un clic.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-100 text-neutral-900">
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";

import { DM_Sans, Sora } from "next/font/google";

import { ConditionalShell } from "@/components/ConditionalShell";
import { DeferredMarketingScripts } from "@/components/DeferredMarketingScripts";
import { OrganizationJsonLd } from "@/components/JsonLd";
import { LivestreamAnalyticsGate, MarketingOverlays } from "@/components/MarketingOverlays";
import { FreeLaunchBanner } from "@/components/FreeLaunchBanner";

import { getSessionUser } from "@/lib/auth";

import { DEFAULT_OG_IMAGE_ABSOLUTE } from "@/lib/geo";

import { DEFAULT_DESCRIPTION, DEFAULT_KEYWORDS, hreflangAlternates } from "@/lib/seo";

import { site } from "@/lib/site";

import "./globals.css";



const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
  adjustFontFallback: true,
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});



export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "IPTV Panel for Resellers - Secure Back Office, Worldwide",
    template: "%s",
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  alternates: hreflangAlternates("/"),
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    siteName: site.name,
    url: site.url,
    locale: "en_US",
    alternateLocale: ["en_GB"],
    type: "website",
    title: "IPTV Panel for Resellers - Secure Back Office, Worldwide",
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: DEFAULT_OG_IMAGE_ABSOLUTE,
        width: 1200,
        height: 630,
        alt: "Nexlify IPTV Panel — Worldwide",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IPTV Panel for Resellers - Secure Back Office, Worldwide",
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE_ABSOLUTE],
  },
  formatDetection: { telephone: false },
  manifest: "/manifest.json",
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};



export const viewport: Viewport = {

  width: "device-width",

  initialScale: 1,

  themeColor: "#080612",

};



export default async function RootLayout({

  children,

}: Readonly<{

  children: React.ReactNode;

}>) {

  const user = await getSessionUser();



  return (

    <html

      lang="en"

      className={`${sora.variable} ${dmSans.variable} h-full antialiased`}

    >

      <head>
        <OrganizationJsonLd />
      </head>

      <body className="min-h-full flex flex-col overflow-x-hidden bg-black">

        <LivestreamAnalyticsGate>
          <DeferredMarketingScripts />
        </LivestreamAnalyticsGate>

        <ConditionalShell user={user}>{children}</ConditionalShell>

        <FreeLaunchBanner />
        <MarketingOverlays isLoggedIn={!!user} />

      </body>

    </html>

  );

}



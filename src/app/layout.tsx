import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { AppHeader } from "@/components/layout/AppHeader";
import { EngineConfigSync } from "@/components/layout/EngineConfigSync";
import { ThemeSync } from "@/components/layout/ThemeSync";
import { UpdatePrompt } from "@/components/layout/UpdatePrompt";
import { LOCALE_STORAGE_KEY, THEME_STORAGE_KEY } from "@/features/settings/settings-store";
import { LocaleSync, SkipLink } from "@/components/layout/LocaleSync";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const DARK_THEME_COLOR = "#0f1216";
const LIGHT_THEME_COLOR = "#f1efe9";

export const metadata: Metadata = {
  applicationName: "Outpost",
  title: { default: "Outpost — analyse d'échecs", template: "%s · Outpost" },
  description:
    "Analyse de parties d'échecs privée, dans le navigateur : évaluations Stockfish, classification des coups, théorie des ouvertures et exploration de variantes. Fonctionne hors ligne.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Outpost" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: DARK_THEME_COLOR },
    { media: "(prefers-color-scheme: light)", color: LIGHT_THEME_COLOR },
  ],
};

// Runs before first paint: applies the saved theme and language so there is no flash.
// Light and French are the defaults; "system" leaves data-theme unset for the OS to decide.
const preHydrationScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})||"light";if(t==="dark")d.dataset.theme="outpost";else if(t!=="system")d.dataset.theme="outpost-light";if(localStorage.getItem(${JSON.stringify(
  LOCALE_STORAGE_KEY,
)})==="en")d.lang="en";}catch(e){d.dataset.theme="outpost-light";}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${plexSans.variable} ${plexMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: preHydrationScript }} />
      </head>
      <body className="min-h-dvh font-sans text-base-content">
        <ThemeSync light={LIGHT_THEME_COLOR} dark={DARK_THEME_COLOR} />
        <EngineConfigSync />
        <LocaleSync />
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV === "development"}
          reloadOnOnline={false}
        >
          <SkipLink />
          <div className="flex min-h-dvh flex-col">
            <AppHeader />
            <main id="main" className="flex flex-1 flex-col">
              {children}
            </main>
          </div>
          <UpdatePrompt />
        </SerwistProvider>
      </body>
    </html>
  );
}

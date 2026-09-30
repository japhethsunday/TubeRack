import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@/app/globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0714" },
    { media: "(prefers-color-scheme: light)", color: "#f8f6fc" },
  ],
};

export const metadata: Metadata = {
  title: "Recktube — AI Video Production Platform",
  description:
    "AI video production and YouTube intelligence: research, scripts, voice, visuals, packaging, and analytics in one workspace.",
  appleWebApp: { capable: true, title: "Recktube", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

const THEME_INIT = `(function(){try{var t=localStorage.getItem("tuberack-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

/**
 * Phone with the browser's "Desktop site" switched on: the browser lays the
 * page out ~980px wide, just under our desktop breakpoint, so people got a
 * shrunken phone layout. Ask for a real desktop width instead. Only touch
 * devices with a phone-sized screen and a desktop-width layout are touched;
 * computers and normal phone browsing never run this.
 */
const PHONE_DESKTOP_MODE = `(function(){try{var s=Math.min(screen.width,screen.height);if(navigator.maxTouchPoints>0&&s<=600&&window.innerWidth>=800&&window.innerWidth<1024){var apply=function(){var m=document.querySelector('meta[name="viewport"]');if(m){m.setAttribute("content","width=1280, viewport-fit=cover")}document.documentElement.classList.add("phone-desktop")};apply();document.addEventListener("DOMContentLoaded",apply)}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: PHONE_DESKTOP_MODE }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

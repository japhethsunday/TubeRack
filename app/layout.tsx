import type { Metadata } from "next";
import { headers } from "next/headers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "TubeRack — AI Video Production Platform",
  description:
    "AI video production and YouTube intelligence: research, scripts, voice, visuals, packaging, and analytics in one workspace.",
};

const THEME_INIT = `(function(){try{var t=localStorage.getItem("tuberack-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;

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

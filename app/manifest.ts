import type { MetadataRoute } from "next";

/** Makes Recktube installable ("Add to Home Screen"): opens full screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recktube",
    short_name: "Recktube",
    description: "AI video production and YouTube intelligence.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0714",
    theme_color: "#0b0714",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/recktube-logo-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

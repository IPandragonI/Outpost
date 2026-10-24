import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Outpost — analyse d'échecs",
    short_name: "Outpost",
    description:
      "Analyse d'échecs privée dans le navigateur : Stockfish, classification des coups et théorie des ouvertures, hors ligne. · Private chess analysis in your browser, offline.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4ecdc",
    theme_color: "#f4ecdc",
    categories: ["games", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

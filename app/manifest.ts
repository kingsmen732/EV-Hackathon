import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChargeMesh — AI EV charging network",
    short_name: "ChargeMesh",
    description: "Predictive EV charging reservations, grid-aware matching and energy sharing.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070b10",
    theme_color: "#070b10",
    categories: ["travel", "utilities", "navigation"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find a charger", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My garage", url: "/garage", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

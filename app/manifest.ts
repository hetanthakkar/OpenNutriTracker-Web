import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpenNutriTracker",
    short_name: "NutriTracker",
    description: "Private nutrition tracking with on-device nutrition-label OCR.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf8",
    theme_color: "#168a5b",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

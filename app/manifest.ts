import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyFitnessTracker",
    short_name: "MyFitnessTracker",
    description: "Track meals, nutrition, hydration, activity and progress.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#111111",
    theme_color: "#111111",
  };
}

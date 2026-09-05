import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Stamped into the bundle and written to /version.json. The running app compares
// the two to answer a question it otherwise can't: "is what I'm running still
// the current build?" See src/main.tsx — it's the escape hatch for a service
// worker that has got itself stuck, which is the only reason an installed PWA
// ever has to be deleted and re-added to pick up a deploy.
const BUILD_ID = new Date().toISOString();

/** Emits /version.json next to the app. Deliberately not precached (Workbox's
 *  default globPatterns don't include .json), so it always comes off the
 *  network and can speak for the *server* rather than for the cache. */
function versionFile(): Plugin {
  return {
    name: "paired-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ id: BUILD_ID }),
      });
    },
  };
}

// PWA setup adapted from the Macrocenter project: autoUpdate + a foreground
// re-check (see src/main.tsx) so a new deploy reaches installed home-screen
// apps promptly, and the FCM SW is left for Firebase to own.
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionFile(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      workbox: {
        globIgnores: ["**/firebase-messaging-sw.js"],
        navigateFallbackDenylist: [/^\/api/],
        // Old precaches from previous builds are dead weight and can serve a
        // stale shell if a new SW ever fails to take over cleanly.
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Together — for couples",
        short_name: "Together",
        description: "Grow closer with daily questions, quizzes and games.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ],
});

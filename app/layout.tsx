import type { Metadata, Viewport } from "next";
import { PwaRuntime } from "@/components/pwa-runtime";
import "./globals.css";
import "./settings-layout-fix.css";
import "./interaction-fixes.css";
import "./pwa.css";
import "./apple-health.css";

export const metadata: Metadata = {
  title: "OpenNutriTracker",
  description: "Track meals, nutrition, hydration, activity and progress.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  appleWebApp: {
    capable: true,
    title: "OpenNutriTracker",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f7f4ef",
};

const pwaBootstrap = `
(function () {
  var root = document.documentElement;
  var installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  root.dataset.pwaStandalone = installed ? "true" : "false";

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    window.__ontInstallPrompt = event;
  });

  window.addEventListener("appinstalled", function () {
    window.__ontInstallPrompt = null;
    root.dataset.pwaStandalone = "true";
  });

  if (!installed) return;

  var setHeight = function () {
    var height = window.innerHeight;
    if (navigator.standalone === true) {
      var portrait = window.matchMedia("(orientation: portrait)").matches;
      var screenHeight = portrait
        ? Math.max(window.screen.width, window.screen.height)
        : Math.min(window.screen.width, window.screen.height);
      height = Math.max(height, screenHeight);
    }
    root.style.setProperty("--app-height", height + "px");
  };

  setHeight();
  window.addEventListener("resize", setHeight);
  window.addEventListener("orientationchange", setHeight);
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: pwaBootstrap }} />
      </head>
      <body>
        <PwaRuntime />
        {children}
      </body>
    </html>
  );
}

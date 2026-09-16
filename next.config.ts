import type { NextConfig } from "next";

// Stamp every build, including CLI deployments made from the same local Git
// commit. The installed PWA compares this value with /version.json to detect
// and recover from a stale service worker. A commit SHA is not sufficient here
// because multiple production deployments can share the same SHA.
const configuredBuildId = process.env.NEXT_PUBLIC_BUILD_ID?.trim();
const buildId =
  configuredBuildId
  || process.env.VERCEL_DEPLOYMENT_ID
  || process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.COMMIT_SHA
  || new Date().toISOString();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  serverExternalPackages: ["firebase-admin"],
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  async headers() {
    return [
      // The PWA shell and update sentinels must never be served from a stale
      // browser/CDN response.  A service-worker registration can otherwise
      // keep asking for yesterday's /sw.js even after a production deploy.
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/version.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/ocr-assets/v1/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://health-6d09b.firebaseapp.com/__/auth/:path*",
      },
      {
        source: "/__/firebase/:path*",
        destination: "https://health-6d09b.firebaseapp.com/__/firebase/:path*",
      },
    ];
  },
};

export default nextConfig;

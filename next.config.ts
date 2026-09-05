import type { NextConfig } from "next";

const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.COMMIT_SHA ??
  "dev";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
};

export default nextConfig;

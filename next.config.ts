import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This project lives alongside other workspaces; pin the trace root to itself.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;

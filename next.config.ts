import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: Use `output: "export"` only when building for Tauri/Capacitor static export
  // During development, keep it commented out so the dev server works normally
  // output: "export",
  images: {
    unoptimized: true, // Required for static export
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;

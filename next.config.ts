import type { NextConfig } from "next";

if (process.platform === 'win32') {
  try {
    require('./scripts/patch-readlink');
  } catch {}
}

const pkg = require('./package.json');

const nextConfig: NextConfig = {
  // NOTE: Use `output: "export"` only when building for Tauri/Capacitor static export
  // During development, keep it commented out so the dev server works normally
  output: process.env.NEXT_STATIC_EXPORT === '1' ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || pkg.version,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ['adm-zip'],
  experimental: {
    cpus: 1,
  },
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (process.platform === 'win32') {
      config.resolve.symlinks = false;
      config.snapshot = {
        ...config.snapshot,
        managedPaths: [],
        immutablePaths: [],
      };
      config.cache = typeof config.cache === 'object' ? { ...config.cache, buildDependencies: {} } : false;
    }
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import pkg from './package.json';

const nextConfig: NextConfig = {
  output: "standalone",
  // Native key requests must reach Go with their exact path, including the
  // documented chapters collection slash. Preserve the default web redirect.
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [{
      source: '/:path+/', destination: '/:path+', permanent: true,
      missing: [{ type: 'header', key: 'authorization', value: '[Bb][Ee][Aa][Rr][Ee][Rr] dlpk1_.*' }],
    }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Same-origin frames are used by the client PDF renderer.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
          },
        ],
      },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || pkg.version,
  },
  typescript: {
    ignoreBuildErrors: false,
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

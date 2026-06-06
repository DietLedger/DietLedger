#!/usr/bin/env node

/**
 * DietLedger Production Server Entry Point
 *
 * Standalone Next.js server for Docker deployment.
 * Requires output: "standalone" in next.config.ts.
 *
 * Environment variables:
 *   PORT         - Server port (default: 3000)
 *   HOSTNAME     - Server bind address (default: 127.0.0.1)
 *   FDA_API_KEY  - FDA FoodData Central API key
 */

const path = require("path");
const fs = require("fs");
const http = require("http");

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

process.env.NODE_ENV = "production";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOSTNAME = process.env.HOSTNAME || (process.env.DOCKER ? "0.0.0.0" : "127.0.0.1");

const APP_VERSION = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, "BUILD_VERSION"), "utf-8").trim();
  } catch {}
  try {
    return require(path.join(__dirname, "package.json")).version;
  } catch {}
  return process.env.NEXT_PUBLIC_APP_VERSION || "unknown";
})();

console.log(`[DietLedger] Version: ${APP_VERSION}`);
console.log(`[DietLedger] Node: ${process.version}`);
console.log(`[DietLedger] Environment: ${process.env.DOCKER ? "docker" : "native"}`);

if (!process.env.FDA_API_KEY) {
  process.env.FDA_API_KEY = "DEMO_KEY";
  console.warn(
    "[DietLedger] FDA_API_KEY not set — using DEMO_KEY (rate-limited to 30 req/hour)"
  );
}

// ---------------------------------------------------------------------------
// Resolve the server root directory
// ---------------------------------------------------------------------------

// When running from the project root, the standalone output is in
// .next/standalone/. When deployed via Docker, the standalone files
// are at the server root.

let serverRoot;

if (fs.existsSync(path.join(__dirname, ".next", "required-server-files.json"))) {
  serverRoot = __dirname;
} else if (
  fs.existsSync(
    path.join(__dirname, ".next", "standalone", ".next", "required-server-files.json")
  )
) {
  serverRoot = path.join(__dirname, ".next", "standalone");
} else {
  console.error(
    "[DietLedger] Error: Next.js standalone build not found.\n" +
      'Run `npm run build` (with output: "standalone" in next.config) first.'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Ensure static assets are accessible
// ---------------------------------------------------------------------------

// The standalone server expects .next/static/ and public/ relative to the
// server root. When running from the project root we create junction
// symlinks so the standalone server can find them.

if (serverRoot !== __dirname) {
  const staticSource = path.join(__dirname, ".next", "static");
  const staticTarget = path.join(serverRoot, ".next", "static");
  const publicSource = path.join(__dirname, "public");
  const publicTarget = path.join(serverRoot, "public");

  if (!fs.existsSync(staticTarget) && fs.existsSync(staticSource)) {
    fs.mkdirSync(path.dirname(staticTarget), { recursive: true });
    fs.symlinkSync(staticSource, staticTarget, "junction");
  }
  if (!fs.existsSync(publicTarget) && fs.existsSync(publicSource)) {
    fs.symlinkSync(publicSource, publicTarget, "junction");
  }
}

// ---------------------------------------------------------------------------
// Load Next.js config & start the server
// ---------------------------------------------------------------------------

const configPath = path.join(serverRoot, ".next", "required-server-files.json");
const { config: nextConfig } = JSON.parse(fs.readFileSync(configPath, "utf-8"));

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

const NextServer = require(path.join(
  serverRoot,
  "node_modules/next/dist/server/next-server"
)).default;

const nextServer = new NextServer({
  hostname: HOSTNAME,
  port: PORT,
  dir: serverRoot,
  dev: false,
  conf: nextConfig,
});

const requestHandler = nextServer.getRequestHandler();

const httpServer = http.createServer(async (req, res) => {
  try {
    await requestHandler(req, res);
  } catch (err) {
    console.error("[DietLedger] Request error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain");
    }
    res.end("Internal Server Error");
  }
});

httpServer.on("error", (err) => {
  console.error("[DietLedger] Server error:", err);
  process.exit(1);
});

httpServer.listen(PORT, HOSTNAME, () => {
  console.log(
    `[DietLedger] Production server running at http://${HOSTNAME}:${PORT}`
  );
});

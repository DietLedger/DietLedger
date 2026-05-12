#!/usr/bin/env node

/**
 * NutriLabel Production Server Entry Point
 *
 * A copy/symlink-compatible entry point that the Tauri desktop app can bundle.
 * Works in two contexts:
 *   1. Project root:  `bun server.js` — auto-locates .next/standalone/
 *   2. Tauri bundle:  Placed inside the server/ resource directory alongside
 *                     the standalone output files.
 *
 * Environment variables:
 *   PORT         - Server port (default: 3000)
 *   HOSTNAME     - Server bind address (default: 127.0.0.1)
 *   DATABASE_URL - SQLite database connection string
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

if (!process.env.DATABASE_URL) {
  const dbPath = path.join(__dirname, "db", "custom.db");
  process.env.DATABASE_URL = `sqlite:${dbPath}`;
  console.warn(
    `[NutriLabel] DATABASE_URL not set — defaulting to ${process.env.DATABASE_URL}`
  );
}

if (!process.env.FDA_API_KEY) {
  process.env.FDA_API_KEY = "DEMO_KEY";
  console.warn(
    "[NutriLabel] FDA_API_KEY not set — using DEMO_KEY (rate-limited to 30 req/hour)"
  );
}

// ---------------------------------------------------------------------------
// Resolve the server root directory
// ---------------------------------------------------------------------------

// When bundled inside Tauri, this file sits alongside the standalone output
// (i.e. __dirname IS the server root).  When running from the project root we
// need to descend into .next/standalone/ where the real server files live.

let serverRoot;

if (fs.existsSync(path.join(__dirname, ".next", "required-server-files.json"))) {
  // Already inside the standalone / Tauri bundle directory
  serverRoot = __dirname;
} else if (
  fs.existsSync(
    path.join(__dirname, ".next", "standalone", ".next", "required-server-files.json")
  )
) {
  // Running from the project root — redirect to the standalone build
  serverRoot = path.join(__dirname, ".next", "standalone");
} else {
  console.error(
    "[NutriLabel] Error: Next.js standalone build not found.\n" +
      'Run `bun run build` (with output: "standalone" in next.config) first.'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Ensure static assets are accessible
// ---------------------------------------------------------------------------

// The standalone server expects .next/static/ and public/ relative to the
// server root.  When running from the project root we create junction
// symlinks so the standalone server can find them.  In the Tauri bundle
// these directories are already copied by the build script.

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
    console.error("[NutriLabel] Request error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain");
    }
    res.end("Internal Server Error");
  }
});

httpServer.on("error", (err) => {
  console.error("[NutriLabel] Server error:", err);
  process.exit(1);
});

httpServer.listen(PORT, HOSTNAME, () => {
  console.log(
    `[NutriLabel] Production server running at http://${HOSTNAME}:${PORT}`
  );
});

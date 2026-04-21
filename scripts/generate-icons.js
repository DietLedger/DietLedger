#!/usr/bin/env node
/**
 * Icon generator for NutriLabel app
 * Generates PWA icons, favicon, and Tauri icons from an SVG source.
 * Uses sharp for PNG conversion and a manual ICO encoder.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// ─── SVG Design ───────────────────────────────────────────────────────────────
// Emerald green rounded square with a white chef hat silhouette.
// Base viewBox is 512x512 so it scales cleanly to all sizes.

const baseSvg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>

  <!-- Rounded square background -->
  <rect x="0" y="0" width="512" height="512" rx="96" ry="96" fill="url(#bg)"/>

  <!-- Chef hat - white silhouette -->
  <g fill="white">
    <!-- Hat band (cylindrical base) -->
    <rect x="168" y="305" width="176" height="48" rx="8" ry="8"/>

    <!-- Puffy dome top -->
    <path d="
      M 168 305
      C 168 305 108 305 108 240
      C 108 190 142 160 182 152
      C 178 118 210 90 256 90
      C 302 90 334 118 330 152
      C 370 160 404 190 404 240
      C 404 305 344 305 344 305
      Z
    "/>

    <!-- Subtle puff lines on the dome for detail -->
    <ellipse cx="210" cy="195" rx="30" ry="18" fill="rgba(255,255,255,0.15)" />
    <ellipse cx="302" cy="195" rx="30" ry="18" fill="rgba(255,255,255,0.15)" />
    <ellipse cx="256" cy="175" rx="28" ry="16" fill="rgba(255,255,255,0.15)" />
  </g>
</svg>`;

// ─── Output paths ─────────────────────────────────────────────────────────────

const publicDir = path.join(__dirname, '..', 'public');
const tauriIconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');

const outputs = [
  // PWA icons
  { path: path.join(publicDir, 'icon-192.png'), size: 192 },
  { path: path.join(publicDir, 'icon-512.png'), size: 512 },

  // Tauri icons
  { path: path.join(tauriIconsDir, '32x32.png'), size: 32 },
  { path: path.join(tauriIconsDir, '128x128.png'), size: 128 },
  { path: path.join(tauriIconsDir, '128x128@2x.png'), size: 256 },
];

// ─── ICO encoder ──────────────────────────────────────────────────────────────
// Creates a valid ICO file containing one or more PNG images.
// Modern ICO format supports embedded PNG data.

function createIco(pngBuffers) {
  const count = pngBuffers.length;

  // ICO header: 6 bytes
  const headerSize = 6;
  // Each directory entry: 16 bytes
  const entrySize = 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type = 1 (ICO)
  header.writeUInt16LE(count, 4);  // image count

  const entries = [];
  let dataOffset = headerSize + entrySize * count;

  for (const { width, height, png } of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);  // 0 means 256
    entry.writeUInt8(height >= 256 ? 0 : height, 1); // 0 means 256
    entry.writeUInt8(0, 2);          // color palette
    entry.writeUInt8(0, 3);          // reserved
    entry.writeUInt16LE(1, 4);       // color planes
    entry.writeUInt16LE(32, 6);      // bits per pixel
    entry.writeUInt32LE(png.length, 8);  // image data size
    entry.writeUInt32LE(dataOffset, 12); // image data offset
    entries.push(entry);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map(e => e.png)]);
}

// ─── Generate ─────────────────────────────────────────────────────────────────

async function generateIcons() {
  console.log('🎨 Generating NutriLabel app icons...\n');

  // Ensure output directories exist
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(tauriIconsDir, { recursive: true });

  // Generate all PNG icons
  for (const { path: outPath, size } of outputs) {
    const svg = baseSvg(size);
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`  ✔ ${path.relative(process.cwd(), outPath)} (${size}x${size})`);
  }

  // Generate favicon.ico (contains 16x16, 32x32, and 48x48 PNGs)
  console.log('\n📦 Generating favicon.ico...');
  const icoSizes = [16, 32, 48];
  const icoPngs = [];
  for (const size of icoSizes) {
    const svg = baseSvg(size);
    const png = await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toBuffer();
    icoPngs.push({ width: size, height: size, png });
    console.log(`  ✔ Embedded ${size}x${size} PNG in ICO`);
  }
  const icoBuffer = createIco(icoPngs);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log(`  ✔ public/favicon.ico`);

  // Generate Tauri icon.ico (contains 32x32 and 256x256 PNGs)
  console.log('\n📦 Generating Tauri icon.ico...');
  const tauriIcoSizes = [32, 256];
  const tauriIcoPngs = [];
  for (const size of tauriIcoSizes) {
    const svg = baseSvg(size);
    const png = await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toBuffer();
    tauriIcoPngs.push({ width: size, height: size, png });
    console.log(`  ✔ Embedded ${size}x${size} PNG in ICO`);
  }
  const tauriIcoBuffer = createIco(tauriIcoPngs);
  fs.writeFileSync(path.join(tauriIconsDir, 'icon.ico'), tauriIcoBuffer);
  console.log(`  ✔ src-tauri/icons/icon.ico`);

  console.log('\n✅ All icons generated successfully!');
}

generateIcons().catch((err) => {
  console.error('❌ Error generating icons:', err);
  process.exit(1);
});

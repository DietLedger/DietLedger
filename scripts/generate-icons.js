#!/usr/bin/env node
/**
 * Icon generator for DietLedger app
 * Generates PWA icons, favicon, and Tauri icons from an SVG source.
 * Uses sharp for PNG conversion and a manual ICO encoder.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const baseSvg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5B8C8E"/>
      <stop offset="100%" stop-color="#4A7B7D"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="96" fill="url(#bg)"/>

  <!-- Back card -->
  <rect x="80" y="96" width="272" height="208" rx="10" fill="#F0DFC0" stroke="#3C2415" stroke-width="5"/>
  <rect x="104" y="156" width="224" height="28" rx="4" fill="#5B8C8E" opacity="0.4"/>
  <line x1="104" y1="208" x2="328" y2="208" stroke="#3C2415" stroke-width="3.5" opacity="0.3"/>
  <line x1="104" y1="236" x2="328" y2="236" stroke="#3C2415" stroke-width="3.5" opacity="0.3"/>
  <line x1="104" y1="264" x2="240" y2="264" stroke="#3C2415" stroke-width="3.5" opacity="0.3"/>

  <!-- Front card body -->
  <rect x="160" y="208" width="272" height="228" rx="10" fill="#F8ECD0" stroke="#3C2415" stroke-width="6"/>
  <!-- Tab at top edge -->
  <rect x="256" y="180" width="64" height="48" rx="10" fill="#F8ECD0"/>
  <rect x="260" y="184" width="56" height="40" rx="8" fill="#F8ECD0" stroke="#3C2415" stroke-width="6"/>
  <line x1="266" y1="220" x2="310" y2="220" stroke="#F8ECD0" stroke-width="10"/>
  <!-- Header band -->
  <rect x="184" y="296" width="224" height="32" rx="4" fill="#5B8C8E"/>
  <!-- Title line (bold) -->
  <line x1="184" y1="352" x2="408" y2="352" stroke="#3C2415" stroke-width="7"/>
  <!-- Text lines -->
  <line x1="184" y1="380" x2="408" y2="380" stroke="#3C2415" stroke-width="3.5" opacity="0.45"/>
  <line x1="184" y1="408" x2="408" y2="408" stroke="#3C2415" stroke-width="3.5" opacity="0.45"/>
  <line x1="184" y1="436" x2="320" y2="436" stroke="#3C2415" stroke-width="3.5" opacity="0.45"/>
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
  console.log('Generating DietLedger app icons...\n');

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

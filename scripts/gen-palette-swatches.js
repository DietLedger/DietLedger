const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '..', 'public', 'palettes');
fs.mkdirSync(outDir, { recursive: true });

const palettes = [
  {
    name: 'A - Warm Library',
    description: 'Warm amber, cream, and chestnut brown',
    colors: {
      primary: '#B8860B',
      primaryForeground: '#FFFBF0',
      background: '#FFFBF0',
      foreground: '#3B2314',
      card: '#FFFFFF',
      secondary: '#F5EDE0',
      accent: '#F0D9A8',
      muted: '#E8DFD2',
      mutedForeground: '#8B7355',
      border: '#D4C4AE',
      destructive: '#C0392B',
    },
  },
  {
    name: 'B - Dusty Rose Ledger',
    description: 'Dusty rose, parchment, and deep burgundy',
    colors: {
      primary: '#9E6B7B',
      primaryForeground: '#FDF8F6',
      background: '#FDF8F6',
      foreground: '#3D2630',
      card: '#FFFFFF',
      secondary: '#F5E8EC',
      accent: '#E8C8D4',
      muted: '#E8DEE2',
      mutedForeground: '#8B6B78',
      border: '#D4BCC5',
      destructive: '#B33A3A',
    },
  },
  {
    name: 'C - Vintage Teal Catalog',
    description: 'Muted teal, warm ivory, and sepia brown',
    colors: {
      primary: '#4A7C7E',
      primaryForeground: '#FAFAF5',
      background: '#FAFAF5',
      foreground: '#2C1E14',
      card: '#FFFFFF',
      secondary: '#E8E4DA',
      accent: '#C2D8D8',
      muted: '#E0DCD4',
      mutedForeground: '#6B6058',
      border: '#C8C0B4',
      destructive: '#B33A3A',
    },
  },
  {
    name: 'D - Olive Botanical',
    description: 'Olive green, linen cream, and dark umber',
    colors: {
      primary: '#6B7C3E',
      primaryForeground: '#FBFAF4',
      background: '#FBFAF4',
      foreground: '#2A2A1E',
      card: '#FFFFFF',
      secondary: '#EDE9D8',
      accent: '#C8D4A0',
      muted: '#E0DCCE',
      mutedForeground: '#6B6848',
      border: '#C4C0A8',
      destructive: '#A83232',
    },
  },
  {
    name: 'E - Slate Ink',
    description: 'Slate blue, cool white, and charcoal ink',
    colors: {
      primary: '#4A5568',
      primaryForeground: '#F8FAFC',
      background: '#F8FAFC',
      foreground: '#1A202C',
      card: '#FFFFFF',
      secondary: '#EDF2F7',
      accent: '#B0C0D8',
      muted: '#E2E8F0',
      mutedForeground: '#718096',
      border: '#CBD5E0',
      destructive: '#C53030',
    },
  },
];

function buildSvg(palette) {
  const swatchW = 140;
  const swatchH = 100;
  const gap = 16;
  const headerH = 90;
  const footerH = 20;
  const cols = 3;

  const keys = Object.keys(palette.colors);
  const rows = Math.ceil(keys.length / cols);
  const svgW = cols * swatchW + (cols + 1) * gap;
  const svgH = headerH + rows * (swatchH + 28) + (rows + 1) * gap + footerH;

  let svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">`;

  svg += `<rect width="${svgW}" height="${svgH}" fill="#F8F8F8" rx="12"/>`;

  svg += `<text x="${svgW / 2}" y="38" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="#333">${palette.name}</text>`;
  svg += `<text x="${svgW / 2}" y="62" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#888">${palette.description}</text>`;

  let i = 0;
  for (const key of keys) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gap + col * (swatchW + gap);
    const y = headerH + gap + row * (swatchH + 28 + gap);

    svg += `<rect x="${x + 2}" y="${y + 2}" width="${swatchW}" height="${swatchH}" rx="8" fill="#00000012"/>`;
    svg += `<rect x="${x}" y="${y}" width="${swatchW}" height="${swatchH}" rx="8" fill="${palette.colors[key]}"/>`;

    const hex = palette.colors[key].replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (r > 225 && g > 225 && b > 225) {
      svg += `<rect x="${x}" y="${y}" width="${swatchW}" height="${swatchH}" rx="8" fill="none" stroke="#CCCCCC" stroke-width="1"/>`;
    }

    const textColor = (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#444' : '#FFF';
    svg += `<text x="${x + swatchW / 2}" y="${y + swatchH / 2 + 5}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="${textColor}">${palette.colors[key]}</text>`;
    svg += `<text x="${x + swatchW / 2}" y="${y + swatchH + 18}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#777">${key}</text>`;

    i++;
  }

  svg += `</svg>`;
  return svg;
}

async function main() {
  for (const palette of palettes) {
    const svg = buildSvg(palette);
    const slug = palette.name.split(' ').slice(1).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const outPath = path.join(outDir, `palette-${slug}.png`);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outPath);

    console.log(`  ${palette.name} -> public/palettes/palette-${slug}.png`);
  }
  console.log('\nAll palettes generated!');
}

main().catch(err => { console.error(err); process.exit(1); });

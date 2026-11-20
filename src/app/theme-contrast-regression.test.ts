import { readFileSync } from 'node:fs';
import { transform } from 'lightningcss';
import { describe, expect, it } from 'vitest';
import { THEMES } from '@/lib/themes';

// Convert the actual OKLCH tokens to sRGB before calculating WCAG contrast.
function luminance(color: string) {
  const css = transform({ filename: 'color.css', code: Buffer.from(`a{color:${color}}`), targets: { chrome: 90 << 16 } }).code.toString();
  const hex = css.match(/color:\s*#([\da-f]{6})/i)?.[1];
  if (!hex) throw new Error(`Cannot convert ${color}: ${css}`);
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('dark palette selection contrast', () => {
  it.each(THEMES)('$name has readable brand text on selection and normal surfaces', theme => {
    for (const background of ['--brand-50', '--brand-100']) {
      for (const foreground of ['--foreground', '--brand-700', '--brand-800', '--brand-900']) {
        expect(contrast(theme.dark[background], theme.dark[foreground]), `${background} / ${foreground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(theme.dark['--brand-100'], theme.dark['--brand-600']), 'instruction icon').toBeGreaterThanOrEqual(4.5);
  });
});

describe('public first paint', () => {
  it('emits the default theme and appearance on the server root', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).toMatch(/<html\b[^>]*data-app-theme="dark-luxury"/);
    expect(layout).toMatch(/<html\b[^>]*data-app-appearance="dark"/);
    expect(layout).toMatch(/<html\b[^>]*className="dark"/);
  });
});

import { transform } from 'lightningcss';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES } from './themes';

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

describe('Luxury palette', () => {
  const luxury = THEMES.find(theme => theme.id === 'dark-luxury')!;

  it('keeps the existing default ID and dark palette while offering a distinct light variant', () => {
    expect(DEFAULT_THEME).toBe('dark-luxury');
    expect(luxury.name).toBe('Luxury');
    expect(luxury.dark['--background']).toBe('oklch(0.17 0.025 55)');
    expect(luxury.dark['--accent']).toBe('oklch(0.33 0.07 165)');
    expect(luxury.light['--background']).not.toBe(luxury.dark['--background']);
    expect(Object.keys(luxury.light).sort()).toEqual(Object.keys(luxury.dark).sort());
    expect(luminance(luxury.light['--background'])).toBeGreaterThan(0.75);
  });

  it('provides readable text, controls, selection and focus contrast in light appearance', () => {
    const tokens = luxury.light;
    const pairs = [
      ['--background', '--foreground'], ['--card', '--card-foreground'],
      ['--popover', '--popover-foreground'], ['--primary', '--primary-foreground'],
      ['--secondary', '--secondary-foreground'], ['--muted', '--muted-foreground'],
      ['--accent', '--accent-foreground'], ['--sidebar', '--sidebar-foreground'],
      ['--sidebar-primary', '--sidebar-primary-foreground'],
      ['--sidebar-accent', '--sidebar-accent-foreground'],
      ['--brand-50', '--brand-700'], ['--brand-100', '--brand-700'],
      ['--brand-100', '--foreground'], ['--brand-100', '--brand-600'],
    ];
    for (const [background, foreground] of pairs) {
      expect(contrast(tokens[background], tokens[foreground]), `${background} / ${foreground}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(tokens['--ring'], tokens['--background']), 'focus ring / background').toBeGreaterThanOrEqual(3);
  });
});

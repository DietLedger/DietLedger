import { readFileSync } from 'node:fs';
import { transform } from 'lightningcss';
import postcss, { type Container, type Document, type Rule } from 'postcss';
import { afterEach, describe, expect, it } from 'vitest';
import { THEMES } from '@/lib/themes';

// Exercise the real selectors against representative markup, not CSS substrings.
// This protects translation boundaries; browser review still verifies contrast.
const source = postcss.parse(readFileSync('src/app/globals.css', 'utf8'));
const screen = source.nodes.filter(node => node.type === 'atrule' && node.name === 'media' && node.params.split(',').map(value => value.trim()).includes('screen'));
const rules = postcss.parse(transform({
  filename: 'luxury-surfaces.css',
  code: Buffer.from(screen.map(node => node.toString()).join('\n')),
  targets: { chrome: 100 << 16 }, // Lower nesting for DOM selector matching.
}).code.toString());

function declarations(element: Element, property: string, media = 'screen', layered = false) {
  const values: string[] = [];
  rules.walkRules((rule: Rule) => {
    let inLayer = false;
    let active = true;
    for (let parent: Container | Document | undefined = rule.parent; parent; parent = parent.parent) {
      if (!(parent instanceof postcss.AtRule)) continue;
      if (parent.name === 'layer') inLayer = true;
      if (parent.name === 'media' && !parent.params.split(',').map(value => value.trim()).includes(media)) active = false;
    }
    if (!active || inLayer !== layered) return;
    // jsdom does not expose user hover state; mark the hovered elements explicitly.
    if (!element.matches(rule.selector.replaceAll(':hover', '[data-test-hover]'))) return;
    rule.walkDecls(property, declaration => { values.push(declaration.value); });
  });
  return values;
}

function fixture(markup: string, theme = 'dark-luxury', dark = false) {
  document.documentElement.dataset.appTheme = theme;
  document.documentElement.classList.toggle('dark', dark || theme === 'dark-luxury');
  document.body.innerHTML = markup;
  return document.body.firstElementChild!;
}

afterEach(() => {
  delete document.documentElement.dataset.appTheme;
  delete document.documentElement.dataset.appAppearance;
  document.documentElement.classList.remove('dark');
  document.body.innerHTML = '';
});

describe('Dark Luxury startup fallback', () => {
  it.each([':root', '.dark'])('%s matches the complete Dark Luxury palette before hydration', selector => {
    const palette = THEMES.find(theme => theme.id === 'dark-luxury')!.dark;
    const rule = source.nodes.find(node => node.type === 'rule' && node.selectors.includes(selector) && node.nodes.some(child => child.type === 'decl' && child.prop === '--background'));
    expect(rule?.type).toBe('rule');
    if (!rule || rule.type !== 'rule') throw new Error(`Missing ${selector}`);
    const tokens = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
    for (const [name, value] of Object.entries(palette)) expect(tokens[name], `${selector} ${name}`).toBe(value);
  });
});

describe('Olive Botanical light-mode text contrast', () => {
  it.each([
    '<p class="text-xs text-stone-400">For live food search</p>',
    '<span class="text-stone-400 text-xs">— Olive green, linen cream</span>',
    '<p class="text-[11px] text-stone-400 pt-2">DietLedger build</p>',
    '<p class="text-sm text-stone-400">No ingredients yet</p>',
    '<p class="text-xs text-stone-300 mt-1">Click Add Ingredient</p>',
    '<p class="text-sm text-stone-400 text-center py-4">No categories yet</p>',
  ])('darkens measured helper and empty-state text: %s', markup => {
    const text = fixture(markup, 'olive-botanical');
    expect(declarations(text, 'color')).toEqual(['var(--color-stone-600)']);
  });

  it('darkens the amber demo warning without changing its status hue', () => {
    const warning = fixture('<p class="text-xs text-amber-600 mt-2">Currently using the demo key</p>', 'olive-botanical');
    expect(declarations(warning, 'color')).toEqual(['var(--color-amber-700)']);
  });

  it.each([
    ['dark-luxury', false], ['vintage-teal', false], ['olive-botanical', true],
  ] as const)('does not apply Olive rules to %s (dark=%s)', (theme, dark) => {
    const text = fixture('<p class="text-xs text-amber-600 mt-2">Warning</p>', theme, dark);
    expect(declarations(text, 'color')).not.toContain('var(--color-amber-700)');
  });

  it('leaves paper, icons and print alone', () => {
    const paper = fixture('<div class="print-section"><p class="text-xs text-stone-300">Paper</p><p class="text-xs text-amber-600 mt-2">Warning</p></div>', 'olive-botanical');
    for (const node of paper.querySelectorAll('p')) expect(declarations(node, 'color')).toEqual([]);
    const icon = fixture('<svg class="text-stone-300"></svg>', 'olive-botanical');
    expect(declarations(icon, 'color')).toEqual([]);
    const text = fixture('<p class="text-xs text-stone-400">Hint</p>', 'olive-botanical');
    expect(declarations(text, 'color', 'print')).toEqual([]);
  });
});

describe('Dark Luxury legacy surface boundaries', () => {
  it.each([false, true])('translates ordinary surfaces in root dark mode = %s', dark => {
    const surface = fixture('<section class="bg-white border-stone-200"><p class="text-stone-800">Recipe</p><span class="text-stone-400">Source</span></section>', 'dark-luxury', dark);
    expect(declarations(surface, 'background-color')).toEqual(['var(--background)']);
    expect(declarations(surface, 'border-color')).toEqual(['var(--border)']);
    expect(declarations(surface.querySelector('p')!, 'color')).toEqual(['var(--foreground)']);
    expect(declarations(surface.querySelector('span')!, 'color')).toEqual(['var(--muted-foreground)']);
  });

  it.each(['olive-botanical', 'vintage-teal', 'slate', ''])('does not translate light palette %s', theme => {
    const surface = fixture('<div class="bg-white text-stone-800 border-stone-200 hover:bg-stone-50" data-test-hover></div>', theme);
    for (const property of ['background-color', 'color', 'border-color']) {
      expect(declarations(surface, property)).toEqual([]);
      expect(declarations(surface, property, 'screen', true)).toEqual([]);
    }
  });

  it.each(['olive-botanical', 'vintage-teal', 'slate'])('translates legacy surfaces using the %s dark palette', theme => {
    const surface = fixture('<div class="bg-white border-stone-200"><span class="text-stone-700">Recipe</span><button class="hover:bg-stone-100" data-test-hover>Hover</button></div>', theme, true);
    expect(declarations(surface, 'background-color')).toEqual(['var(--background)']);
    expect(declarations(surface, 'border-color')).toEqual(['var(--border)']);
    expect(declarations(surface.querySelector('span')!, 'color')).toEqual(['var(--foreground)']);
    expect(declarations(surface.querySelector('button')!, 'background-color')).toEqual(['var(--accent)']);
  });

  it.each(THEMES.map(theme => theme.id))('keeps nested selection surfaces dark and translates their text in %s', theme => {
    const selected = fixture('<div class="bg-brand-50"><div class="bg-white"><span class="text-stone-700">Selected</span></div></div>', theme, true);
    expect(declarations(selected.querySelector('div')!, 'background-color')).toEqual(['var(--background)']);
    expect(declarations(selected.querySelector('span')!, 'color')).toEqual(['var(--foreground)']);
  });

  it('does not force dark surface translations for Luxury in light appearance', () => {
    const surface = fixture('<div class="bg-white text-stone-800">Light Luxury</div>', 'dark-luxury');
    document.documentElement.classList.remove('dark');
    document.documentElement.dataset.appAppearance = 'light';
    expect(declarations(surface, 'background-color')).toEqual([]);
    expect(declarations(surface, 'color')).toEqual([]);
  });

  it('supports an explicit dark appearance root attribute', () => {
    const surface = fixture('<div class="bg-white text-stone-700">Dark</div>', 'olive-botanical');
    document.documentElement.dataset.appAppearance = 'dark';
    expect(declarations(surface, 'background-color')).toEqual(['var(--background)']);
    expect(declarations(surface, 'color')).toEqual(['var(--foreground)']);
    const helper = document.createElement('p');
    helper.className = 'text-stone-400';
    surface.append(helper);
    expect(declarations(helper, 'color')).toEqual(['var(--muted-foreground)']);
  });

  it('preserves pale surfaces and paper in another dark palette', () => {
    const root = fixture('<main><div class="bg-amber-50"><p class="text-stone-700">Prep</p></div><div class="print-section bg-white text-black"><span class="text-stone-700">Report</span></div></main>', 'olive-botanical', true);
    const status = root.children[0];
    expect(declarations(status, 'color', 'screen', true)).toEqual(['var(--color-stone-800)']);
    expect(declarations(status.querySelector('p')!, 'color')).toEqual([]);
    for (const node of [root.children[1], root.querySelector('.print-section span')!]) {
      for (const property of ['color', 'background-color']) expect(declarations(node, property)).toEqual([]);
    }
  });

  it('uses theme-independent readable badge colors on screen-to-PDF paper', () => {
    const paper = fixture('<div class="print-section"><span data-slot="badge" class="bg-secondary text-secondary-foreground">vegetarian</span><span data-slot="badge" class="bg-destructive text-white">milk</span><span data-slot="badge" class="text-foreground">vegetarian</span></div>');
    const [secondary, destructive, outline] = paper.querySelectorAll('span');
    expect(declarations(secondary, 'color')).toContain('#292524');
    expect(declarations(secondary, 'background-color')).toContain('#f5f5f4');
    expect(declarations(destructive, 'color')).toContain('#991b1b');
    expect(declarations(destructive, 'background-color')).toContain('#fee2e2');
    expect(declarations(outline, 'color')).toContain('#292524');
    expect(declarations(outline, 'color', 'print')).toContain('#292524');
    expect(declarations(destructive, 'background-color', 'print')).toContain('#fee2e2');
  });

  it('keeps the compliance report and nested paper surfaces untouched for screen-to-PDF', () => {
    const paper = fixture('<div class="print-section bg-white text-black border-stone-200"><h2>Dietary Compliance Report</h2><div class="bg-stone-50 border-stone-200"><p class="text-stone-700">Thresholds</p></div></div>');
    for (const node of [paper, ...paper.querySelectorAll('*')]) {
      for (const property of ['background-color', 'color', 'border-color']) {
        expect(declarations(node, property)).toEqual([]);
      }
    }
  });

  // Opaque pale classes present in the application. Brand colors are intentionally
  // absent: Dark Luxury's brand-50/100 tokens are already dark emerald.
  it.each([
    'bg-amber-50', 'bg-amber-100', 'bg-amber-200',
    'bg-red-50', 'bg-red-100', 'bg-red-200',
    'bg-emerald-50', 'bg-emerald-100', 'bg-green-50', 'bg-green-100',
    'bg-blue-100', 'bg-cyan-100', 'bg-orange-100', 'bg-purple-100',
    'bg-indigo-100', 'bg-pink-100',
  ])('preserves %s and stone text on the surface and descendants', background => {
    const surface = fixture(`<div class="${background} text-stone-800"><div><p class="text-stone-700">Instructions</p><span class="text-stone-400">Recipe name</span></div></div>`);
    expect(declarations(surface, 'background-color')).toEqual([]);
    for (const node of [surface, ...surface.querySelectorAll('p, span')]) {
      expect(declarations(node, 'color')).toEqual([]);
    }
  });

  it('gives inherited grocery/quarantine text a dark fallback without overriding explicit status colors', () => {
    const surface = fixture('<div class="bg-amber-100"><span>Carrots</span><span class="text-stone-500">100 g</span><span class="bg-amber-100 text-amber-700">Pantry</span><span class="bg-white text-black">Label</span></div>');
    expect(declarations(surface, 'color', 'screen', true)).toEqual(['var(--color-stone-800)']);
    for (const node of surface.querySelectorAll('*')) {
      expect(declarations(node, 'color')).toEqual([]);
      expect(declarations(node, 'background-color')).toEqual([]);
    }
  });

  it.each(['bg-amber-50', 'bg-red-50'])('keeps kitchen play-mode Card text dark on %s', background => {
    const card = fixture(`<div class="${background} text-card-foreground"><p class="text-stone-800">Stir gently</p><div class="bg-white text-black">Nested light panel</div></div>`);
    // A layered fallback must also beat the Card's semantic foreground, not
    // override explicit status-colored text on ordinary pale badges.
    expect(declarations(card, 'color', 'screen', true)).toContain('var(--color-stone-800)');
    expect(declarations(card.querySelector('p')!, 'color')).toEqual([]);
    expect(declarations(card.querySelector('div')!, 'background-color')).toEqual([]);
  });

  it('keeps nested light neutral controls and explicit amber/black text light-surface-safe', () => {
    const surface = fixture('<div class="bg-emerald-50"><span class="text-stone-700">Selected meal</span><button class="bg-stone-100 text-stone-500 hover:bg-stone-200" data-test-hover>Custom</button><div class="bg-white text-black"><span class="text-amber-700">Warning</span></div></div>');
    for (const node of surface.querySelectorAll('*')) {
      expect(declarations(node, 'color')).toEqual([]);
      expect(declarations(node, 'background-color')).toEqual([]);
    }
  });

  it.each([
    ['recipe list', 'group flex items-center rounded-lg hover:bg-stone-100 text-stone-600', 'div'],
    ['instruction step', 'group flex items-start rounded-lg border hover:bg-stone-50', 'p'],
  ])('uses emerald hover and readable nested text on %s', (_name, classes, tag) => {
    const row = fixture(`<div class="${classes}" data-test-hover><${tag} class="text-stone-700">Recipe step</${tag}></div>`);
    expect(declarations(row, 'background-color')).toEqual(['var(--accent)']);
    expect(declarations(row.firstElementChild!, 'color')).toEqual(['var(--foreground)']);
    const dark = THEMES.find(theme => theme.id === 'dark-luxury')!;
    expect(dark.dark['--accent']).toBe('oklch(0.33 0.07 165)');
    expect(dark.light['--accent']).not.toBe(dark.dark['--accent']);
  });

  it.each(['50', '100', '200'])('translates stone-%s hover without a white flash', shade => {
    const row = fixture(`<button class="hover:bg-stone-${shade}"><span class="text-stone-700">Meal</span></button>`);
    expect(declarations(row, 'background-color')).toEqual([]);
    row.setAttribute('data-test-hover', '');
    expect(declarations(row, 'background-color')).toEqual(['var(--accent)']);
    expect(declarations(row.querySelector('span')!, 'color')).toEqual(['var(--foreground)']);
  });

  it('preserves emerald search hover and switches its stone-text boundary only while hovered', () => {
    const row = fixture('<button class="hover:bg-emerald-50">Recipe<span class="text-stone-400">2 servings</span></button>');
    const detail = row.querySelector('span')!;
    expect(declarations(detail, 'color')).toEqual(['var(--muted-foreground)']);
    row.setAttribute('data-test-hover', '');
    expect(declarations(row, 'background-color')).toEqual([]);
    expect(declarations(row, 'color', 'screen', true)).toContain('var(--color-stone-800)');
    expect(declarations(detail, 'color')).toEqual([]);
  });

  it('leaves theme brand surfaces dark rather than treating their names as pale', () => {
    const surface = fixture('<div class="bg-brand-50"><span class="text-stone-700">Selected settings</span></div>');
    expect(declarations(surface, 'color', 'screen', true)).toEqual([]);
    expect(declarations(surface.querySelector('span')!, 'color')).toEqual(['var(--foreground)']);
  });

  it('never applies screen translations to print', () => {
    const surface = fixture('<div class="bg-white text-stone-800 hover:bg-stone-50" data-test-hover><div class="bg-amber-50">Prep</div></div>');
    for (const node of [surface, ...surface.querySelectorAll('*')]) {
      for (const property of ['background-color', 'color', 'border-color']) {
        expect(declarations(node, property, 'print')).toEqual([]);
        expect(declarations(node, property, 'print', true)).toEqual([]);
      }
    }
  });
});

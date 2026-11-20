import { fixture } from './api';
import { emptyNutrition } from '../../src/lib/recipe-types';
import { exportCookbook, exportRecipeCard, exportNutritionDashboard, exportNutritionReport, exportElementAsPdf, exportMealPlanPdf, exportGroceryListPdf } from '../../src/lib/pdf-export';
import { retireLegacyBrowserCache } from '../../src/lib/legacy-browser-cleanup';
import type { BrandKit, RecipeRecord, TemplateTheme } from '../../src/lib/types';

const state = window as typeof window & { marker: number; securityFixture: unknown };
state.marker = 0;
const snapshots: { text: string; html: string; sandbox: string | null }[] = [];
const violations: string[] = [];
const exported: string[] = [];
const rendered: { width: number; height: number; ink: boolean }[] = [];
let currentExport = '';
const positivePreviews: string[] = [];
const toDataUrl = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function(...args) {
  const url = toDataUrl.apply(this, args);
  // Only final JPEG canvases consumed by our PDF functions, not jsPDF's
  // internal blank PNG-decoding scratch canvases.
  if (args[0] === 'image/jpeg' && this.width >= 100 && this.height >= 50) {
    const pixels = this.getContext('2d')!.getImageData(0, 0, this.width, this.height).data;
    let ink = false;
    for (let i = 0; i < pixels.length; i += 16) if (pixels[i + 3] && (pixels[i] < 230 || pixels[i + 1] < 230 || pixels[i + 2] < 230)) { ink = true; break; }
    rendered.push({ width: this.width, height: this.height, ink });
    if (currentExport === 'cookbook-positive-brand-units') positivePreviews.push(url);
  }
  return url;
};
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function inspect(node: Element) {
  for (const el of [node, ...node.querySelectorAll('*')]) {
    if (el.matches('script,svg,object,embed,link,form,base,meta[http-equiv]')) violations.push(el.tagName);
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name) || /(?:javascript:|url\(|@import)/i.test(attr.value) && attr.name === 'style') violations.push(attr.name);
    }
    if (el instanceof HTMLImageElement && !el.src.startsWith('data:image/')) violations.push('unexpected image');
  }
}
// Observe before real renderers remove their transient DOM. Inspecting the
// document.write input separately also prevents sandboxing from hiding markup.
function observeDocument(doc: Document) {
  const write = doc.write.bind(doc);
  doc.write = (...strings: string[]) => {
    write(...strings);
    const root = doc.body?.firstElementChild;
    if (root) {
      inspect(root);
      snapshots.push({ text: root.textContent ?? '', html: root.outerHTML, sandbox: doc.defaultView?.frameElement?.getAttribute('sandbox') ?? null });
    }
  };
}
const append = Node.prototype.appendChild;
Node.prototype.appendChild = function<T extends Node>(node: T): T {
  const result = append.call(this, node) as T;
  if (node instanceof HTMLIFrameElement && node.contentDocument) observeDocument(node.contentDocument);
  if (this === document.body && node instanceof HTMLElement && node.tagName === 'DIV') {
    inspect(node);
    snapshots.push({ text: node.textContent ?? '', html: node.outerHTML, sandbox: null });
  }
  return result;
};

const payload = (label: string) => `${label} <img src="/canary?${label}" onerror="parent.marker++"><script>parent.marker++</script><svg onload="parent.marker++"></svg> & " '</style><img src=/canary?style>`;
const hostileStyle = '#fff; background:url(/canary?css)" onmouseover="parent.marker++';
const brand = (logoDataUrl: string): BrandKit => ({ id: 'brand', name: payload('brand'), tagline: payload('tagline'), primaryColor: hostileStyle, secondaryColor: hostileStyle, fontFamily: hostileStyle, logoDataUrl, createdAt: '', updatedAt: '' });
function recipe(): RecipeRecord {
  return { id: 'recipe', name: payload('recipe'), description: payload('description'), servings: 4, servingName: payload('serving'), instructions: JSON.stringify({ steps: [{ id: 's', text: payload('instruction'), groupId: null }], groups: [] }), ingredients: [{ id: 'i', recipeId: 'recipe', name: payload('ingredient'), amount: 2, unit: payload('unit'), fdcId: 0, sourceType: 'manual' }, { name: 'Amount fixture', amount: payload('ingredientAmount') as unknown as number, unit: 'cup', fdcId: 0, sourceType: 'manual' }], customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 992 }, source: payload('source'), sourceLabel: payload('sourceLabel'), missingNutrients: ['vitaminD', payload('missingNutrient')] } } as RecipeRecord;
}
async function pdf(name: string, action: () => Promise<Blob>) {
  currentExport = name;
  const blob = await action();
  assert(blob.size > 100, `${name}: missing PDF`);
  assert((await blob.text()).startsWith('%PDF-'), `${name}: invalid PDF`);
  exported.push(name);
}
const safeElement = () => {
  const el = document.createElement('div');
  el.style.cssText = 'width:300px;height:120px;font:16px Arial;background:white;color:black';
  el.textContent = payload('reactText');
  document.getElementById('preview')!.appendChild(el);
  return el;
};

async function exportsCheck() {
  fixture.book = { title: payload('bookTitle'), description: payload('bookDescription'), coverColor: hostileStyle };
  fixture.chapter = payload('chapter');
  fixture.recipe = recipe();
  fixture.theme = { primaryColor: hostileStyle, backgroundColor: hostileStyle, textColor: hostileStyle, accentColor: hostileStyle, fontFamily: hostileStyle, borderRadius: 0 } as TemplateTheme;
  fixture.brand = brand('data:image/png;base64,AAAA" onerror="parent.marker++');
  await pdf('cookbook-cover-toc-recipe-index', () => exportCookbook({ bookId: 'book', brandKitId: 'brand', templateId: 'theme', pageSize: 'letter', measurementSystem: 'grams', includeCover: true, includeToc: true, includeIndex: true, includePageNumbers: true }));
  const r = fixture.recipe;
  await pdf('recipe-card', () => exportRecipeCard({ ...r, instructionSteps: [{ id: 's', text: payload('instruction'), groupId: null }], instructionGroups: [], ingredients: r.ingredients!, nutrition: emptyNutrition() }, fixture.theme, fixture.brand));
  for (const logo of ['javascript:parent.marker++', 'data:text/html,<script>parent.marker++</script>', 'data:image/svg+xml,<svg onload="parent.marker++"/>', `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" onload="parent.marker++"/>')}`, `${location.origin}/canary?external-logo`, 'https://example.invalid/logo.png']) {
    const before = snapshots.length;
    await pdf('report-hostile-logo', () => exportNutritionReport(payload('profile'), { start: '2026-01-01', end: '2026-01-02' }, [safeElement()], brand(logo)));
    assert(snapshots.slice(before).some(s => s.text.includes('Logo omitted:')), 'unsupported logo omitted silently');
  }
  await pdf('dashboard-main-header', () => exportNutritionDashboard(safeElement(), { profileName: payload('profile'), periodLabel: payload('period'), dateRange: payload('dateRange'), dietaryTags: [payload('diet')], allergens: [payload('allergen')] }));
  await pdf('element-dom-export', () => exportElementAsPdf(safeElement()));
  await pdf('meal-plan', () => exportMealPlanPdf(payload('planRange'), [{ date: '2026-01-01', dayLabel: payload('day'), slots: [{ slot: 'morning', label: payload('slot'), entries: [{ name: payload('entry'), servings: payload('mealServings') as unknown as number, isLeftover: true }] }], nutrition: emptyNutrition() }]));
  await pdf('groceries', () => exportGroceryListPdf(payload('groceryRange'), [{ name: payload('grocery'), displayAmount: payload('amount'), recipeNames: [payload('recipeLabel')] }]));
  await pause(250);
  assert(state.marker === 0, 'payload script or event executed');
  assert(!violations.length, `active DOM: ${violations.join(',')}`);
  const text = snapshots.map(s => s.text).join('\n');
  for (const label of ['bookTitle', 'bookDescription', 'chapter', 'recipe', 'ingredient', 'ingredientAmount', 'unit', 'instruction', 'serving', 'description', 'brand', 'tagline', 'source', 'sourceLabel', 'missingNutrient', 'profile', 'period', 'dateRange', 'diet', 'allergen', 'planRange', 'day', 'slot', 'entry', 'mealServings', 'groceryRange', 'grocery', 'amount', 'recipeLabel']) {
    assert(text.includes(payload(label)), `missing literal text: ${label}`);
  }
  const mainHeader = snapshots.find(s => s.sandbox === null && s.text.startsWith('Nutrition Information'));
  assert(mainHeader && ['profile', 'period', 'dateRange', 'diet', 'allergen'].every(label => mainHeader.text.includes(payload(label))), 'main-document header text escaped/lost independently of iframe');
  assert(text.includes('Logo omitted:') && text.includes('external image requests are blocked for safety and privacy'), 'omitted logo warning lost');
  assert(text.includes('248') && text.includes('Vitamin D Not reported') && text.includes('Unknown, not measured zeros'), 'custom facts/source notice lost');
  assert(snapshots.some(s => s.sandbox === 'allow-same-origin'), 'export iframe sandbox absent');

  // Positive uploaded raster, supported colors/font and food-specific units.
  const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
  const context = canvas.getContext('2d')!; context.fillStyle = '#123456'; context.fillRect(0, 0, 8, 8);
  for (const logo of [canvas.toDataURL('image/png'), canvas.toDataURL('image/jpeg'), canvas.toDataURL('image/webp'), 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7']) {
    const before = snapshots.length;
    await pdf('report-valid-raster-logo', () => exportNutritionReport('Synthetic profile', { start: '2026-01-01', end: '2026-01-02' }, [], brand(logo)));
    const documents = snapshots.slice(before);
    assert(documents.some(s => s.html.includes(logo)), 'supported raster logo lost');
    assert(documents.every(s => !s.text.includes('Logo omitted:')), 'supported raster logo warned incorrectly');
  }
  fixture.brand = { ...brand(canvas.toDataURL('image/png')), name: 'Synthetic kitchen', tagline: 'Safe branding', primaryColor: '#123456', secondaryColor: '#abcdef' };
  fixture.theme = { primaryColor: '#123456', backgroundColor: '#ffffff', textColor: '#000000', accentColor: '#abcdef', fontFamily: 'Georgia', borderRadius: 0 };
  fixture.recipe = { ...recipe(), name: 'Milk', ingredients: [{ name: 'Milk', amount: 2, unit: 'cup', fdcId: 101, sourceType: 'usda' }, { name: 'Egg', amount: 1, unit: 'whole', fdcId: 0, sourceType: 'manual' }] } as RecipeRecord;
  await pdf('cookbook-positive-brand-units', () => exportCookbook({ bookId: 'book', brandKitId: 'brand', templateId: 'theme', pageSize: 'letter', measurementSystem: 'grams', includeCover: true, includeToc: true, includeIndex: true, includePageNumbers: true }));
  const positive = [...snapshots].reverse().find(s => s.text.includes('488 g Milk'))!;
  assert(positive, 'positive recipe page not captured');
  assert(positive.text.includes('488 g Milk') && positive.text.includes('1 whole Egg') && positive.text.includes('original units'), 'food-specific units changed');
  assert(positive.html.includes('data:image/png;base64,') && positive.html.includes('font-family:Georgia'), 'valid raster/font lost');
  assert(!document.querySelector('iframe'), 'renderer iframe leaked');
  assert(rendered.length >= exported.length && rendered.every(canvas => canvas.ink), `blank or missing rendered canvas: ${JSON.stringify(rendered)}`);
  return { exports: exported, observedDocuments: snapshots.length, renderedCanvases: rendered.length, scriptMarkers: state.marker, activeMarkup: violations.length };
}

async function privateRead(path = '/api/private') {
  try { const response = await fetch(path, { cache: 'no-store' }); return response.ok ? await response.text() : `HTTP ${response.status}`; }
  catch { return 'OFFLINE'; }
}
async function seedUnrelated() {
  const cache = await caches.open('unrelated-fixture');
  await cache.put('/unrelated-marker', new Response('unrelated retained'));
  await navigator.serviceWorker.register('/other/sw.js', { scope: '/other/' });
}
async function assertUnrelated() {
  assert(await (await caches.open('unrelated-fixture')).match('/unrelated-marker'), 'unrelated cache removed');
  assert((await navigator.serviceWorker.getRegistrations()).some(r => r.scope.endsWith('/other/')), 'unrelated worker removed');
}
async function legacyInstall() {
  const r = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  assert(r.active, 'legacy worker not active');
  assert(await privateRead() === 'synthetic-A', 'legacy online fixture failed');
  await pause(200);
  assert(await (await caches.open('dietledger-v1')).match('/api/private'), 'legacy private cache not reproduced');
  // The historical activation deletes unrelated caches; seed this marker after
  // activation so the retirement test isolates the new cleanup's behavior.
  await seedUnrelated();
}
function previewExport() {
  const preview = document.getElementById('preview')!;
  preview.replaceChildren();
  const image = document.createElement('img'); image.src = positivePreviews[2]; image.style.width = '600px';
  preview.appendChild(image);
}
state.securityFixture = { exportsCheck, previewExport, legacyInstall, privateRead, seedUnrelated, assertUnrelated, retire: retireLegacyBrowserCache, delayedRead: () => privateRead('/api/delayed'), cacheNames: () => caches.keys() };

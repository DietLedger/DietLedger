import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { toCanvas } from 'html-to-image';
import type { CookbookExportOptions, BrandKit, TemplateTheme, FoodPortion } from '@/lib/types';
import { getApiClient } from '@/lib/api-client';
import { parseInstructions, recipeNutrition, recipeMissingNutrients } from '@/lib/recipe-types';
import { formatCookbookIngredient } from '@/lib/cookbook-unit-display';
import { toBaseUnit } from '@/lib/unit-conversion';

interface RecipeData {
  missingNutrients?: string[];
  description?: string;
  customNutrition?: import('./types').CustomRecipeNutrition | null;
  id: string;
  name: string;
  servings: number;
  servingName: string;
  instructionSteps: { id: string; text: string; groupId: string | null }[];
  instructionGroups: { id: string; title: string }[];
  ingredients: Array<{
    name: string;
    amount: number;
    unit: string;
    portions?: FoodPortion[];
  }>;
  nutrition: {
    calories: number;
    totalFat: number;
    saturatedFat: number;
    transFat: number;
    cholesterol: number;
    sodium: number;
    totalCarbs: number;
    dietaryFiber: number;
    totalSugars: number;
    addedSugars: number;
    protein: number;
    vitaminD: number;
    calcium: number;
    iron: number;
    potassium: number;
  };
}

const MM_PER_INCH = 25.4;
const PT_PER_MM = 2.8346;
const PX_PER_INCH = 96;
const RENDER_SCALE = 1;

function pageSizeToMm(size: 'a4' | 'letter'): { w: number; h: number } {
  if (size === 'a4') return { w: 210, h: 297 };
  return { w: 215.9, h: 279.4 };
}

function pageSizeToPx(size: 'a4' | 'letter'): number {
  const { w } = pageSizeToMm(size);
  return Math.round((w / MM_PER_INCH) * PX_PER_INCH);
}

function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ? value : fallback;
}

function safeFont(value?: string): string {
  const fonts = [
    'system-ui', 'Georgia', 'Palatino', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Courier New', 'monospace',
    'Arial, sans-serif', 'Georgia, serif', '"Times New Roman", serif', '"Courier New", monospace', 'Verdana, sans-serif',
  ];
  // Only exact editor/brand choices, encoded for the HTML style attribute.
  // inherit retains the export's existing system-ui default.
  return value && fonts.includes(value) ? escapeHtml(value) : 'system-ui';
}

function logoHtml(value: string | undefined, style: string): string {
  if (!value) return '';
  // Remote raster URLs can track private export activity; SVG is active-capable
  // content. Keep uploaded raster branding and make unsupported logos visible.
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/]+={0,2}$/i.test(value)
    ? `<img src="${value}" style="${style}">`
    : '<div role="note" style="font-size:10px;line-height:1.4;color:#333;background:#fff;padding:4px;margin-bottom:8px;max-width:400px">Logo omitted: PDF export supports uploaded PNG, JPEG, GIF or WebP images only. SVG and external image requests are blocked for safety and privacy.</div>';
}

function renderNutritionLabelHtml(recipe: RecipeData, theme?: TemplateTheme): string {
  const d = recipe.customNutrition ? recipeNutrition({ customNutrition: recipe.customNutrition }, 1 / (recipe.servings || 1)) : recipe.nutrition;
  const missing = new Set(recipe.customNutrition?.missingNutrients ?? recipe.missingNutrients ?? []);
  const keys = ['totalFat', 'saturatedFat', 'transFat', 'cholesterol', 'sodium', 'totalCarbs', 'dietaryFiber', 'totalSugars', 'protein', 'vitaminD', 'calcium', 'iron', 'potassium'];
  const bg = safeColor(theme?.backgroundColor, '#ffffff');
  const text = safeColor(theme?.textColor, '#000000');

  const dv = (val: number, ref: number) => ref > 0 ? Math.round((val / ref) * 100) : 0;

  const rows = [
    { name: 'Total Fat', val: d.totalFat, unit: 'g', dv: dv(d.totalFat, 78), bold: true },
    { name: 'Saturated Fat', val: d.saturatedFat, unit: 'g', dv: dv(d.saturatedFat, 20), indent: true },
    { name: 'Trans Fat', val: d.transFat, unit: 'g', noDv: true, indent: true },
    { name: 'Cholesterol', val: d.cholesterol, unit: 'mg', dv: dv(d.cholesterol, 300), bold: true },
    { name: 'Sodium', val: d.sodium, unit: 'mg', dv: dv(d.sodium, 2300), bold: true },
    { name: 'Total Carbohydrate', val: d.totalCarbs, unit: 'g', dv: dv(d.totalCarbs, 275), bold: true },
    { name: 'Dietary Fiber', val: d.dietaryFiber, unit: 'g', dv: dv(d.dietaryFiber, 28), indent: true },
    { name: 'Total Sugars', val: d.totalSugars, unit: 'g', noDv: true, indent: true },
    { name: 'Protein', val: d.protein, unit: 'g', dv: dv(d.protein, 50), bold: true },
    { name: 'Vitamin D', val: d.vitaminD, unit: 'mcg', dv: dv(d.vitaminD, 20) },
    { name: 'Calcium', val: d.calcium, unit: 'mg', dv: dv(d.calcium, 1300) },
    { name: 'Iron', val: d.iron, unit: 'mg', dv: dv(d.iron, 18) },
    { name: 'Potassium', val: d.potassium, unit: 'mg', dv: dv(d.potassium, 4700) },
  ];

  const rowHtml = rows.map((r, i) => {
    const sep = i === 4 || i === 8 ? 'border-top:4px solid ' + text : i > 0 ? 'border-top:1px solid ' + text : '';
    const fw = r.bold ? 'font-weight:700' : 'font-weight:400';
    const pd = r.indent ? 'padding-left:16px' : '';
    if (missing.has(keys[i])) return `<div style="padding:2px 0;${sep}">${r.name} Not reported</div>`;
    const dvCell = r.noDv ? '' : `<span style="float:right;font-weight:700;font-size:13px">${r.dv}%</span>`;
    return `<div style="overflow:hidden;padding:2px 0;${sep}"><span style="${fw};font-size:13px;${pd}">${r.name} ${Math.round(r.val * 100) / 100}${r.unit}</span>${dvCell}</div>`;
  }).join('');

  return `<div style="width:280px;border:3px solid ${text};padding:8px 8px 4px;font-family:Arial,Helvetica,sans-serif;color:${text};background:${bg};line-height:1.4;box-sizing:border-box">
<div style="font-weight:900;font-size:28px;line-height:1.1">Nutrition Facts</div>
<div style="height:4px;background:${text};margin:2px 0"></div>
<div style="font-size:13px"><span style="font-weight:700">Serving Size:</span> ${escapeHtml(recipe.servingName || '1 recipe')} (${escapeHtml(String(recipe.servings))} servings)</div>
<div style="height:4px;background:${text};margin:2px 0"></div>
<div style="font-weight:700;font-size:13px">Amount Per Serving</div>
<div style="display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 2px"><span style="font-weight:700;font-size:13px">Calories</span><span style="font-weight:900;font-size:24px">${missing.has('calories') ? 'Not reported' : escapeHtml(String(d.calories))}</span></div>
<div style="height:4px;background:${text};margin:2px 0"></div>
<div style="overflow:hidden;font-size:13px;margin-bottom:0"><span style="float:right;font-weight:700">% Daily Value*</span></div>
${rowHtml}
<div style="height:4px;background:${text};margin:2px 0"></div>
${recipe.customNutrition ? `<div style="font-size:10px;white-space:pre-wrap">Custom recipe nutrition — source: ${escapeHtml(recipe.customNutrition.source)}. Replaces ingredient nutrition.${missing.size ? `<br>Not reported: ${escapeHtml([...missing].join(', '))}. Unknown, not measured zeros.` : ''}${recipe.customNutrition.sourceLabel ? `<br>${escapeHtml(recipe.customNutrition.sourceLabel)}` : ''}</div>` : missing.size ? `<div style="font-size:10px">Not reported: ${escapeHtml([...missing].join(', '))}. Unknown, not measured zeros.</div>` : ''}
<div style="font-size:8px;line-height:1.4">* Percent Daily Values are based on a 2,000 calorie diet.</div>
</div>`;
}

function renderRecipePageHtml(
  recipe: RecipeData,
  theme?: TemplateTheme,
  brandKit?: BrandKit,
  pageNum?: number,
  totalPages?: number,
  measurementSystem?: CookbookExportOptions['measurementSystem'],
): string {
  const bg = safeColor(theme?.backgroundColor, '#ffffff');
  const text = safeColor(theme?.textColor, '#000000');
  const primary = safeColor(theme?.primaryColor, '#000000');
  const accent = safeColor(theme?.accentColor, '#666666');
  const fontFamily = safeFont(theme?.fontFamily);

  const formattedIngredients = recipe.ingredients.map((ingredient) => ({
    name: ingredient.name,
    quantity: measurementSystem
      ? formatCookbookIngredient(ingredient.amount, ingredient.unit, measurementSystem, ingredient.portions)
      : { text: `${ingredient.amount ? Math.round(ingredient.amount * 100) / 100 : ''} ${ingredient.unit}`, retainedOriginal: false },
  }));
  const ingredientList = formattedIngredients.map(({ name, quantity }) => `<li>${escapeHtml(quantity.text)} ${escapeHtml(name)}</li>`).join('');
  const hasUnconvertedGrams = measurementSystem === 'grams' && formattedIngredients.some(({ quantity }) => quantity.retainedOriginal);

  const steps = (recipe.instructionSteps ?? []).map(s => s.text).filter(s => s.trim());
  const stepList = steps.map((s, i) => `<li style="margin-bottom:8px"><span style="font-weight:700;color:${accent}">${i + 1}.</span> ${escapeHtml(s)}</li>`).join('');

  const brandHeader = brandKit ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;border-bottom:2px solid ${primary};padding-bottom:10px">
${logoHtml(brandKit.logoDataUrl, 'height:36px;object-fit:contain')}
<div><div style="font-weight:700;font-size:16px;color:${primary}">${escapeHtml(brandKit.name)}</div>${brandKit.tagline ? `<div style="font-size:11px;color:${accent}">${escapeHtml(brandKit.tagline)}</div>` : ''}</div>
</div>` : '';

  const pageFooter = pageNum !== undefined ? `<div style="position:absolute;bottom:30px;left:40px;right:40px;text-align:center;font-size:10px;color:${accent}">${pageNum}${totalPages ? ` / ${totalPages}` : ''}</div>` : '';

  return `<div style="width:100%;height:100%;background:${bg};color:${text};font-family:${fontFamily};padding:40px;box-sizing:border-box;position:relative">
${brandHeader}
<h1 style="font-size:28px;font-weight:700;color:${primary};margin:0 0 8px">${escapeHtml(recipe.name)}</h1>
<div style="font-size:13px;color:${accent};margin-bottom:20px">Serves ${escapeHtml(String(recipe.servings))}${recipe.servingName ? ` • ${escapeHtml(recipe.servingName)}` : ''}</div>
${recipe.description ? `<p style="font-size:13px;white-space:pre-wrap">${escapeHtml(recipe.description)}</p>` : ''}
<div style="display:flex;gap:24px">
<div style="flex:1">
<h2 style="font-size:16px;font-weight:600;color:${primary};margin:0 0 12px;border-bottom:1px solid ${accent};padding-bottom:4px">Ingredients</h2>
<ul style="list-style:none;padding:0;margin:0;font-size:13px;line-height:1.8">${ingredientList}</ul>
${hasUnconvertedGrams ? '<p style="font-size:10px;color:#666;margin-top:12px">Ingredients without a known food-specific gram weight retain their original units.</p>' : ''}
</div>
${steps.length > 0 ? `<div style="flex:1.5">
<h2 style="font-size:16px;font-weight:600;color:${primary};margin:0 0 12px;border-bottom:1px solid ${accent};padding-bottom:4px">Instructions</h2>
<ol style="list-style:none;padding:0;margin:0;font-size:13px;line-height:1.6">${stepList}</ol>
</div>` : ''}
</div>
${recipe.customNutrition || recipe.missingNutrients?.length ? `<div style="margin-top:16px">${renderNutritionLabelHtml(recipe, theme)}</div>` : ''}
${pageFooter}
</div>`;
}

function renderCoverHtml(
  title: string,
  description: string,
  color: string,
  brandKit?: BrandKit,
): string {
  const brandHeader = brandKit ? `<div style="margin-bottom:40px">${logoHtml(brandKit.logoDataUrl, 'height:48px;object-fit:contain;margin-bottom:12px')}<div style="font-weight:700;font-size:14px;color:${safeColor(brandKit.primaryColor, '#000')}">${escapeHtml(brandKit.name)}</div>${brandKit.tagline ? `<div style="font-size:12px;color:${safeColor(brandKit.secondaryColor, '#666')}">${escapeHtml(brandKit.tagline)}</div>` : ''}</div>` : '';

  return `<div style="width:100%;height:100%;background:${safeColor(color, '#666666')};display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;box-sizing:border-box">
${brandHeader}
<h1 style="font-size:42px;font-weight:900;color:#ffffff;text-align:center;margin:0 0 16px;text-shadow:0 2px 4px rgba(0,0,0,0.2)">${escapeHtml(title)}</h1>
<p style="font-size:16px;color:rgba(255,255,255,0.85);text-align:center;margin:0;max-width:400px">${escapeHtml(description)}</p>
</div>`;
}

function renderTocHtml(
  chapters: Array<{ title: string; recipes: string[] }>,
  brandKit?: BrandKit,
): string {
  const brandHeader = brandKit ? `<div style="margin-bottom:24px;border-bottom:2px solid ${safeColor(brandKit.primaryColor, '#000')};padding-bottom:8px">${logoHtml(brandKit.logoDataUrl, 'height:28px;object-fit:contain;margin-bottom:8px')}<span style="font-weight:700;font-size:14px;color:${safeColor(brandKit.primaryColor, '#000')}">${escapeHtml(brandKit.name)}</span></div>` : '';

  const entries = chapters.map(ch => {
    const recipes = ch.recipes.map(r => `<div style="padding:4px 0 4px 20px;font-size:13px">${escapeHtml(r)}</div>`).join('');
    return `<div style="margin-bottom:16px"><div style="font-weight:700;font-size:15px">${escapeHtml(ch.title)}</div>${recipes}</div>`;
  }).join('');

  return `<div style="width:100%;height:100%;background:#ffffff;color:#000;padding:60px;box-sizing:border-box">
${brandHeader}
<h1 style="font-size:32px;font-weight:700;margin:0 0 32px">Table of Contents</h1>
${entries}
</div>`;
}

async function htmlToCanvas(html: string, widthPx: number): Promise<HTMLCanvasElement> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.position = 'fixed';
  iframe.style.left = '0';
  iframe.style.top = '0';
  iframe.style.width = `${widthPx}px`;
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument!;
  iframeDoc.open();
  iframeDoc.write(`<!DOCTYPE html><html><head><style>body{margin:0;padding:0}</style></head><body>${html}</body></html>`);
  iframeDoc.close();

  const container = iframeDoc.body.firstElementChild as HTMLElement;
  try {
    const canvas = await html2canvas(container, {
      width: widthPx,
      scale: RENDER_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    return canvas;
  } finally {
    document.body.removeChild(iframe);
  }
}

async function elementToCanvas(element: HTMLElement, widthPx?: number): Promise<HTMLCanvasElement> {
  const options: Record<string, unknown> = {
    pixelRatio: RENDER_SCALE,
    backgroundColor: '#ffffff',
  };
  if (widthPx) {
    options.width = widthPx;
  }
  return toCanvas(element, options) as Promise<HTMLCanvasElement>;
}

function addCanvasToPage(canvas: HTMLCanvasElement, doc: jsPDF, pageW: number, pageH: number, marginMm: number = 10) {
  const availW = pageW - marginMm * 2;
  const availH = pageH - marginMm * 2;
  const imgW = availW;
  const imgH = (canvas.height / canvas.width) * imgW;
  if (imgH <= availH) {
    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', marginMm, marginMm, imgW, imgH);
  } else {
    const scale = availH / imgH;
    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', marginMm, marginMm, imgW * scale, availH);
  }
}

function canvasToPages(canvas: HTMLCanvasElement, doc: jsPDF, pageW: number, pageH: number, marginMm: number = 0) {
  const availW = pageW - marginMm * 2;
  const availH = pageH - marginMm * 2;
  const naturalH = (canvas.height / canvas.width) * availW;
  if (naturalH <= 0) return;

  if (naturalH <= availH) {
    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', marginMm, marginMm, availW, naturalH);
    return;
  }

  const scale = availH / naturalH;
  doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', marginMm, marginMm, availW * scale, availH);
}

export interface NutritionExportOptions {
  profileName?: string;
  periodLabel: string;
  dateRange?: string;
  dietaryTags?: string[];
  allergens?: string[];
}

export async function exportNutritionDashboard(
  element: HTMLElement,
  options: NutritionExportOptions,
): Promise<Blob> {
  const { w: pageW, h: pageH } = pageSizeToMm('letter');
  const pxWidth = pageSizeToPx('letter');
  const marginPx = 20;

  const wrapper = document.createElement('div');
  wrapper.style.width = `${pxWidth}px`;
  wrapper.style.background = '#ffffff';
  wrapper.style.padding = `${marginPx}px`;
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.fontFamily = 'system-ui,-apple-system,sans-serif';

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e0e0e0';
  const addLine = (text: string, style: string) => {
    const line = document.createElement('div');
    line.style.cssText = style;
    line.textContent = text;
    header.appendChild(line);
  };
  addLine(`Nutrition Information${options.profileName ? ` — User: ${options.profileName}` : ''}`, 'font-size:20px;font-weight:700;color:#000;margin-bottom:2px');
  if (options.dietaryTags?.length) addLine(`Diets: ${options.dietaryTags.join(', ')}`, 'font-size:11px;color:#666;margin-top:4px');
  if (options.allergens?.length) addLine(`Allergens: ${options.allergens.join(', ')}`, 'font-size:11px;color:#666;margin-top:2px');
  addLine(`Nutrition for ${options.periodLabel}${options.dateRange ? ` — ${options.dateRange}` : ''}`, 'font-size:10px;color:#aaa;margin-top:2px');
  wrapper.appendChild(header);
  wrapper.appendChild(element.cloneNode(true));

  const outer = document.createElement('div');
  outer.style.position = 'fixed';
  outer.style.left = '0';
  outer.style.top = '0';
  outer.style.zIndex = '-9999';
  outer.style.opacity = '0';
  outer.appendChild(wrapper);
  document.body.appendChild(outer);

  try {
    const canvas = await elementToCanvas(wrapper, pxWidth);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    canvasToPages(canvas, doc, pageW, pageH);
    return doc.output('blob');
  } finally {
    document.body.removeChild(outer);
  }
}

async function collectRecipes(bookId: string, measurementSystem: CookbookExportOptions['measurementSystem']): Promise<{ recipes: RecipeData[]; chapterMap: Map<string, string[]> }> {
  const api = getApiClient();
  const book = await api.getBook(bookId);
  if (!book) throw new Error('Book not found');

  const chapters = await api.getChaptersByBook(bookId);
  const chapterMap = new Map<string, string[]>();

  const allRecipes: RecipeData[] = [];
  const portionIngredients = new Map<number, RecipeData['ingredients']>();

  for (const chapter of chapters.sort((a, b) => a.position - b.position)) {
    const chapterRecipes = await api.getChapterRecipes(chapter.id);
    const recipeNames: string[] = [];

    for (const cr of chapterRecipes.sort((a, b) => a.position - b.position)) {
      const recipe = await api.getRecipe(cr.recipeId);
      if (!recipe) continue;

      recipeNames.push(recipe.name);

      const ingredients = recipe.ingredients || [];
      const nutrition = recipeNutrition(recipe, 1 / (recipe.servings || 1));

      const printableIngredients = ingredients.map((i) => {
        const printable = { name: i.name, amount: i.amount, unit: i.unit, portions: undefined as FoodPortion[] | undefined };
        if (measurementSystem === 'grams' && i.sourceType === 'usda' && i.fdcId > 0 && toBaseUnit(i.amount, i.unit)?.type !== 'weight') {
          const matching = portionIngredients.get(i.fdcId) ?? [];
          matching.push(printable);
          portionIngredients.set(i.fdcId, matching);
        }
        return printable;
      });
      allRecipes.push({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        customNutrition: recipe.customNutrition,
        missingNutrients: recipeMissingNutrients(recipe),
        servings: recipe.servings,
        servingName: recipe.servingName,
        instructionSteps: parseInstructions(recipe.instructions ?? null).steps,
        instructionGroups: parseInstructions(recipe.instructions ?? null).groups,
        ingredients: printableIngredients,
        nutrition,
      });
    }

    chapterMap.set(chapter.title, recipeNames);
  }

  // Fetch unique food portions across the whole book rather than waiting for
  // each recipe in turn. Small batches bound concurrent API requests.
  const fdcIds = [...portionIngredients.keys()];
  for (let start = 0; start < fdcIds.length; start += 6) {
    await Promise.all(fdcIds.slice(start, start + 6).map(async (fdcId) => {
      const food = await api.getFoodByFdcId(fdcId);
      for (const ingredient of portionIngredients.get(fdcId)!) {
        ingredient.portions = food?.portions ?? [];
      }
    }));
  }

  return { recipes: allRecipes, chapterMap };
}

export async function exportCookbook(options: CookbookExportOptions): Promise<Blob> {
  const { bookId, pageSize = 'letter', includeCover, includeToc, includeIndex, includePageNumbers, onProgress, measurementSystem } = options;

  const api = getApiClient();
  const book = await api.getBook(bookId);
  if (!book) throw new Error('Book not found');

  const brandKit = options.brandKitId ? (await api.getBrandKit(options.brandKitId) ?? undefined) : undefined;

  const template = options.templateId ? await api.getTemplate(options.templateId) : undefined;
  const theme = template?.layout?.theme;

  const { recipes, chapterMap } = await collectRecipes(bookId, measurementSystem);

  const { w: pageW, h: pageH } = pageSizeToMm(pageSize);
  const pxWidth = pageSizeToPx(pageSize);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: pageSize === 'a4' ? 'a4' : 'letter',
  });

  let pageNum = 0;
  const totalPages = (includeCover ? 1 : 0) + (includeToc ? 1 : 0) + recipes.length + (includeIndex ? 1 : 0);

  const progress = (p: number) => onProgress?.(p);

  if (includeCover) {
    pageNum++;
    progress(Math.round(((pageNum) / totalPages) * 100));
    const canvas = await htmlToCanvas(
      renderCoverHtml(book.title, book.description, book.coverColor, brandKit),
      pxWidth,
    );
    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, pageH);
  }

  if (includeToc) {
    if (pageNum > 0) doc.addPage();
    pageNum++;
    progress(Math.round(((pageNum) / totalPages) * 100));
    const chapters = Array.from(chapterMap.entries()).map(([title, recipes]) => ({ title, recipes }));
    const canvas = await htmlToCanvas(renderTocHtml(chapters, brandKit), pxWidth);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, pageH);
  }

  for (let i = 0; i < recipes.length; i++) {
    if (pageNum > 0) doc.addPage();
    pageNum++;
    progress(Math.round(((pageNum) / totalPages) * 100));

    const recipe = recipes[i];
    const canvas = await htmlToCanvas(
      renderRecipePageHtml(recipe, theme, brandKit, includePageNumbers ? pageNum : undefined, includePageNumbers ? totalPages : undefined, measurementSystem),
      pxWidth,
    );
    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, pageH);
  }

  if (includeIndex) {
    if (pageNum > 0) doc.addPage();
    pageNum++;
    progress(Math.round(((pageNum) / totalPages) * 100));

    const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name));
    const indexHtml = `<div style="width:100%;height:100%;background:${safeColor(theme?.backgroundColor, '#fff')};color:${safeColor(theme?.textColor, '#000')};padding:40px;box-sizing:border-box;font-family:${safeFont(theme?.fontFamily)}">
${logoHtml(brandKit?.logoDataUrl, 'height:28px;object-fit:contain;margin-bottom:12px')}
<h1 style="font-size:28px;font-weight:700;color:${safeColor(theme?.primaryColor, '#000')};margin:0 0 20px">Index</h1>
${sorted.map(r => `<div style="font-size:13px;padding:2px 0">${escapeHtml(r.name)}</div>`).join('')}
</div>`;
    const canvas = await htmlToCanvas(indexHtml, pxWidth);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, pageH);
  }

  progress(100);
  return doc.output('blob');
}

export async function exportRecipeCard(
  recipe: RecipeData,
  theme?: TemplateTheme,
  brandKit?: BrandKit,
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [152.4, 101.6],
  });

  const canvas = await htmlToCanvas(
    renderRecipePageHtml(recipe, theme, brandKit),
    600,
  );

  const pageW = 152.4;
  const pageH = 101.6;
  doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, pageH);

  return doc.output('blob');
}

export async function exportNutritionReport(
  profileName: string,
  dateRange: { start: string; end: string },
  elements: HTMLElement[],
  brandKit?: BrandKit,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { w: pageW, h: pageH } = pageSizeToMm('a4');

  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);

  const coverHtml = `<div style="width:100%;height:100%;background:#ffffff;padding:60px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center">
${logoHtml(brandKit?.logoDataUrl, 'height:40px;object-fit:contain;margin-bottom:16px')}
${brandKit ? `<div style="font-weight:700;font-size:14px;color:${safeColor(brandKit.primaryColor, '#000')};margin-bottom:24px">${escapeHtml(brandKit.name)}</div>` : ''}
<h1 style="font-size:32px;font-weight:700;color:${safeColor(brandKit?.primaryColor, '#000')};margin:0 0 8px">Nutrition Report</h1>
<h2 style="font-size:18px;font-weight:400;color:#666;margin:0 0 24px">${escapeHtml(profileName)}</h2>
<div style="font-size:14px;color:#666">Report Period</div>
<div style="font-size:16px;font-weight:600;color:#000">${startDate.toLocaleDateString()} — ${endDate.toLocaleDateString()}</div>
</div>`;

  const coverCanvas = await htmlToCanvas(coverHtml, 794);
  doc.addImage(coverCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, pageH);

  for (let i = 0; i < elements.length; i++) {
    doc.addPage();
    const canvas = await elementToCanvas(elements[i]);
    addCanvasToPage(canvas, doc, pageW, pageH, 10);
  }

  return doc.output('blob');
}

export async function exportElementAsPdf(
  element: HTMLElement,
  options?: { pageSize?: 'a4' | 'letter'; orientation?: 'portrait' | 'landscape' },
): Promise<Blob> {
  const size = options?.pageSize ?? 'letter';
  const { w: pageW, h: pageH } = pageSizeToMm(size);
  const isLandscape = options?.orientation === 'landscape';

  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: size === 'a4' ? 'a4' : 'letter',
  });

  const canvas = await elementToCanvas(element);
  addCanvasToPage(canvas, doc, isLandscape ? pageH : pageW, isLandscape ? pageW : pageH, 10);

  return doc.output('blob');
}

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning',
  midMorning: 'Mid-Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};
const SLOT_ORDER = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night'];

export interface NutritionSummary {
  calories: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  totalCarbs: number;
  dietaryFiber: number;
  totalSugars: number;
  addedSugars: number;
  protein: number;
  vitaminD: number;
  calcium: number;
  iron: number;
  potassium: number;
}

export interface MealPlanDayData {
  date: string;
  dayLabel: string;
  slots: Array<{
    slot: string;
    label: string;
    entries: Array<{
      name: string;
      servings: number;
      isLeftover: boolean;
    }>;
  }>;
  nutrition?: NutritionSummary | null;
}

function renderNutritionFactsHtml(n: NutritionSummary, servingLabel?: string): string {
  const dv = (val: number, ref: number) => ref > 0 ? Math.round((val / ref) * 100) : 0;
  const rows = [
    { name: 'Total Fat', val: n.totalFat, unit: 'g', dv: dv(n.totalFat, 78), bold: true },
    { name: 'Saturated Fat', val: n.saturatedFat, unit: 'g', dv: dv(n.saturatedFat, 20), indent: true },
    { name: 'Trans Fat', val: n.transFat, unit: 'g', noDv: true, indent: true },
    { name: 'Cholesterol', val: n.cholesterol, unit: 'mg', dv: dv(n.cholesterol, 300), bold: true },
    { name: 'Sodium', val: n.sodium, unit: 'mg', dv: dv(n.sodium, 2300), bold: true },
    { name: 'Total Carbohydrate', val: n.totalCarbs, unit: 'g', dv: dv(n.totalCarbs, 275), bold: true },
    { name: 'Dietary Fiber', val: n.dietaryFiber, unit: 'g', dv: dv(n.dietaryFiber, 28), indent: true },
    { name: 'Total Sugars', val: n.totalSugars, unit: 'g', noDv: true, indent: true },
    { name: 'Protein', val: n.protein, unit: 'g', dv: dv(n.protein, 50), bold: true },
    { name: 'Vitamin D', val: n.vitaminD, unit: 'mcg', dv: dv(n.vitaminD, 20) },
    { name: 'Calcium', val: n.calcium, unit: 'mg', dv: dv(n.calcium, 1300) },
    { name: 'Iron', val: n.iron, unit: 'mg', dv: dv(n.iron, 18) },
    { name: 'Potassium', val: n.potassium, unit: 'mg', dv: dv(n.potassium, 4700) },
  ];
  const rowHtml = rows.map((r, i) => {
    const sep = i === 4 || i === 8 ? 'border-top:4px solid #000' : i > 0 ? 'border-top:1px solid #000' : '';
    const fw = r.bold ? 'font-weight:700' : 'font-weight:400';
    const pd = r.indent ? 'padding-left:16px' : '';
    const dvCell = r.noDv ? '<span></span>' : `<span style="font-weight:700;font-size:13px;white-space:nowrap">${r.dv}%</span>`;
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;${sep}"><span style="${fw};font-size:13px;${pd}">${r.name} ${Math.round(r.val * 100) / 100}${r.unit}</span>${dvCell}</div>`;
  }).join('');

  return `<div style="width:280px;border:3px solid #000;padding:10px 8px 8px;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;line-height:1.4;box-sizing:border-box">
<div style="font-weight:900;font-size:28px;line-height:1.1;margin-bottom:6px">Nutrition Facts</div>
<div style="height:4px;background:#000;margin:5px 0"></div>
<div style="font-size:13px;margin:5px 0">${escapeHtml(servingLabel ?? 'Daily Total')}</div>
<div style="height:4px;background:#000;margin:5px 0"></div>
<div style="display:flex;justify-content:space-between;align-items:baseline;margin:5px 0"><span style="font-weight:700;font-size:13px">Calories</span><span style="font-weight:900;font-size:24px">${Math.round(n.calories)}</span></div>
<div style="height:4px;background:#000;margin:5px 0"></div>
<div style="display:flex;justify-content:flex-end;font-size:13px;margin:5px 0;padding:5px 0"><span style="font-weight:700">% Daily Value*</span></div>
${rowHtml}
<div style="height:4px;background:#000;margin:5px 0"></div>
<div style="font-size:8px;line-height:1.4;margin-top:5px">* Percent Daily Values are based on a 2,000 calorie diet.</div>
</div>`;
}

function renderMealPlanDayHtml(day: MealPlanDayData): string {
  const slotRows = day.slots
    .filter(s => s.entries.length > 0)
    .map(s => {
      const entryHtml = s.entries.map(e => {
        const leftover = e.isLeftover ? ' <span style="font-size:10px;color:#888">(leftover)</span>' : '';
        const servings = e.servings !== 1 ? ` <span style="font-size:10px;color:#888">(${escapeHtml(String(e.servings))} sv)</span>` : '';
        return `<div style="padding:2px 0 2px 10px;font-size:12px;line-height:1.4">${escapeHtml(e.name)}${servings}${leftover}</div>`;
      }).join('');
      return `<div style="margin-top:6px"><div style="font-size:11px;font-weight:600;color:#555">${escapeHtml(s.label)}</div>${entryHtml}</div>`;
    }).join('');

  const noMeals = day.slots.every(s => s.entries.length === 0)
    ? '<div style="font-size:12px;color:#aaa;padding:4px 0">No meals planned</div>'
    : '';

  const nutritionHtml = day.nutrition
    ? `<div style="flex:0 0 260px">${renderNutritionFactsHtml(day.nutrition, day.dayLabel)}</div>`
    : '';

  return `<div style="width:100%;background:#ffffff;color:#000;padding:30px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif">
    <div style="font-size:16px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #333">${escapeHtml(day.dayLabel)}</div>
    <div style="display:flex;gap:24px;align-items:flex-start">
      <div style="flex:1;min-width:0">${slotRows}${noMeals}</div>
      ${nutritionHtml}
    </div>
  </div>`;
}

export async function exportMealPlanPdf(
  dateRange: string,
  days: MealPlanDayData[],
): Promise<Blob> {
  const { w: pageW, h: pageH } = pageSizeToMm('letter');
  const pxWidth = pageSizeToPx('letter');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const coverHtml = `<div style="width:100%;height:100vh;background:#ffffff;color:#000;display:flex;flex-direction:column;justify-content:center;padding:60px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif">
    <div style="font-size:36px;font-weight:700;margin-bottom:12px">Weekly Meal Plan</div>
    <div style="font-size:18px;color:#555;margin-bottom:24px">${escapeHtml(dateRange)}</div>
    <div style="width:80px;height:4px;background:#333;border-radius:2px"></div>
  </div>`;
  const coverCanvas = await htmlToCanvas(coverHtml, pxWidth);
  doc.addImage(coverCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, pageH);

  for (let i = 0; i < days.length; i++) {
    doc.addPage();
    const dayHtml = renderMealPlanDayHtml(days[i]);
    const canvas = await htmlToCanvas(dayHtml, pxWidth);
    addCanvasToPage(canvas, doc, pageW, pageH);
  }

  return doc.output('blob');
}

export interface GroceryItemData {
  name: string;
  displayAmount: string;
  recipeNames?: string[];
}

function renderGroceryListHtml(
  dateRange: string,
  items: GroceryItemData[],
): string {
  const rows = items.map(item => {
    const recipes = item.recipeNames?.length
      ? `<span style="font-size:11px;color:#888;margin-left:8px">${escapeHtml(item.recipeNames.join(', '))}</span>`
      : '';
    return `<div style="display:flex;align-items:baseline;padding:5px 0;border-bottom:1px solid #f0f0f0">
      <div style="width:18px;flex-shrink:0;text-align:center;font-size:14px;color:#ccc">&#9744;</div>
      <div style="flex:1;font-size:13px">${escapeHtml(item.name)}${recipes}</div>
      <div style="font-size:12px;color:#555;white-space:nowrap;margin-left:8px">${escapeHtml(item.displayAmount)}</div>
    </div>`;
  }).join('');

  const empty = items.length === 0
    ? '<div style="font-size:13px;color:#aaa;padding:16px 0;text-align:center">No ingredients this week</div>'
    : '';

  return `<div style="width:100%;background:#ffffff;color:#000;padding:40px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif">
    <h1 style="font-size:24px;font-weight:700;margin:0 0 4px">Grocery List</h1>
    <div style="font-size:13px;color:#666;margin-bottom:20px">${escapeHtml(dateRange)}</div>
    ${rows}${empty}
  </div>`;
}

export async function exportGroceryListPdf(
  dateRange: string,
  items: GroceryItemData[],
): Promise<Blob> {
  const { w: pageW, h: pageH } = pageSizeToMm('letter');
  const pxWidth = pageSizeToPx('letter');

  const html = renderGroceryListHtml(dateRange, items);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const canvas = await htmlToCanvas(html, pxWidth);
  canvasToPages(canvas, doc, pageW, pageH);

  return doc.output('blob');
}

export type { RecipeData };

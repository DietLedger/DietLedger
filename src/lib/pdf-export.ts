import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { CookbookExportOptions, BrandKit, TemplateTheme } from '@/lib/types';
import { getRecipe, getBook, getChaptersByBook, getChapterRecipes, getBrandKit, getTemplate } from '@/lib/storage';

interface RecipeData {
  id: string;
  name: string;
  servings: number;
  servingName: string;
  instructions: string | null;
  ingredients: Array<{
    name: string;
    amount: number;
    unit: string;
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

function pageSizeToMm(size: 'a4' | 'letter'): { w: number; h: number } {
  if (size === 'a4') return { w: 210, h: 297 };
  return { w: 215.9, h: 279.4 };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

function renderNutritionLabelHtml(recipe: RecipeData, theme?: TemplateTheme): string {
  const d = recipe.nutrition;
  const bg = theme?.backgroundColor ?? '#ffffff';
  const text = theme?.textColor ?? '#000000';
  const primary = theme?.primaryColor ?? '#000000';

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
    const dvCell = r.noDv ? '' : `<span style="float:right;font-weight:700;font-size:13px">${r.dv}%</span>`;
    return `<div style="overflow:hidden;padding:2px 0;${sep}"><span style="${fw};font-size:13px;${pd}">${r.name} ${Math.round(r.val * 100) / 100}${r.unit}</span>${dvCell}</div>`;
  }).join('');

  return `<div style="width:280px;border:3px solid ${text};padding:8px 8px 4px;font-family:Arial,Helvetica,sans-serif;color:${text};background:${bg};line-height:1.4;box-sizing:border-box">
<div style="font-weight:900;font-size:28px;line-height:1.1">Nutrition Facts</div>
<div style="height:4px;background:${text};margin:2px 0"></div>
<div style="font-size:13px"><span style="font-weight:700">Serving Size:</span> ${recipe.servingName || '1 recipe'} (${recipe.servings} servings)</div>
<div style="height:4px;background:${text};margin:2px 0"></div>
<div style="font-weight:700;font-size:13px">Amount Per Serving</div>
<div style="display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 2px"><span style="font-weight:700;font-size:13px">Calories</span><span style="font-weight:900;font-size:24px">${d.calories}</span></div>
<div style="height:4px;background:${text};margin:2px 0"></div>
<div style="overflow:hidden;font-size:13px;margin-bottom:0"><span style="float:right;font-weight:700">% Daily Value*</span></div>
${rowHtml}
<div style="height:4px;background:${text};margin:2px 0"></div>
<div style="font-size:8px;line-height:1.4">* Percent Daily Values are based on a 2,000 calorie diet.</div>
</div>`;
}

function renderRecipePageHtml(
  recipe: RecipeData,
  theme?: TemplateTheme,
  brandKit?: BrandKit,
  pageNum?: number,
  totalPages?: number,
): string {
  const bg = theme?.backgroundColor ?? '#ffffff';
  const text = theme?.textColor ?? '#000000';
  const primary = theme?.primaryColor ?? '#000000';
  const accent = theme?.accentColor ?? '#666666';
  const fontFamily = theme?.fontFamily === 'inherit' || !theme?.fontFamily ? 'system-ui' : theme.fontFamily;

  const ingredientList = recipe.ingredients.map(i => `<li>${i.amount ? Math.round(i.amount * 100) / 100 : ''} ${i.unit} ${i.name}</li>`).join('');

  const steps = (recipe.instructions ?? '').split('\n').filter(s => s.trim());
  const stepList = steps.map((s, i) => `<li style="margin-bottom:8px"><span style="font-weight:700;color:${accent}">${i + 1}.</span> ${s}</li>`).join('');

  const brandHeader = brandKit ? `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;border-bottom:2px solid ${primary};padding-bottom:10px">
${brandKit.logoDataUrl ? `<img src="${brandKit.logoDataUrl}" style="height:36px;object-fit:contain">` : ''}
<div><div style="font-weight:700;font-size:16px;color:${primary}">${brandKit.name}</div>${brandKit.tagline ? `<div style="font-size:11px;color:${accent}">${brandKit.tagline}</div>` : ''}</div>
</div>` : '';

  const pageFooter = pageNum !== undefined ? `<div style="position:absolute;bottom:30px;left:40px;right:40px;text-align:center;font-size:10px;color:${accent}">${pageNum}${totalPages ? ` / ${totalPages}` : ''}</div>` : '';

  return `<div style="width:100%;height:100%;background:${bg};color:${text};font-family:${fontFamily};padding:40px;box-sizing:border-box;position:relative">
${brandHeader}
<h1 style="font-size:28px;font-weight:700;color:${primary};margin:0 0 8px">${recipe.name}</h1>
<div style="font-size:13px;color:${accent};margin-bottom:20px">Serves ${recipe.servings}${recipe.servingName ? ` • ${recipe.servingName}` : ''}</div>
<div style="display:flex;gap:24px">
<div style="flex:1">
<h2 style="font-size:16px;font-weight:600;color:${primary};margin:0 0 12px;border-bottom:1px solid ${accent};padding-bottom:4px">Ingredients</h2>
<ul style="list-style:none;padding:0;margin:0;font-size:13px;line-height:1.8">${ingredientList}</ul>
</div>
${steps.length > 0 ? `<div style="flex:1.5">
<h2 style="font-size:16px;font-weight:600;color:${primary};margin:0 0 12px;border-bottom:1px solid ${accent};padding-bottom:4px">Instructions</h2>
<ol style="list-style:none;padding:0;margin:0;font-size:13px;line-height:1.6">${stepList}</ol>
</div>` : ''}
</div>
${pageFooter}
</div>`;
}

function renderCoverHtml(
  title: string,
  description: string,
  color: string,
  brandKit?: BrandKit,
): string {
  const brandHeader = brandKit ? `<div style="margin-bottom:40px">${brandKit.logoDataUrl ? `<img src="${brandKit.logoDataUrl}" style="height:48px;object-fit:contain;margin-bottom:12px">` : ''}<div style="font-weight:700;font-size:14px;color:${brandKit.primaryColor}">${brandKit.name}</div>${brandKit.tagline ? `<div style="font-size:12px;color:${brandKit.secondaryColor}">${brandKit.tagline}</div>` : ''}</div>` : '';

  return `<div style="width:100%;height:100%;background:${color};display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;box-sizing:border-box">
${brandHeader}
<h1 style="font-size:42px;font-weight:900;color:#ffffff;text-align:center;margin:0 0 16px;text-shadow:0 2px 4px rgba(0,0,0,0.2)">${title}</h1>
<p style="font-size:16px;color:rgba(255,255,255,0.85);text-align:center;margin:0;max-width:400px">${description}</p>
</div>`;
}

function renderTocHtml(
  chapters: Array<{ title: string; recipes: string[] }>,
  brandKit?: BrandKit,
): string {
  const brandHeader = brandKit ? `<div style="margin-bottom:24px;border-bottom:2px solid ${brandKit.primaryColor};padding-bottom:8px">${brandKit.logoDataUrl ? `<img src="${brandKit.logoDataUrl}" style="height:28px;object-fit:contain;margin-bottom:8px">` : ''}<span style="font-weight:700;font-size:14px;color:${brandKit.primaryColor}">${brandKit.name}</span></div>` : '';

  const entries = chapters.map(ch => {
    const recipes = ch.recipes.map(r => `<div style="padding:4px 0 4px 20px;font-size:13px">${r}</div>`).join('');
    return `<div style="margin-bottom:16px"><div style="font-weight:700;font-size:15px">${ch.title}</div>${recipes}</div>`;
  }).join('');

  return `<div style="width:100%;height:100%;background:#ffffff;color:#000;padding:60px;box-sizing:border-box">
${brandHeader}
<h1 style="font-size:32px;font-weight:700;margin:0 0 32px">Table of Contents</h1>
${entries}
</div>`;
}

async function htmlToCanvas(html: string, widthPx: number): Promise<HTMLCanvasElement> {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = `${widthPx}px`;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      width: widthPx,
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: null,
    });
    return canvas;
  } finally {
    document.body.removeChild(container);
  }
}

async function captureElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: null,
  });
}

async function collectRecipes(bookId: string): Promise<{ recipes: RecipeData[]; chapterMap: Map<string, string[]> }> {
  const book = await getBook(bookId);
  if (!book) throw new Error('Book not found');

  const chapters = await getChaptersByBook(bookId);
  const chapterMap = new Map<string, string[]>();

  const allRecipes: RecipeData[] = [];

  for (const chapter of chapters.sort((a, b) => a.position - b.position)) {
    const chapterRecipes = await getChapterRecipes(chapter.id);
    const recipeNames: string[] = [];

    for (const cr of chapterRecipes.sort((a, b) => a.position - b.position)) {
      const recipe = await getRecipe(cr.recipeId);
      if (!recipe) continue;

      recipeNames.push(recipe.name);

      const nutrition = recipe.ingredients.reduce(
        (acc, ing) => ({
          calories: acc.calories + ing.calories,
          totalFat: acc.totalFat + ing.totalFat,
          saturatedFat: acc.saturatedFat + ing.saturatedFat,
          transFat: acc.transFat + ing.transFat,
          cholesterol: acc.cholesterol + ing.cholesterol,
          sodium: acc.sodium + ing.sodium,
          totalCarbs: acc.totalCarbs + ing.totalCarbs,
          dietaryFiber: acc.dietaryFiber + ing.dietaryFiber,
          totalSugars: acc.totalSugars + ing.totalSugars,
          addedSugars: acc.addedSugars + ing.addedSugars,
          protein: acc.protein + ing.protein,
          vitaminD: acc.vitaminD + ing.vitaminD,
          calcium: acc.calcium + ing.calcium,
          iron: acc.iron + ing.iron,
          potassium: acc.potassium + ing.potassium,
        }),
        { calories: 0, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 0, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0, calcium: 0, iron: 0, potassium: 0 },
      );

      allRecipes.push({
        id: recipe.id,
        name: recipe.name,
        servings: recipe.servings,
        servingName: recipe.servingName,
        instructions: recipe.instructions,
        ingredients: recipe.ingredients.map(i => ({ name: i.name, amount: i.amount, unit: i.unit })),
        nutrition,
      });
    }

    chapterMap.set(chapter.title, recipeNames);
  }

  return { recipes: allRecipes, chapterMap };
}

export async function exportCookbook(options: CookbookExportOptions): Promise<Blob> {
  const { bookId, pageSize = 'letter', includeCover, includeToc, includeIndex, includePageNumbers, onProgress } = options;

  const book = await getBook(bookId);
  if (!book) throw new Error('Book not found');

  const brandKit = options.brandKitId ? await getBrandKit(options.brandKitId) : undefined;

  const template = options.templateId ? await getTemplate(options.templateId) : undefined;
  const theme = template?.layout?.theme;

  const { recipes, chapterMap } = await collectRecipes(bookId);

  const { w: pageW, h: pageH } = pageSizeToMm(pageSize);
  const pxWidth = Math.round((pageW / MM_PER_INCH) * 150);

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
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);
  }

  if (includeToc) {
    if (pageNum > 0) doc.addPage();
    pageNum++;
    progress(Math.round(((pageNum) / totalPages) * 100));
    const chapters = Array.from(chapterMap.entries()).map(([title, recipes]) => ({ title, recipes }));
    const canvas = await htmlToCanvas(renderTocHtml(chapters, brandKit), pxWidth);
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);
  }

  for (let i = 0; i < recipes.length; i++) {
    if (pageNum > 0) doc.addPage();
    pageNum++;
    progress(Math.round(((pageNum) / totalPages) * 100));

    const recipe = recipes[i];
    const canvas = await htmlToCanvas(
      renderRecipePageHtml(recipe, theme, brandKit, includePageNumbers ? pageNum : undefined, includePageNumbers ? totalPages : undefined),
      pxWidth,
    );
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);
  }

  if (includeIndex) {
    if (pageNum > 0) doc.addPage();
    pageNum++;
    progress(Math.round(((pageNum) / totalPages) * 100));

    const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name));
    const indexHtml = `<div style="width:100%;height:100%;background:${theme?.backgroundColor ?? '#fff'};color:${theme?.textColor ?? '#000'};padding:40px;box-sizing:border-box;font-family:${theme?.fontFamily === 'inherit' || !theme?.fontFamily ? 'system-ui' : theme.fontFamily}">
${brandKit?.logoDataUrl ? `<img src="${brandKit.logoDataUrl}" style="height:28px;object-fit:contain;margin-bottom:12px">` : ''}
<h1 style="font-size:28px;font-weight:700;color:${theme?.primaryColor ?? '#000'};margin:0 0 20px">Index</h1>
${sorted.map(r => `<div style="font-size:13px;padding:2px 0">${r.name}</div>`).join('')}
</div>`;
    const canvas = await htmlToCanvas(indexHtml, pxWidth);
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);
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
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);

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
${brandKit?.logoDataUrl ? `<img src="${brandKit.logoDataUrl}" style="height:40px;object-fit:contain;margin-bottom:16px">` : ''}
${brandKit ? `<div style="font-weight:700;font-size:14px;color:${brandKit.primaryColor};margin-bottom:24px">${brandKit.name}</div>` : ''}
<h1 style="font-size:32px;font-weight:700;color:${brandKit?.primaryColor ?? '#000'};margin:0 0 8px">Nutrition Report</h1>
<h2 style="font-size:18px;font-weight:400;color:#666;margin:0 0 24px">${profileName}</h2>
<div style="font-size:14px;color:#666">Report Period</div>
<div style="font-size:16px;font-weight:600;color:#000">${startDate.toLocaleDateString()} — ${endDate.toLocaleDateString()}</div>
</div>`;

  const coverCanvas = await htmlToCanvas(coverHtml, 794);
  doc.addImage(coverCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);

  for (let i = 0; i < elements.length; i++) {
    doc.addPage();
    const canvas = await captureElement(elements[i]);
    const imgW = pageW - 20;
    const imgH = (canvas.height / canvas.width) * imgW;
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgW, Math.min(imgH, pageH - 20));
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

  const canvas = await captureElement(element);
  const docW = isLandscape ? pageH : pageW;
  const docH = isLandscape ? pageW : pageH;
  const imgW = docW - 20;
  const imgH = (canvas.height / canvas.width) * imgW;
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgW, Math.min(imgH, docH - 20));

  return doc.output('blob');
}

export type { RecipeData };

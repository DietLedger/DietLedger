import { getApiClient } from './api-client';
import { generateUUID } from './utils';
import type {
  RecipeRecord,
  BookRecord,
  ChapterRecord,
  ChapterRecipeRecord,
  ChapterPageRecord,
  BookPageRecord,
  CategoryRecord,
  RecipeCategoryRecord,
} from './types';

// ── Format ───────────────────────────────────────────────────────────
//
// A versioned JSON document. `data` mirrors the user-owned stores. Old
// exports (no chapters/pages sections) still import — every section beyond
// recipes/books defaults to an empty array. The same format is used for
// full backups, scoped recipe/cookbook sharing, and the bundled demo
// cookbook: export round-trips with import.
//
// Cross-entity ids in the bundle are the ORIGINAL ids at export time. Import
// remaps them to the freshly-created ids (recipe linkedRecipeId, chapter →
// book, chapter-recipe → chapter/recipe, category parentId). Intra-recipe ids
// (ingredient.groupId → ingredientGroups.id) are regenerated together so the
// linkage is preserved without colliding on re-import.

export interface ExportData {
  version: 1;
  exportedAt: string;
  data: {
    recipes: RecipeRecord[];
    books: BookRecord[];
    chapters: ChapterRecord[];
    chapterRecipes: ChapterRecipeRecord[];
    chapterPages: ChapterPageRecord[];
    bookPages: BookPageRecord[];
    categories: CategoryRecord[];
    recipeCategories: RecipeCategoryRecord[];
    mealPlans: unknown[];
    nutritionProfiles: unknown[];
    templates: unknown[];
    customFoods: unknown[];
  };
}

function emptyData(): ExportData['data'] {
  return {
    recipes: [], books: [], chapters: [], chapterRecipes: [],
    chapterPages: [], bookPages: [], categories: [], recipeCategories: [],
    mealPlans: [], nutritionProfiles: [], templates: [], customFoods: [],
  };
}

export async function exportAllData(): Promise<ExportData> {
  const client = getApiClient();

  const [recipesPage, books, mealPlans, nutritionProfiles, templates, customFoods, categories] = await Promise.all([
    client.getRecipes(1, 10000),
    client.getBooks(),
    client.getMealPlans(),
    client.getNutritionProfiles(),
    client.getTemplates(),
    client.getCustomFoods(),
    client.getCategories(),
  ]);

  const data = emptyData();
  data.recipes = recipesPage.data;
  data.books = books;
  data.categories = categories;
  data.mealPlans = mealPlans;
  data.nutritionProfiles = nutritionProfiles;
  data.templates = templates;
  data.customFoods = customFoods;
  for (const book of books) {
    try {
      const [bookChapters, pages] = await Promise.all([
        client.getChaptersByBook(book.id),
        client.getBookPages(book.id),
      ]);
      for (const ch of bookChapters) {
        data.chapters.push(ch);
        const [recipes, cPages] = await Promise.all([
          client.getChapterRecipes(ch.id),
          client.getChapterPages(ch.id),
        ]);
        data.chapterRecipes.push(...recipes);
        data.chapterPages.push(...cPages);
      }
      data.bookPages.push(...pages);
    } catch {
      // Skip a book whose structure fails to load rather than aborting export.
    }
  }

  return { version: 1, exportedAt: new Date().toISOString(), data };
}

// Scoped export: a single cookbook (book + chapters + recipe placement +
// pages + the recipes it references).
export async function exportBook(bookId: string): Promise<ExportData> {
  const client = getApiClient();
  const [book, chapters, bookPages] = await Promise.all([
    client.getBook(bookId),
    client.getChaptersByBook(bookId),
    client.getBookPages(bookId),
  ]);

  const data = emptyData();
  if (book) data.books.push(book);
  data.chapters = chapters;
  data.bookPages = bookPages;

  const recipeIds = new Set<string>();
  for (const ch of chapters) {
    try {
      const [crs, cpgs] = await Promise.all([
        client.getChapterRecipes(ch.id),
        client.getChapterPages(ch.id),
      ]);
      data.chapterRecipes.push(...crs);
      data.chapterPages.push(...cpgs);
      for (const cr of crs) recipeIds.add(cr.recipeId);
    } catch {
      // Skip a chapter whose contents fail to load.
    }
  }

  for (const id of recipeIds) {
    const r = await client.getRecipe(id);
    if (r) data.recipes.push(r);
  }

  return { version: 1, exportedAt: new Date().toISOString(), data };
}

// Scoped export: one or more recipes (no book structure).
export async function exportRecipes(recipeIds: string[]): Promise<ExportData> {
  const client = getApiClient();
  const data = emptyData();
  for (const id of recipeIds) {
    const r = await client.getRecipe(id);
    if (r) data.recipes.push(r);
  }
  return { version: 1, exportedAt: new Date().toISOString(), data };
}

// ── Download helpers ─────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: ExportData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `dietledger-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

// Pack a manifest into a .zip (server-side via /api/pack) and download it.
export async function downloadZip(manifest: ExportData, filename: string): Promise<void> {
  const res = await fetch('/api/pack', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(manifest),
  });
  if (!res.ok) throw new Error('Failed to build zip');
  triggerDownload(await res.blob(), filename);
}

// ── Import ───────────────────────────────────────────────────────────

type ImportCounts = {
  recipes: number;
  books: number;
  chapters: number;
  chapterRecipes: number;
  chapterPages: number;
  bookPages: number;
  categories: number;
  mealPlans: number;
  nutritionProfiles: number;
  templates: number;
  customFoods: number;
};

function emptyCounts(): ImportCounts {
  return {
    recipes: 0, books: 0, chapters: 0, chapterRecipes: 0, chapterPages: 0,
    bookPages: 0, categories: 0, mealPlans: 0, nutritionProfiles: 0,
    templates: 0, customFoods: 0,
  };
}

// Core importer: reconstructs the full object graph from an ExportData
// document with id remapping. Shared by the JSON and zip import paths and by
// the demo-cookbook installer.
export async function importData(data: ExportData, onProgress?: (counts: ImportCounts) => void): Promise<ImportResult> {
  if (data.version !== 1 || !data.data) {
    return { success: false, error: 'Unrecognized format (expected version 1)' };
  }

  const client = getApiClient();
  const counts = emptyCounts();
  const d = data.data;

  const chapters = (d.chapters as ChapterRecord[] | undefined) ?? [];
  const chapterRecipes = (d.chapterRecipes as ChapterRecipeRecord[] | undefined) ?? [];
  const chapterPages = (d.chapterPages as ChapterPageRecord[] | undefined) ?? [];
  const bookPages = (d.bookPages as BookPageRecord[] | undefined) ?? [];
  const categories = (d.categories as CategoryRecord[] | undefined) ?? [];

  try {
    // ── Recipes ──────────────────────────────────────────────────────
    // Two passes: create shells first to build an old→new id map (needed to
    // remap ingredient.linkedRecipeId cross-references), then hydrate each.
    const recipeIdMap: Record<string, string> = {};
    for (const recipe of d.recipes as RecipeRecord[]) {
      const created = await client.createRecipe(recipe.name || 'Untitled');
      recipeIdMap[recipe.id] = created.id;
    }
    for (const recipe of d.recipes as RecipeRecord[]) {
      const newId = recipeIdMap[recipe.id];
      if (!newId) continue;

      const groupIdMap: Record<string, string> = {};
      const ingredientGroups = (recipe.ingredientGroups ?? []).map((g) => {
        const newGroupId = generateUUID();
        groupIdMap[g.id] = newGroupId;
        return { id: newGroupId, title: g.title };
      });

      const ingredients = (recipe.ingredients ?? []).map((ing) => ({
        ...ing,
        id: generateUUID(),
        recipeId: newId,
        groupId: ing.groupId ? groupIdMap[ing.groupId] ?? null : null,
        linkedRecipeId: ing.linkedRecipeId ? recipeIdMap[ing.linkedRecipeId] ?? null : null,
      }));

      await client.updateRecipe(newId, {
        servings: recipe.servings,
        servingName: recipe.servingName,
        prepTime: recipe.prepTime,
        cookTime: recipe.cookTime,
        instructions: recipe.instructions,
        leftoverStorage: recipe.leftoverStorage,
        ingredients,
        ingredientGroups,
      });
      counts.recipes++;
      onProgress?.(counts);
    }

    // ── Books + chapters + placement + pages ─────────────────────────
    const bookIdMap: Record<string, string> = {};
    for (const book of d.books as BookRecord[]) {
      const created = await client.createBook(book.title || 'Untitled', book.description, book.coverColor);
      bookIdMap[book.id] = created.id;
      counts.books++;
    }

    const chapterIdMap: Record<string, string> = {};
    for (const ch of [...chapters].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      const newBookId = bookIdMap[ch.bookId];
      if (!newBookId) continue;
      const created = await client.createChapter(newBookId, ch.title || 'Untitled');
      chapterIdMap[ch.id] = created.id;
      await client.updateChapter(created.id, {
        position: ch.position,
        pageTemplateId: ch.pageTemplateId,
        recipeTemplateId: ch.recipeTemplateId,
      });
      counts.chapters++;
    }

    // Place recipes into chapters in original order (addRecipeToChapter
    // appends, so position-sorted insertion preserves sequence).
    for (const cr of [...chapterRecipes].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      const newChapterId = chapterIdMap[cr.chapterId];
      const newRecipeId = recipeIdMap[cr.recipeId];
      if (!newChapterId || !newRecipeId) continue;
      await client.addRecipeToChapter(newChapterId, newRecipeId);
      counts.chapterRecipes++;
    }

    for (const pg of [...chapterPages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      const newChapterId = chapterIdMap[pg.chapterId];
      if (!newChapterId) continue;
      const created = await client.createChapterPage(newChapterId, pg.title || '', pg.content || '');
      await client.updateChapterPage(created.id, { position: pg.position });
      counts.chapterPages++;
    }

    for (const pg of [...bookPages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      const newBookId = bookIdMap[pg.bookId];
      if (!newBookId) continue;
      const created = await client.createBookPage(newBookId, pg.title || '', pg.content || '');
      await client.updateBookPage(created.id, { position: pg.position });
      counts.bookPages++;
    }

    // ── Categories (parents before children) ─────────────────────────
    const categoryIdMap: Record<string, string> = {};
    const byParent = (wantsParent: string | null) =>
      categories.filter((c) => (c.parentId ?? null) === wantsParent);

    let tier = byParent(null);
    const seen = new Set<string>();
    while (tier.length > 0) {
      const nextTier: CategoryRecord[] = [];
      for (const cat of tier) {
        if (seen.has(cat.id)) continue;
        seen.add(cat.id);
        const created = await client.createCategory(cat.name, cat.parentId ? categoryIdMap[cat.parentId] ?? null : null);
        categoryIdMap[cat.id] = created.id;
        counts.categories++;
        nextTier.push(...byParent(cat.id));
      }
      tier = nextTier;
    }

    // ── Remaining stores (full-record create) ────────────────────────
    const recipeCategories = (d.recipeCategories as RecipeCategoryRecord[] | undefined) ?? [];
    for (const rc of recipeCategories) {
      const newRecipeId = recipeIdMap[rc.recipeId];
      const newCategoryId = categoryIdMap[rc.categoryId];
      if (!newRecipeId || !newCategoryId) continue;
      try {
        await client.addCategoryToRecipe(newRecipeId, newCategoryId);
      } catch {
        // Duplicate assignment or stale link — non-fatal.
      }
    }

    for (const plan of d.mealPlans as any[]) {
      await client.createMealPlan(plan.name || 'Untitled', plan.weekStart);
      counts.mealPlans++;
    }
    for (const profile of d.nutritionProfiles as any[]) {
      await client.createNutritionProfile(profile);
      counts.nutritionProfiles++;
    }
    for (const tmpl of d.templates as any[]) {
      await client.createTemplate(tmpl);
      counts.templates++;
    }
    for (const food of d.customFoods as any[]) {
      await client.createCustomFood(food);
      counts.customFoods++;
    }
  } catch (e) {
    return {
      success: false,
      error: `Import failed: ${e instanceof Error ? e.message : String(e)}`,
      counts,
    };
  }

  return { success: true, counts };
}

export async function importFromJson(file: File, onProgress?: (counts: ImportCounts) => void): Promise<ImportResult> {
  const text = await file.text();
  let data: ExportData;
  try {
    data = JSON.parse(text);
  } catch {
    return { success: false, error: 'Invalid JSON file' };
  }
  return importData(data, onProgress);
}

// Unpack a .zip (server-side via /api/unpack) and import the manifest inside.
export async function importFromZip(file: File, onProgress?: (counts: ImportCounts) => void): Promise<ImportResult> {
  let data: ExportData;
  try {
    const res = await fetch('/api/unpack', { method: 'POST', body: await file.arrayBuffer() });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      return { success: false, error: msg.error || `Failed to read zip (HTTP ${res.status})` };
    }
    data = await res.json();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to read zip' };
  }
  return importData(data, onProgress);
}

export interface ImportResult {
  success: boolean;
  error?: string;
  counts?: ImportCounts;
}

export function summarizeCounts(counts?: ImportCounts): string {
  if (!counts) return '';
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const parts: string[] = [];
  if (counts.recipes) parts.push(`${counts.recipes} recipe${counts.recipes !== 1 ? 's' : ''}`);
  if (counts.books) parts.push(`${counts.books} book${counts.books !== 1 ? 's' : ''}`);
  if (counts.chapters) parts.push(`${counts.chapters} chapter${counts.chapters !== 1 ? 's' : ''}`);
  if (counts.chapterPages + counts.bookPages > 0) parts.push(`${counts.chapterPages + counts.bookPages} page${counts.chapterPages + counts.bookPages !== 1 ? 's' : ''}`);
  const extras = total - counts.recipes - counts.books - counts.chapters - counts.chapterPages - counts.bookPages;
  if (extras > 0) parts.push(`${extras} other`);
  return parts.length ? `Imported ${parts.join(', ')}` : `Imported ${total} item${total !== 1 ? 's' : ''}`;
}

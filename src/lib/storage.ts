import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface IngredientGroup {
  id: string;
  title: string;
}

interface IngredientRecord {
  id: string;
  recipeId: string;
  fdcId: number;
  name: string;
  amount: number;
  unit: string;
  description: string;
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
  groupId: string | null;
  linkedRecipeId: string | null;
}

interface RecipeRecord {
  id: string;
  name: string;
  servings: number;
  servingName: string;
  instructions: string | null;
  ingredientGroups: IngredientGroup[];
  createdAt: string;
  updatedAt: string;
  ingredients: IngredientRecord[];
}

interface BookRecord {
  id: string;
  title: string;
  description: string;
  coverColor: string;
  createdAt: string;
  updatedAt: string;
}

interface ChapterRecord {
  id: string;
  bookId: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface ChapterRecipeRecord {
  id: string;
  chapterId: string;
  recipeId: string;
  position: number;
}

interface CategoryRecord {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RecipeCategoryRecord {
  id: string;
  recipeId: string;
  categoryId: string;
}

interface ChapterPageRecord {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface BookPageRecord {
  id: string;
  bookId: string;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface NutriLabelDB extends DBSchema {
  recipes: {
    key: string;
    value: RecipeRecord;
    indexes: { 'by-updatedAt': string };
  };
  books: {
    key: string;
    value: BookRecord;
    indexes: { 'by-updatedAt': string };
  };
  chapters: {
    key: string;
    value: ChapterRecord;
    indexes: { 'by-bookId': string };
  };
  chapterRecipes: {
    key: string;
    value: ChapterRecipeRecord;
    indexes: { 'by-chapterId': string; 'by-recipeId': string };
  };
  categories: {
    key: string;
    value: CategoryRecord;
    indexes: { 'by-parentId': string };
  };
  recipeCategories: {
    key: string;
    value: RecipeCategoryRecord;
    indexes: { 'by-recipeId': string; 'by-categoryId': string };
  };
  chapterPages: {
    key: string;
    value: ChapterPageRecord;
    indexes: { 'by-chapterId': string };
  };
  bookPages: {
    key: string;
    value: BookPageRecord;
    indexes: { 'by-bookId': string };
  };
}

const DB_NAME = 'nutrilabel-db';
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<NutriLabelDB>> | null = null;

function getDB(): Promise<IDBPDatabase<NutriLabelDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NutriLabelDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const recipeStore = db.createObjectStore('recipes', { keyPath: 'id' });
          recipeStore.createIndex('by-updatedAt', 'updatedAt');
        }
        if (oldVersion < 2) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('by-updatedAt', 'updatedAt');

          const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
          chapterStore.createIndex('by-bookId', 'bookId');

          const chapterRecipeStore = db.createObjectStore('chapterRecipes', { keyPath: 'id' });
          chapterRecipeStore.createIndex('by-chapterId', 'chapterId');
          chapterRecipeStore.createIndex('by-recipeId', 'recipeId');

          const categoryStore = db.createObjectStore('categories', { keyPath: 'id' });
          categoryStore.createIndex('by-parentId', 'parentId');

          const recipeCategoryStore = db.createObjectStore('recipeCategories', { keyPath: 'id' });
          recipeCategoryStore.createIndex('by-recipeId', 'recipeId');
          recipeCategoryStore.createIndex('by-categoryId', 'categoryId');
        }
        if (oldVersion < 3) {
          const chapterPageStore = db.createObjectStore('chapterPages', { keyPath: 'id' });
          chapterPageStore.createIndex('by-chapterId', 'chapterId');
        }
        if (oldVersion < 4) {
          const bookPageStore = db.createObjectStore('bookPages', { keyPath: 'id' });
          bookPageStore.createIndex('by-bookId', 'bookId');
        }
      },
    });
  }
  return dbPromise;
}

// ── Recipe CRUD ──────────────────────────────────────────────────────

export async function getAllRecipes(): Promise<RecipeRecord[]> {
  const db = await getDB();
  const recipes = await db.getAll('recipes');
  return recipes.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).map(r => { migrateRecipe(r); return r; });
}

export async function getRecipe(id: string): Promise<RecipeRecord | undefined> {
  const db = await getDB();
  const recipe = await db.get('recipes', id);
  if (recipe) migrateRecipe(recipe);
  return recipe;
}

function migrateRecipe(recipe: RecipeRecord): void {
  if (!recipe.ingredientGroups) recipe.ingredientGroups = [];
  for (const ing of recipe.ingredients) {
    if (ing.groupId === undefined) ing.groupId = null;
    if (ing.linkedRecipeId === undefined) ing.linkedRecipeId = null;
  }
}

export async function createRecipe(name: string): Promise<RecipeRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const recipe: RecipeRecord = {
    id: crypto.randomUUID(),
    name: name.trim(),
    servings: 1,
    servingName: 'serving',
    instructions: null,
    ingredientGroups: [],
    createdAt: now,
    updatedAt: now,
    ingredients: [],
  };
  await db.put('recipes', recipe);
  return recipe;
}

export async function updateRecipe(
  id: string,
  data: { name?: string; servings?: number; servingName?: string; instructions?: string; ingredients?: IngredientRecord[]; ingredientGroups?: IngredientGroup[] }
): Promise<RecipeRecord> {
  const db = await getDB();
  const recipe = await db.get('recipes', id);
  if (!recipe) throw new Error('Recipe not found');

  if (data.name !== undefined) recipe.name = data.name.trim();
  if (data.servings !== undefined) recipe.servings = data.servings;
  if (data.servingName !== undefined) recipe.servingName = data.servingName.trim();
  if (data.instructions !== undefined) recipe.instructions = data.instructions;
  if (data.ingredients !== undefined) recipe.ingredients = data.ingredients;
  if (data.ingredientGroups !== undefined) recipe.ingredientGroups = data.ingredientGroups;
  recipe.updatedAt = new Date().toISOString();

  await db.put('recipes', recipe);
  return recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('recipes', id);
}

// ── Ingredient CRUD ──────────────────────────────────────────────────

export async function addIngredient(
  recipeId: string,
  ingredient: Omit<IngredientRecord, 'id' | 'recipeId'>
): Promise<IngredientRecord> {
  const db = await getDB();
  const recipe = await db.get('recipes', recipeId);
  if (!recipe) throw new Error('Recipe not found');

  const newIngredient: IngredientRecord = {
    id: crypto.randomUUID(),
    recipeId,
    ...ingredient,
  };

  recipe.ingredients.push(newIngredient);
  recipe.updatedAt = new Date().toISOString();

  await db.put('recipes', recipe);
  return newIngredient;
}

export async function removeIngredient(
  recipeId: string,
  ingredientId: string
): Promise<void> {
  const db = await getDB();
  const recipe = await db.get('recipes', recipeId);
  if (!recipe) throw new Error('Recipe not found');

  recipe.ingredients = recipe.ingredients.filter((i) => i.id !== ingredientId);
  recipe.updatedAt = new Date().toISOString();

  await db.put('recipes', recipe);
}

export async function updateIngredient(
  recipeId: string,
  ingredientId: string,
  data: { description?: string; amount?: number; unit?: string; calories?: number; totalFat?: number; saturatedFat?: number; transFat?: number; cholesterol?: number; sodium?: number; totalCarbs?: number; dietaryFiber?: number; totalSugars?: number; addedSugars?: number; protein?: number; vitaminD?: number; calcium?: number; iron?: number; potassium?: number }
): Promise<IngredientRecord> {
  const db = await getDB();
  const recipe = await db.get('recipes', recipeId);
  if (!recipe) throw new Error('Recipe not found');

  const idx = recipe.ingredients.findIndex((i) => i.id === ingredientId);
  if (idx === -1) throw new Error('Ingredient not found');

  const ingredient = recipe.ingredients[idx];
  if (data.description !== undefined) ingredient.description = data.description;
  if (data.amount !== undefined) ingredient.amount = data.amount;
  if (data.unit !== undefined) ingredient.unit = data.unit;
  if (data.calories !== undefined) ingredient.calories = data.calories;
  if (data.totalFat !== undefined) ingredient.totalFat = data.totalFat;
  if (data.saturatedFat !== undefined) ingredient.saturatedFat = data.saturatedFat;
  if (data.transFat !== undefined) ingredient.transFat = data.transFat;
  if (data.cholesterol !== undefined) ingredient.cholesterol = data.cholesterol;
  if (data.sodium !== undefined) ingredient.sodium = data.sodium;
  if (data.totalCarbs !== undefined) ingredient.totalCarbs = data.totalCarbs;
  if (data.dietaryFiber !== undefined) ingredient.dietaryFiber = data.dietaryFiber;
  if (data.totalSugars !== undefined) ingredient.totalSugars = data.totalSugars;
  if (data.addedSugars !== undefined) ingredient.addedSugars = data.addedSugars;
  if (data.protein !== undefined) ingredient.protein = data.protein;
  if (data.vitaminD !== undefined) ingredient.vitaminD = data.vitaminD;
  if (data.calcium !== undefined) ingredient.calcium = data.calcium;
  if (data.iron !== undefined) ingredient.iron = data.iron;
  if (data.potassium !== undefined) ingredient.potassium = data.potassium;

  recipe.updatedAt = new Date().toISOString();
  await db.put('recipes', recipe);
  return ingredient;
}

// ── Book CRUD ────────────────────────────────────────────────────────

export async function getAllBooks(): Promise<BookRecord[]> {
  const db = await getDB();
  const books = await db.getAll('books');
  return books.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const db = await getDB();
  return db.get('books', id);
}

export async function createBook(title: string, description?: string, coverColor?: string): Promise<BookRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const book: BookRecord = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: (description || '').trim(),
    coverColor: coverColor || '#059669',
    createdAt: now,
    updatedAt: now,
  };
  await db.put('books', book);
  return book;
}

export async function updateBook(
  id: string,
  data: { title?: string; description?: string; coverColor?: string }
): Promise<BookRecord> {
  const db = await getDB();
  const book = await db.get('books', id);
  if (!book) throw new Error('Book not found');

  if (data.title !== undefined) book.title = data.title.trim();
  if (data.description !== undefined) book.description = data.description.trim();
  if (data.coverColor !== undefined) book.coverColor = data.coverColor;
  book.updatedAt = new Date().toISOString();

  await db.put('books', book);
  return book;
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDB();
  const chapters = await db.getAllFromIndex('chapters', 'by-bookId', id);
  const allChapterIds = chapters.map(c => c.id);

  const allChapterRecipes: ChapterRecipeRecord[] = [];
  const allChapterPages: ChapterPageRecord[] = [];
  for (const chapterId of allChapterIds) {
    const crs = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
    allChapterRecipes.push(...crs);
    const cps = await db.getAllFromIndex('chapterPages', 'by-chapterId', chapterId);
    allChapterPages.push(...cps);
  }

  const tx = db.transaction(['books', 'chapters', 'chapterRecipes', 'chapterPages'], 'readwrite');
  for (const cr of allChapterRecipes) {
    await tx.objectStore('chapterRecipes').delete(cr.id);
  }
  for (const cp of allChapterPages) {
    await tx.objectStore('chapterPages').delete(cp.id);
  }
  for (const chapter of chapters) {
    await tx.objectStore('chapters').delete(chapter.id);
  }
  await tx.objectStore('books').delete(id);
  await tx.done;
}

// ── Chapter CRUD ─────────────────────────────────────────────────────

export async function getChaptersByBook(bookId: string): Promise<ChapterRecord[]> {
  const db = await getDB();
  const chapters = await db.getAllFromIndex('chapters', 'by-bookId', bookId);
  return chapters.sort((a, b) => a.position - b.position);
}

export async function createChapter(bookId: string, title: string): Promise<ChapterRecord> {
  const db = await getDB();
  const existing = await db.getAllFromIndex('chapters', 'by-bookId', bookId);
  const now = new Date().toISOString();
  const chapter: ChapterRecord = {
    id: crypto.randomUUID(),
    bookId,
    title: title.trim(),
    position: existing.length,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('chapters', chapter);
  return chapter;
}

export async function updateChapter(
  id: string,
  data: { title?: string; position?: number }
): Promise<ChapterRecord> {
  const db = await getDB();
  const chapter = await db.get('chapters', id);
  if (!chapter) throw new Error('Chapter not found');

  if (data.title !== undefined) chapter.title = data.title.trim();
  if (data.position !== undefined) chapter.position = data.position;
  chapter.updatedAt = new Date().toISOString();

  await db.put('chapters', chapter);
  return chapter;
}

export async function deleteChapter(id: string): Promise<void> {
  const db = await getDB();
  const chapterRecipes = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', id);
  const chapterPages = await db.getAllFromIndex('chapterPages', 'by-chapterId', id);
  const tx = db.transaction(['chapters', 'chapterRecipes', 'chapterPages'], 'readwrite');
  for (const cr of chapterRecipes) {
    await tx.objectStore('chapterRecipes').delete(cr.id);
  }
  for (const cp of chapterPages) {
    await tx.objectStore('chapterPages').delete(cp.id);
  }
  await tx.objectStore('chapters').delete(id);
  await tx.done;
}

export async function reorderChapters(bookId: string, chapterIds: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chapters', 'readwrite');
  for (let i = 0; i < chapterIds.length; i++) {
    const chapter = await tx.store.get(chapterIds[i]);
    if (chapter && chapter.bookId === bookId) {
      chapter.position = i;
      chapter.updatedAt = new Date().toISOString();
      await tx.store.put(chapter);
    }
  }
  await tx.done;
}

// ── ChapterRecipe CRUD ───────────────────────────────────────────────

export async function getChapterRecipes(chapterId: string): Promise<ChapterRecipeRecord[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  return records.sort((a, b) => a.position - b.position);
}

export async function addRecipeToChapter(chapterId: string, recipeId: string): Promise<ChapterRecipeRecord> {
  const db = await getDB();
  const existing = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const record: ChapterRecipeRecord = {
    id: crypto.randomUUID(),
    chapterId,
    recipeId,
    position: existing.length,
  };
  await db.put('chapterRecipes', record);
  return record;
}

export async function removeRecipeFromChapter(chapterId: string, recipeId: string): Promise<void> {
  const db = await getDB();
  const records = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const target = records.find(r => r.recipeId === recipeId);
  if (target) {
    await db.delete('chapterRecipes', target.id);
  }
}

export async function reorderChapterRecipes(chapterId: string, recipeIds: string[]): Promise<void> {
  const db = await getDB();
  const records = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const tx = db.transaction('chapterRecipes', 'readwrite');
  for (let i = 0; i < recipeIds.length; i++) {
    const record = records.find(r => r.recipeId === recipeIds[i]);
    if (record) {
      record.position = i;
      await tx.store.put(record);
    }
  }
  await tx.done;
}

// ── ChapterPage CRUD ─────────────────────────────────────────────────

export async function getChapterPages(chapterId: string): Promise<ChapterPageRecord[]> {
  const db = await getDB();
  const pages = await db.getAllFromIndex('chapterPages', 'by-chapterId', chapterId);
  return pages.sort((a, b) => a.position - b.position);
}

export async function createChapterPage(chapterId: string, title: string, content: string): Promise<ChapterPageRecord> {
  const db = await getDB();
  const recipes = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const pages = await db.getAllFromIndex('chapterPages', 'by-chapterId', chapterId);
  const maxPosition = Math.max(
    ...recipes.map(r => r.position),
    ...pages.map(p => p.position),
    -1
  );
  const now = new Date().toISOString();
  const page: ChapterPageRecord = {
    id: crypto.randomUUID(),
    chapterId,
    title: title.trim(),
    content,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('chapterPages', page);
  return page;
}

export async function updateChapterPage(
  id: string,
  data: { title?: string; content?: string; position?: number }
): Promise<ChapterPageRecord> {
  const db = await getDB();
  const page = await db.get('chapterPages', id);
  if (!page) throw new Error('Chapter page not found');

  if (data.title !== undefined) page.title = data.title.trim();
  if (data.content !== undefined) page.content = data.content;
  if (data.position !== undefined) page.position = data.position;
  page.updatedAt = new Date().toISOString();

  await db.put('chapterPages', page);
  return page;
}

export async function deleteChapterPage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('chapterPages', id);
}

export async function getMaxChapterItemPosition(chapterId: string): Promise<number> {
  const db = await getDB();
  const recipes = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const pages = await db.getAllFromIndex('chapterPages', 'by-chapterId', chapterId);
  return Math.max(
    ...recipes.map(r => r.position),
    ...pages.map(p => p.position),
    -1
  );
}

// ── BookPage CRUD ─────────────────────────────────────────────────────

export async function getBookPages(bookId: string): Promise<BookPageRecord[]> {
  const db = await getDB();
  const pages = await db.getAllFromIndex('bookPages', 'by-bookId', bookId);
  return pages.sort((a, b) => a.position - b.position);
}

export async function createBookPage(bookId: string, title: string, content: string): Promise<BookPageRecord> {
  const db = await getDB();
  const chapters = await db.getAllFromIndex('chapters', 'by-bookId', bookId);
  const pages = await db.getAllFromIndex('bookPages', 'by-bookId', bookId);
  const maxPosition = Math.max(
    ...chapters.map(c => c.position),
    ...pages.map(p => p.position),
    -1
  );
  const now = new Date().toISOString();
  const page: BookPageRecord = {
    id: crypto.randomUUID(),
    bookId,
    title: title.trim(),
    content,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('bookPages', page);
  return page;
}

export async function updateBookPage(
  id: string,
  data: { title?: string; content?: string; position?: number }
): Promise<BookPageRecord> {
  const db = await getDB();
  const page = await db.get('bookPages', id);
  if (!page) throw new Error('Book page not found');

  if (data.title !== undefined) page.title = data.title.trim();
  if (data.content !== undefined) page.content = data.content;
  if (data.position !== undefined) page.position = data.position;
  page.updatedAt = new Date().toISOString();

  await db.put('bookPages', page);
  return page;
}

export async function deleteBookPage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('bookPages', id);
}

export async function reorderBookLevelItems(
  bookId: string,
  items: Array<{ id: string; type: 'chapter' | 'book-page' }>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['chapters', 'bookPages'], 'readwrite');
  const now = new Date().toISOString();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'chapter') {
      const chapter = await tx.objectStore('chapters').get(item.id);
      if (chapter && chapter.bookId === bookId) {
        chapter.position = i;
        chapter.updatedAt = now;
        await tx.objectStore('chapters').put(chapter);
      }
    } else {
      const page = await tx.objectStore('bookPages').get(item.id);
      if (page && page.bookId === bookId) {
        page.position = i;
        page.updatedAt = now;
        await tx.objectStore('bookPages').put(page);
      }
    }
  }
  await tx.done;
}

export async function reorderChapterItems(
  chapterId: string,
  items: Array<{ type: 'recipe'; recipeId: string } | { type: 'page'; pageId: string }>
): Promise<void> {
  const db = await getDB();
  const recipeRecords = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const tx = db.transaction(['chapterRecipes', 'chapterPages'], 'readwrite');
  const now = new Date().toISOString();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'recipe') {
      const record = recipeRecords.find(r => r.recipeId === item.recipeId);
      if (record) {
        record.position = i;
        await tx.objectStore('chapterRecipes').put(record);
      }
    } else {
      const page = await tx.objectStore('chapterPages').get(item.pageId);
      if (page && page.chapterId === chapterId) {
        page.position = i;
        page.updatedAt = now;
        await tx.objectStore('chapterPages').put(page);
      }
    }
  }
  await tx.done;
}

export async function moveRecipeBetweenChapters(
  chapterRecipeId: string,
  toChapterId: string,
  position: number
): Promise<ChapterRecipeRecord> {
  const db = await getDB();
  const existing = await db.get('chapterRecipes', chapterRecipeId);
  if (!existing) throw new Error('Chapter recipe not found');

  const newRecord: ChapterRecipeRecord = {
    id: crypto.randomUUID(),
    chapterId: toChapterId,
    recipeId: existing.recipeId,
    position,
  };

  const tx = db.transaction('chapterRecipes', 'readwrite');
  await tx.store.delete(chapterRecipeId);
  await tx.store.put(newRecord);
  await tx.done;

  return newRecord;
}

export async function convertChapterPageToBookPage(
  chapterPageId: string,
  bookId: string,
  position: number
): Promise<BookPageRecord> {
  const db = await getDB();
  const chapterPage = await db.get('chapterPages', chapterPageId);
  if (!chapterPage) throw new Error('Chapter page not found');

  const now = new Date().toISOString();
  const bookPage: BookPageRecord = {
    id: crypto.randomUUID(),
    bookId,
    title: chapterPage.title,
    content: chapterPage.content,
    position,
    createdAt: now,
    updatedAt: now,
  };

  const tx = db.transaction(['chapterPages', 'bookPages'], 'readwrite');
  await tx.objectStore('chapterPages').delete(chapterPageId);
  await tx.objectStore('bookPages').put(bookPage);
  await tx.done;

  return bookPage;
}

export async function convertBookPageToChapterPage(
  bookPageId: string,
  chapterId: string,
  position: number
): Promise<ChapterPageRecord> {
  const db = await getDB();
  const bookPage = await db.get('bookPages', bookPageId);
  if (!bookPage) throw new Error('Book page not found');

  const now = new Date().toISOString();
  const chapterPage: ChapterPageRecord = {
    id: crypto.randomUUID(),
    chapterId,
    title: bookPage.title,
    content: bookPage.content,
    position,
    createdAt: now,
    updatedAt: now,
  };

  const tx = db.transaction(['chapterPages', 'bookPages'], 'readwrite');
  await tx.objectStore('bookPages').delete(bookPageId);
  await tx.objectStore('chapterPages').put(chapterPage);
  await tx.done;

  return chapterPage;
}

// ── Category CRUD ────────────────────────────────────────────────────

export async function getAllCategories(): Promise<CategoryRecord[]> {
  const db = await getDB();
  return db.getAll('categories');
}

export async function getCategory(id: string): Promise<CategoryRecord | undefined> {
  const db = await getDB();
  return db.get('categories', id);
}

export async function getCategoriesByParent(parentId: string | null): Promise<CategoryRecord[]> {
  const db = await getDB();
  if (parentId === null) {
    const all = await db.getAll('categories');
    return all.filter(c => c.parentId === null);
  }
  return db.getAllFromIndex('categories', 'by-parentId', parentId);
}

export async function createCategory(name: string, parentId?: string | null): Promise<CategoryRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const category: CategoryRecord = {
    id: crypto.randomUUID(),
    name: name.trim(),
    parentId: parentId || null,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('categories', category);
  return category;
}

export async function updateCategory(
  id: string,
  data: { name?: string; parentId?: string | null }
): Promise<CategoryRecord> {
  const db = await getDB();
  const category = await db.get('categories', id);
  if (!category) throw new Error('Category not found');

  if (data.name !== undefined) category.name = data.name.trim();
  if (data.parentId !== undefined) category.parentId = data.parentId;
  category.updatedAt = new Date().toISOString();

  await db.put('categories', category);
  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  await deleteCategoryCascade(db, id);
}

async function deleteCategoryCascade(db: IDBPDatabase<NutriLabelDB>, id: string): Promise<void> {
  const children = await db.getAllFromIndex('categories', 'by-parentId', id);
  for (const child of children) {
    await deleteCategoryCascade(db, child.id);
  }
  const recipeCategories = await db.getAllFromIndex('recipeCategories', 'by-categoryId', id);
  const tx = db.transaction(['categories', 'recipeCategories'], 'readwrite');
  for (const rc of recipeCategories) {
    await tx.objectStore('recipeCategories').delete(rc.id);
  }
  await tx.objectStore('categories').delete(id);
  await tx.done;
}

// ── RecipeCategory CRUD ──────────────────────────────────────────────

export async function getRecipeCategories(recipeId: string): Promise<RecipeCategoryRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('recipeCategories', 'by-recipeId', recipeId);
}

export async function getRecipesByCategory(categoryId: string): Promise<RecipeCategoryRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('recipeCategories', 'by-categoryId', categoryId);
}

export async function addCategoryToRecipe(recipeId: string, categoryId: string): Promise<RecipeCategoryRecord> {
  const db = await getDB();
  const existing = await db.getAllFromIndex('recipeCategories', 'by-recipeId', recipeId);
  if (existing.some(r => r.categoryId === categoryId)) {
    throw new Error('Recipe already has this category');
  }
  const record: RecipeCategoryRecord = {
    id: crypto.randomUUID(),
    recipeId,
    categoryId,
  };
  await db.put('recipeCategories', record);
  return record;
}

export async function removeCategoryFromRecipe(recipeId: string, categoryId: string): Promise<void> {
  const db = await getDB();
  const records = await db.getAllFromIndex('recipeCategories', 'by-recipeId', recipeId);
  const target = records.find(r => r.categoryId === categoryId);
  if (target) {
    await db.delete('recipeCategories', target.id);
  }
}

// ── API Key Storage (localStorage) ────────────────────────────────────

const API_KEY_STORAGE_KEY = 'nutrilabel-fda-api-key';

export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return 'DEMO_KEY';
  return localStorage.getItem(API_KEY_STORAGE_KEY) || 'DEMO_KEY';
}

export function setStoredApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (key.trim()) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

export type {
  RecipeRecord,
  IngredientRecord,
  IngredientGroup,
  BookRecord,
  ChapterRecord,
  ChapterRecipeRecord,
  ChapterPageRecord,
  BookPageRecord,
  CategoryRecord,
  RecipeCategoryRecord,
};

// IndexedDB storage layer - replaces Prisma/SQLite for fully client-side operation
// No server needed - all data lives in the browser's IndexedDB

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface IngredientRecord {
  id: string;
  recipeId: string;
  fdcId: number;
  name: string;
  amount: number;
  unit: string;
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

interface RecipeRecord {
  id: string;
  name: string;
  servings: number;
  instructions: string | null;
  createdAt: string;
  updatedAt: string;
  ingredients: IngredientRecord[];
}

interface NutriLabelDB extends DBSchema {
  recipes: {
    key: string;
    value: RecipeRecord;
    indexes: { 'by-updatedAt': string };
  };
}

const DB_NAME = 'nutrilabel-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NutriLabelDB>> | null = null;

function getDB(): Promise<IDBPDatabase<NutriLabelDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NutriLabelDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('recipes', { keyPath: 'id' });
        store.createIndex('by-updatedAt', 'updatedAt');
      },
    });
  }
  return dbPromise;
}

// ── Recipe CRUD ──────────────────────────────────────────────────────

export async function getAllRecipes(): Promise<RecipeRecord[]> {
  const db = await getDB();
  const recipes = await db.getAll('recipes');
  // Sort by updatedAt descending
  return recipes.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getRecipe(id: string): Promise<RecipeRecord | undefined> {
  const db = await getDB();
  return db.get('recipes', id);
}

export async function createRecipe(name: string): Promise<RecipeRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const recipe: RecipeRecord = {
    id: crypto.randomUUID(),
    name: name.trim(),
    servings: 1,
    instructions: null,
    createdAt: now,
    updatedAt: now,
    ingredients: [],
  };
  await db.put('recipes', recipe);
  return recipe;
}

export async function updateRecipe(
  id: string,
  data: { name?: string; servings?: number; instructions?: string }
): Promise<RecipeRecord> {
  const db = await getDB();
  const recipe = await db.get('recipes', id);
  if (!recipe) throw new Error('Recipe not found');

  if (data.name !== undefined) recipe.name = data.name.trim();
  if (data.servings !== undefined) recipe.servings = data.servings;
  if (data.instructions !== undefined) recipe.instructions = data.instructions;
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

export type { RecipeRecord, IngredientRecord };

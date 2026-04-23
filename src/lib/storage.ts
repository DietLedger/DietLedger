// IndexedDB storage layer - replaces Prisma/SQLite for fully client-side operation
// No server needed - all data lives in the browser's IndexedDB

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

export type { RecipeRecord, IngredientRecord, IngredientGroup };

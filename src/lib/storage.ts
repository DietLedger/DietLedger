import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SyncServerConfig, SyncChangeLogEntry, DietaryProfileRecord, AllergenRuleRecord, SharedRecipeRecord, BrandKit } from './types';
import { generateUUID } from './utils';

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
  prepInstructions: string[];
  storageLocation?: string;
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
  leftoverStorage?: string;
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
  pageTemplateId?: string;
  recipeTemplateId?: string;
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

interface TemplateSectionStyle {
  fontSize?: number;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  showStepNumbers?: boolean;
  groupAsTabs?: boolean;
}

interface TemplateSectionRecord {
  id: string;
  type: 'title' | 'ingredients' | 'instructions' | 'nutrition-label' | 'nutrition-summary' | 'servings-info' | 'image' | 'notes' | 'divider' | 'column-divider' | 'chapter-title' | 'page-content' | 'page-number' | 'custom-text';
  visible: boolean;
  order: number;
  column: 1 | 2;
  style: TemplateSectionStyle;
}

interface TemplateThemeRecord {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  borderRadius: number;
}

interface TemplateLayoutRecord {
  pageSize: 'card' | 'a4' | 'letter' | 'custom';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  sections: TemplateSectionRecord[];
  theme: TemplateThemeRecord;
}

interface TemplateRecord {
  id: string;
  name: string;
  type: 'recipe' | 'book-page' | 'book-recipe';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  layout: TemplateLayoutRecord;
}

type DaySlot = 'morning' | 'midMorning' | 'noon' | 'afternoon' | 'evening' | 'night';

interface MealPlanRecord {
  id: string;
  name: string;
  weekStart: string;
  slotTimes?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface DayPlanEntryRecord {
  id: string;
  mealPlanId: string;
  date: string;
  slot: DaySlot;
  recipeId: string | null;
  position: number;
  groupId: string | null;
  servings: number;
  isLeftover: boolean;
  sourceType: 'recipe' | 'food' | 'customFood' | 'manual';
  foodName?: string;
  calories?: number;
  totalFat?: number;
  saturatedFat?: number;
  transFat?: number;
  cholesterol?: number;
  sodium?: number;
  totalCarbs?: number;
  dietaryFiber?: number;
  totalSugars?: number;
  addedSugars?: number;
  protein?: number;
  vitaminD?: number;
  calcium?: number;
  iron?: number;
  potassium?: number;
}

interface MealGroupRecord {
  id: string;
  mealPlanId: string;
  date: string;
  slot: DaySlot;
  name: string;
  position: number;
}

interface GroceryChecklistRecord {
  id: string;
  weekStart: string;
  checkedItems: string[];
  updatedAt: string;
}

interface SeasonalFoodsRecord {
  id: string;
  country: string;
  region: string;
  month: number;
  foods: string[];
}

interface PantryStapleRecord {
  id: string;
  name: string;
}

interface UserLocationRecord {
  id: string;
  country: string;
  region: string;
  updatedAt: string;
}

interface CustomFoodRecord {
  id: string;
  name: string;
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
  createdAt: string;
}

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
type MealSlot = 'morning' | 'midMorning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'snack';
type FoodSourceType = 'recipe' | 'customFood' | 'manual';

type BmrEquation = 'auto' | 'mifflin' | 'harrisBenedict' | 'owen' | 'indirectCalorimetry';

interface NutritionProfileRecord {
  id: string;
  name: string;
  sex: 'male' | 'female';
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: ActivityLevel;
  goalWeightKg: number | null;
  goalDate: string | null;
  bmrEquation?: BmrEquation;
  manualBmrValue?: number | null;
  calorieTarget?: number | null;
  proteinGoalG?: number;
  carbsGoalG?: number;
  fatGoalG?: number;
  fiberGoalG?: number;
  sodiumMaxMg?: number;
  sugarMaxG?: number;
  vitaminDGoalUg?: number;
  calciumGoalMg?: number;
  ironGoalMg?: number;
  potassiumGoalMg?: number;
  createdAt: string;
  updatedAt: string;
}

interface FoodLogEntryRecord {
  id: string;
  profileId: string;
  date: string;
  time?: string;
  mealSlot: MealSlot;
  sourceType: FoodSourceType;
  sourceId: string | null;
  name: string;
  servings: number;
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
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WeightEntryRecord {
  id: string;
  profileId: string;
  date: string;
  weightKg: number;
  notes: string | null;
  lastSyncedAt: string | null;
  bloodSugar?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  measurementContext?: 'fasting' | 'postMeal' | 'random';
  createdAt: string;
  updatedAt: string;
}

interface AppSettingsRecord {
  id: string;
  defaultMealSlotTimes: Record<string, string>;
  updatedAt: string;
}

interface DietLedgerDB extends DBSchema {
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
  templates: {
    key: string;
    value: TemplateRecord;
    indexes: { 'by-type': string };
  };
  mealPlans: {
    key: string;
    value: MealPlanRecord;
    indexes: { 'by-weekStart': string };
  };
  dayPlanEntries: {
    key: string;
    value: DayPlanEntryRecord;
    indexes: {
      'by-mealPlanId': string;
      'by-date': string;
    };
  };
  mealGroups: {
    key: string;
    value: MealGroupRecord;
    indexes: { 'by-mealPlanId': string };
  };
  groceryChecklists: {
    key: string;
    value: GroceryChecklistRecord;
    indexes: { 'by-weekStart': string };
  };
  seasonalFoods: {
    key: string;
    value: SeasonalFoodsRecord;
    indexes: { 'by-country-region-month': [string, string, number] };
  };
  pantryStaples: {
    key: string;
    value: PantryStapleRecord;
    indexes: { 'by-name': string };
  };
  userLocation: {
    key: string;
    value: UserLocationRecord;
  };
  customFoods: {
    key: string;
    value: CustomFoodRecord;
    indexes: { 'by-name': string };
  };
  nutritionProfiles: {
    key: string;
    value: NutritionProfileRecord;
    indexes: { 'by-updatedAt': string };
  };
  foodLogEntries: {
    key: string;
    value: FoodLogEntryRecord;
    indexes: {
      'by-profileId': string;
      'by-date': string;
      'by-profileId-date': [string, string];
      'by-sourceType-sourceId': [string, string];
    };
  };
  weightEntries: {
    key: string;
    value: WeightEntryRecord;
    indexes: {
      'by-profileId': string;
      'by-date': string;
      'by-profileId-date': [string, string];
    };
  };
  syncServers: {
    key: string;
    value: SyncServerConfig;
  };
  syncChangeLog: {
    key: string;
    value: SyncChangeLogEntry;
    indexes: {
      'by-synced': string;
      'by-storeName': string;
      'by-timestamp': string;
    };
  };
  dietaryProfiles: {
    key: string;
    value: DietaryProfileRecord;
    indexes: { 'by-updatedAt': string };
  };
  allergenRules: {
    key: string;
    value: AllergenRuleRecord;
    indexes: { 'by-profileId': string };
  };
  sharedRecipeCache: {
    key: string;
    value: SharedRecipeRecord;
    indexes: { 'by-recipeId': string; 'by-shareToken': string };
  };
  brandKits: {
    key: string;
    value: BrandKit;
    indexes: { 'by-updatedAt': string };
  };
  appSettings: {
    key: string;
    value: AppSettingsRecord;
  };
}

const DB_NAME = 'dietledger-db';
const DB_VERSION = 13;

let dbPromise: Promise<IDBPDatabase<DietLedgerDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<DietLedgerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DietLedgerDB>(DB_NAME, DB_VERSION, {
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
        if (oldVersion < 5) {
          const templateStore = db.createObjectStore('templates', { keyPath: 'id' });
          templateStore.createIndex('by-type', 'type');
        }
        if (oldVersion < 6) {
          const mealPlanStore = db.createObjectStore('mealPlans', { keyPath: 'id' });
          mealPlanStore.createIndex('by-weekStart', 'weekStart');

          const dayPlanEntryStore = db.createObjectStore('dayPlanEntries', { keyPath: 'id' });
          dayPlanEntryStore.createIndex('by-mealPlanId', 'mealPlanId');
          dayPlanEntryStore.createIndex('by-date', 'date');

          const mealGroupStore = db.createObjectStore('mealGroups', { keyPath: 'id' });
          mealGroupStore.createIndex('by-mealPlanId', 'mealPlanId');

          const groceryChecklistStore = db.createObjectStore('groceryChecklists', { keyPath: 'id' });
          groceryChecklistStore.createIndex('by-weekStart', 'weekStart');
        }
        if (oldVersion < 7) {
          const seasonalFoodsStore = db.createObjectStore('seasonalFoods', { keyPath: 'id' });
          seasonalFoodsStore.createIndex('by-country-region-month', ['country', 'region', 'month']);

          const pantryStaplesStore = db.createObjectStore('pantryStaples', { keyPath: 'id' });
          pantryStaplesStore.createIndex('by-name', 'name');

          db.createObjectStore('userLocation', { keyPath: 'id' });
        }
        if (oldVersion < 8) {
          const customFoodsStore = db.createObjectStore('customFoods', { keyPath: 'id' });
          customFoodsStore.createIndex('by-name', 'name');
        }
        if (oldVersion < 9) {
          const profileStore = db.createObjectStore('nutritionProfiles', { keyPath: 'id' });
          profileStore.createIndex('by-updatedAt', 'updatedAt');

          const foodLogStore = db.createObjectStore('foodLogEntries', { keyPath: 'id' });
          foodLogStore.createIndex('by-profileId', 'profileId');
          foodLogStore.createIndex('by-date', 'date');
          foodLogStore.createIndex('by-profileId-date', ['profileId', 'date']);
          foodLogStore.createIndex('by-sourceType-sourceId', ['sourceType', 'sourceId']);

          const weightStore = db.createObjectStore('weightEntries', { keyPath: 'id' });
          weightStore.createIndex('by-profileId', 'profileId');
          weightStore.createIndex('by-date', 'date');
          weightStore.createIndex('by-profileId-date', ['profileId', 'date']);
        }
        if (oldVersion < 10) {
          db.createObjectStore('syncServers', { keyPath: 'id' });

          const changeLogStore = db.createObjectStore('syncChangeLog', { keyPath: 'id' });
          changeLogStore.createIndex('by-synced', 'synced');
          changeLogStore.createIndex('by-storeName', 'storeName');
          changeLogStore.createIndex('by-timestamp', 'timestamp');
        }
        if (oldVersion < 11) {
          const dietaryProfileStore = db.createObjectStore('dietaryProfiles', { keyPath: 'id' });
          dietaryProfileStore.createIndex('by-updatedAt', 'updatedAt');

          const allergenRuleStore = db.createObjectStore('allergenRules', { keyPath: 'id' });
          allergenRuleStore.createIndex('by-profileId', 'profileId');

          const sharedRecipeCacheStore = db.createObjectStore('sharedRecipeCache', { keyPath: 'id' });
          sharedRecipeCacheStore.createIndex('by-recipeId', 'recipeId');
          sharedRecipeCacheStore.createIndex('by-shareToken', 'shareToken');

          const brandKitStore = db.createObjectStore('brandKits', { keyPath: 'id' });
          brandKitStore.createIndex('by-updatedAt', 'updatedAt');
        }
        if (oldVersion < 12) {
          // nutritionProfiles gains optional fields bmrEquation, manualBmrValue, calorieTarget
          // IndexedDB object stores are schemaless, so no structural change needed
        }
        if (oldVersion < 13) {
          db.createObjectStore('appSettings', { keyPath: 'id' });
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
    if (ing.prepInstructions === undefined) ing.prepInstructions = [];
  }
}

export async function createRecipe(name: string): Promise<RecipeRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const recipe: RecipeRecord = {
    id: generateUUID(),
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
  await logChange('recipes', recipe.id, 'upsert', recipe);
  return recipe;
}

export async function updateRecipe(
  id: string,
  data: { name?: string; servings?: number; servingName?: string; instructions?: string; ingredients?: IngredientRecord[]; ingredientGroups?: IngredientGroup[]; leftoverStorage?: string }
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
  if (data.leftoverStorage !== undefined) recipe.leftoverStorage = data.leftoverStorage;
  recipe.updatedAt = new Date().toISOString();

  await db.put('recipes', recipe);
  await logChange('recipes', recipe.id, 'upsert', recipe);
  return recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('recipes', id);
  await logChange('recipes', id, 'delete');
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
    id: generateUUID(),
    recipeId,
    ...ingredient,
  };

  recipe.ingredients.push(newIngredient);
  recipe.updatedAt = new Date().toISOString();

  await db.put('recipes', recipe);
  await logChange('recipes', recipe.id, 'upsert', recipe);
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
  await logChange('recipes', recipe.id, 'upsert', recipe);
}

export async function updateIngredient(
  recipeId: string,
  ingredientId: string,
  data: { name?: string; description?: string; amount?: number; unit?: string; calories?: number; totalFat?: number; saturatedFat?: number; transFat?: number; cholesterol?: number; sodium?: number; totalCarbs?: number; dietaryFiber?: number; totalSugars?: number; addedSugars?: number; protein?: number; vitaminD?: number; calcium?: number; iron?: number; potassium?: number; prepInstructions?: string[]; storageLocation?: string }
): Promise<IngredientRecord> {
  const db = await getDB();
  const recipe = await db.get('recipes', recipeId);
  if (!recipe) throw new Error('Recipe not found');

  const idx = recipe.ingredients.findIndex((i) => i.id === ingredientId);
  if (idx === -1) throw new Error('Ingredient not found');

  const ingredient = recipe.ingredients[idx];
  if (data.name !== undefined) ingredient.name = data.name;
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
  if (data.prepInstructions !== undefined) ingredient.prepInstructions = data.prepInstructions;
  if (data.storageLocation !== undefined) ingredient.storageLocation = data.storageLocation;

  recipe.updatedAt = new Date().toISOString();
  await db.put('recipes', recipe);
  await logChange('recipes', recipe.id, 'upsert', recipe);
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
    id: generateUUID(),
    title: title.trim(),
    description: (description || '').trim(),
    coverColor: coverColor || '#059669',
    createdAt: now,
    updatedAt: now,
  };
  await db.put('books', book);
  await logChange('books', book.id, 'upsert', book);
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
  await logChange('books', book.id, 'upsert', book);
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
  await logChange('books', id, 'delete');
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
    id: generateUUID(),
    bookId,
    title: title.trim(),
    position: existing.length,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('chapters', chapter);
  await logChange('chapters', chapter.id, 'upsert', chapter);
  return chapter;
}

export async function updateChapter(
  id: string,
  data: { title?: string; position?: number; pageTemplateId?: string | null; recipeTemplateId?: string | null }
): Promise<ChapterRecord> {
  const db = await getDB();
  const chapter = await db.get('chapters', id);
  if (!chapter) throw new Error('Chapter not found');

  if (data.title !== undefined) chapter.title = data.title.trim();
  if (data.position !== undefined) chapter.position = data.position;
  if (data.pageTemplateId !== undefined) chapter.pageTemplateId = data.pageTemplateId ?? undefined;
  if (data.recipeTemplateId !== undefined) chapter.recipeTemplateId = data.recipeTemplateId ?? undefined;
  chapter.updatedAt = new Date().toISOString();

  await db.put('chapters', chapter);
  await logChange('chapters', chapter.id, 'upsert', chapter);
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
  await logChange('chapters', id, 'delete');
}

export async function reorderChapters(bookId: string, chapterIds: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chapters', 'readwrite');
  const updated: ChapterRecord[] = [];
  for (let i = 0; i < chapterIds.length; i++) {
    const chapter = await tx.store.get(chapterIds[i]);
    if (chapter && chapter.bookId === bookId) {
      chapter.position = i;
      chapter.updatedAt = new Date().toISOString();
      await tx.store.put(chapter);
      updated.push(chapter);
    }
  }
  await tx.done;
  for (const ch of updated) {
    await logChange('chapters', ch.id, 'upsert', ch);
  }
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
    id: generateUUID(),
    chapterId,
    recipeId,
    position: existing.length,
  };
  await db.put('chapterRecipes', record);
  await logChange('chapterRecipes', record.id, 'upsert', record);
  return record;
}

export async function removeRecipeFromChapter(chapterId: string, recipeId: string): Promise<void> {
  const db = await getDB();
  const records = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const target = records.find(r => r.recipeId === recipeId);
  if (target) {
    await db.delete('chapterRecipes', target.id);
    await logChange('chapterRecipes', target.id, 'delete');
  }
}

export async function reorderChapterRecipes(chapterId: string, recipeIds: string[]): Promise<void> {
  const db = await getDB();
  const records = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const tx = db.transaction('chapterRecipes', 'readwrite');
  const updated: ChapterRecipeRecord[] = [];
  for (let i = 0; i < recipeIds.length; i++) {
    const record = records.find(r => r.recipeId === recipeIds[i]);
    if (record) {
      record.position = i;
      await tx.store.put(record);
      updated.push(record);
    }
  }
  await tx.done;
  for (const r of updated) {
    await logChange('chapterRecipes', r.id, 'upsert', r);
  }
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
    id: generateUUID(),
    chapterId,
    title: title.trim(),
    content,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('chapterPages', page);
  await logChange('chapterPages', page.id, 'upsert', page);
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
  await logChange('chapterPages', page.id, 'upsert', page);
  return page;
}

export async function deleteChapterPage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('chapterPages', id);
  await logChange('chapterPages', id, 'delete');
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
    id: generateUUID(),
    bookId,
    title: title.trim(),
    content,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('bookPages', page);
  await logChange('bookPages', page.id, 'upsert', page);
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
  await logChange('bookPages', page.id, 'upsert', page);
  return page;
}

export async function deleteBookPage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('bookPages', id);
  await logChange('bookPages', id, 'delete');
}

export async function reorderBookLevelItems(
  bookId: string,
  items: Array<{ id: string; type: 'chapter' | 'book-page' }>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['chapters', 'bookPages'], 'readwrite');
  const now = new Date().toISOString();
  const logEntries: Array<{ storeName: string; record: ChapterRecord | BookPageRecord }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'chapter') {
      const chapter = await tx.objectStore('chapters').get(item.id);
      if (chapter && chapter.bookId === bookId) {
        chapter.position = i;
        chapter.updatedAt = now;
        await tx.objectStore('chapters').put(chapter);
        logEntries.push({ storeName: 'chapters', record: chapter });
      }
    } else {
      const page = await tx.objectStore('bookPages').get(item.id);
      if (page && page.bookId === bookId) {
        page.position = i;
        page.updatedAt = now;
        await tx.objectStore('bookPages').put(page);
        logEntries.push({ storeName: 'bookPages', record: page });
      }
    }
  }
  await tx.done;
  for (const entry of logEntries) {
    await logChange(entry.storeName, entry.record.id, 'upsert', entry.record);
  }
}

export async function reorderChapterItems(
  chapterId: string,
  items: Array<{ type: 'recipe'; recipeId: string } | { type: 'page'; pageId: string }>
): Promise<void> {
  const db = await getDB();
  const recipeRecords = await db.getAllFromIndex('chapterRecipes', 'by-chapterId', chapterId);
  const tx = db.transaction(['chapterRecipes', 'chapterPages'], 'readwrite');
  const now = new Date().toISOString();
  const logEntries: Array<{ storeName: string; record: ChapterRecipeRecord | ChapterPageRecord }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'recipe') {
      const record = recipeRecords.find(r => r.recipeId === item.recipeId);
      if (record) {
        record.position = i;
        await tx.objectStore('chapterRecipes').put(record);
        logEntries.push({ storeName: 'chapterRecipes', record });
      }
    } else {
      const page = await tx.objectStore('chapterPages').get(item.pageId);
      if (page && page.chapterId === chapterId) {
        page.position = i;
        page.updatedAt = now;
        await tx.objectStore('chapterPages').put(page);
        logEntries.push({ storeName: 'chapterPages', record: page });
      }
    }
  }
  await tx.done;
  for (const entry of logEntries) {
    await logChange(entry.storeName, entry.record.id, 'upsert', entry.record);
  }
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
    id: generateUUID(),
    chapterId: toChapterId,
    recipeId: existing.recipeId,
    position,
  };

  const tx = db.transaction('chapterRecipes', 'readwrite');
  await tx.store.delete(chapterRecipeId);
  await tx.store.put(newRecord);
  await tx.done;
  await logChange('chapterRecipes', newRecord.id, 'upsert', newRecord);
  await logChange('chapterRecipes', chapterRecipeId, 'delete');

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
    id: generateUUID(),
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
  await logChange('chapterPages', chapterPageId, 'delete');
  await logChange('bookPages', bookPage.id, 'upsert', bookPage);

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
    id: generateUUID(),
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
  await logChange('bookPages', bookPageId, 'delete');
  await logChange('chapterPages', chapterPage.id, 'upsert', chapterPage);

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
    id: generateUUID(),
    name: name.trim(),
    parentId: parentId || null,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('categories', category);
  await logChange('categories', category.id, 'upsert', category);
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
  await logChange('categories', category.id, 'upsert', category);
  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  await deleteCategoryCascade(db, id);
  await logChange('categories', id, 'delete');
}

async function deleteCategoryCascade(db: IDBPDatabase<DietLedgerDB>, id: string): Promise<void> {
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
    id: generateUUID(),
    recipeId,
    categoryId,
  };
  await db.put('recipeCategories', record);
  await logChange('recipeCategories', record.id, 'upsert', record);
  return record;
}

export async function removeCategoryFromRecipe(recipeId: string, categoryId: string): Promise<void> {
  const db = await getDB();
  const records = await db.getAllFromIndex('recipeCategories', 'by-recipeId', recipeId);
  const target = records.find(r => r.categoryId === categoryId);
  if (target) {
    await db.delete('recipeCategories', target.id);
    await logChange('recipeCategories', target.id, 'delete');
  }
}

// ── Category Descendants ──────────────────────────────────────────────

export async function getCategoryDescendants(categoryId: string): Promise<string[]> {
  const db = await getDB();
  const all = await db.getAll('categories');
  const ids = new Set<string>([categoryId]);
  const queue = [categoryId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    const children = all.filter(c => c.parentId === current);
    for (const child of children) {
      if (!ids.has(child.id)) {
        ids.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return [...ids];
}

// ── Template CRUD ────────────────────────────────────────────────────

function makeSection(
  type: TemplateSectionRecord['type'],
  order: number,
  column: 1 | 2,
  overrides?: Partial<TemplateSectionRecord['style']>,
): TemplateSectionRecord {
  return {
    id: generateUUID(),
    type,
    visible: true,
    order,
    column,
    style: overrides || {},
  };
}

const DEFAULT_THEME: TemplateThemeRecord = {
  primaryColor: '#059669',
  backgroundColor: '#ffffff',
  textColor: '#1c1917',
  accentColor: '#059669',
  fontFamily: 'inherit',
  borderRadius: 8,
};

function buildSeedTemplates(): TemplateRecord[] {
  const now = new Date().toISOString();

  const classicCard: TemplateRecord = {
    id: generateUUID(),
    name: 'Classic Card',
    type: 'recipe',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    layout: {
      pageSize: 'card',
      orientation: 'portrait',
      margins: { top: 16, right: 16, bottom: 16, left: 16 },
      sections: [
        makeSection('title', 0, 1, { fontSize: 22, fontWeight: '700', textAlign: 'center' }),
        makeSection('servings-info', 1, 1, { fontSize: 12, textAlign: 'center' }),
        makeSection('divider', 2, 1),
        makeSection('ingredients', 3, 1, { fontSize: 13 }),
        makeSection('instructions', 4, 2, { fontSize: 13, showStepNumbers: true }),
        makeSection('divider', 5, 1),
        makeSection('nutrition-label', 6, 1),
      ],
      theme: { ...DEFAULT_THEME, primaryColor: '#059669', accentColor: '#059669' },
    },
  };

  const fullPage: TemplateRecord = {
    id: generateUUID(),
    name: 'Full Page',
    type: 'recipe',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    layout: {
      pageSize: 'letter',
      orientation: 'portrait',
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      sections: [
        makeSection('title', 0, 1, { fontSize: 28, fontWeight: '700', textAlign: 'center' }),
        makeSection('servings-info', 1, 1, { fontSize: 14, textAlign: 'center' }),
        makeSection('divider', 2, 1),
        makeSection('ingredients', 3, 1, { fontSize: 14, fontWeight: '600' }),
        makeSection('divider', 4, 1),
        makeSection('instructions', 5, 1, { fontSize: 14, showStepNumbers: true }),
        makeSection('divider', 6, 1),
        makeSection('nutrition-label', 7, 1),
      ],
      theme: { ...DEFAULT_THEME, primaryColor: '#1c1917', accentColor: '#059669' },
    },
  };

  const minimal: TemplateRecord = {
    id: generateUUID(),
    name: 'Minimal',
    type: 'recipe',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    layout: {
      pageSize: 'card',
      orientation: 'portrait',
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
      sections: [
        makeSection('title', 0, 1, { fontSize: 18, fontWeight: '700' }),
        makeSection('servings-info', 1, 1, { fontSize: 11 }),
        makeSection('ingredients', 2, 1, { fontSize: 12 }),
        makeSection('instructions', 3, 1, { fontSize: 12, showStepNumbers: true }),
      ],
      theme: { ...DEFAULT_THEME, borderRadius: 4 },
    },
  };

  const splitView: TemplateRecord = {
    id: generateUUID(),
    name: 'Split View',
    type: 'recipe',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    layout: {
      pageSize: 'letter',
      orientation: 'portrait',
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      sections: [
        makeSection('title', 0, 1, { fontSize: 24, fontWeight: '700' }),
        makeSection('servings-info', 1, 1, { fontSize: 12 }),
        makeSection('divider', 2, 1),
        makeSection('ingredients', 3, 1, { fontSize: 13 }),
        makeSection('instructions', 4, 1, { fontSize: 13, showStepNumbers: true }),
        makeSection('nutrition-label', 5, 2),
        makeSection('column-divider', 6, 1),
      ],
      theme: { ...DEFAULT_THEME, primaryColor: '#334155', accentColor: '#059669' },
    },
  };

  const chapterLayout: TemplateRecord = {
    id: generateUUID(),
    name: 'Chapter Layout',
    type: 'book-page',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    layout: {
      pageSize: 'a4',
      orientation: 'portrait',
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      sections: [
        makeSection('chapter-title', 0, 1, { fontSize: 24, fontWeight: '700', textAlign: 'center' }),
        makeSection('divider', 1, 1),
        makeSection('page-content', 2, 1, { fontSize: 14 }),
        makeSection('page-number', 3, 1, { fontSize: 10, textAlign: 'center' }),
      ],
      theme: { ...DEFAULT_THEME, primaryColor: '#1e293b', accentColor: '#059669' },
    },
  };

  const booklet: TemplateRecord = {
    id: generateUUID(),
    name: 'Booklet',
    type: 'book-recipe',
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    layout: {
      pageSize: 'card',
      orientation: 'portrait',
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
      sections: [
        makeSection('title', 0, 1, { fontSize: 16, fontWeight: '700' }),
        makeSection('servings-info', 1, 1, { fontSize: 10 }),
        makeSection('ingredients', 2, 1, { fontSize: 11 }),
        makeSection('instructions', 3, 2, { fontSize: 11, showStepNumbers: true }),
        makeSection('nutrition-summary', 4, 1, { fontSize: 10 }),
      ],
      theme: { ...DEFAULT_THEME, borderRadius: 6, primaryColor: '#059669' },
    },
  };

  return [classicCard, fullPage, minimal, splitView, chapterLayout, booklet];
}

let seedPromise: Promise<void> | null = null;
let dedupPromise: Promise<void> | null = null;

async function deduplicateTemplates(): Promise<void> {
  if (dedupPromise) { await dedupPromise; return; }
  dedupPromise = (async () => {
    const db = await getDB();
    const all = await db.getAll('templates');
    const seen = new Set<string>();
    const toDelete: string[] = [];
    for (const t of all) {
      const key = `${t.name}::${t.type}`;
      if (seen.has(key)) {
        toDelete.push(t.id);
      } else {
        seen.add(key);
      }
    }
    if (toDelete.length > 0) {
      const tx = db.transaction('templates', 'readwrite');
      for (const id of toDelete) {
        await tx.store.delete(id);
      }
      await tx.done;
    }
  })();
  await dedupPromise;
}

async function seedTemplatesIfNeeded(): Promise<void> {
  await deduplicateTemplates();
  const db = await getDB();
  const existing = await db.getAll('templates');
  if (existing.length > 0) return;
  if (!seedPromise) {
    seedPromise = (async () => {
      const seeds = buildSeedTemplates();
      const tx = db.transaction('templates', 'readwrite');
      for (const t of seeds) {
        await tx.store.put(t);
      }
      await tx.done;
    })();
  }
  await seedPromise;
}

export async function getAllTemplates(): Promise<TemplateRecord[]> {
  await seedTemplatesIfNeeded();
  const db = await getDB();
  return db.getAll('templates');
}

export async function getTemplatesByType(type: TemplateRecord['type']): Promise<TemplateRecord[]> {
  await seedTemplatesIfNeeded();
  const db = await getDB();
  return db.getAllFromIndex('templates', 'by-type', type);
}

export async function getTemplate(id: string): Promise<TemplateRecord | undefined> {
  const db = await getDB();
  return db.get('templates', id);
}

export async function createTemplate(data: Omit<TemplateRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<TemplateRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const record: TemplateRecord = {
    id: generateUUID(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('templates', record);
  await logChange('templates', record.id, 'upsert', record);
  return record;
}

export async function updateTemplate(
  id: string,
  data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>>,
): Promise<TemplateRecord> {
  const db = await getDB();
  const record = await db.get('templates', id);
  if (!record) throw new Error('Template not found');

  if (data.name !== undefined) record.name = data.name;
  if (data.type !== undefined) record.type = data.type;
  if (data.isDefault !== undefined) record.isDefault = data.isDefault;
  if (data.layout !== undefined) record.layout = data.layout;
  record.updatedAt = new Date().toISOString();

  await db.put('templates', record);
  await logChange('templates', record.id, 'upsert', record);
  return record;
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('templates', id);
  await logChange('templates', id, 'delete');
}

// ── MealPlan CRUD ────────────────────────────────────────────────────

export async function getAllMealPlans(): Promise<MealPlanRecord[]> {
  const db = await getDB();
  const plans = await db.getAll('mealPlans');
  return plans.sort(
    (a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
  );
}

export async function getMealPlan(id: string): Promise<MealPlanRecord | undefined> {
  const db = await getDB();
  return db.get('mealPlans', id);
}

export async function getMealPlanByWeekStart(weekStart: string): Promise<MealPlanRecord | undefined> {
  const db = await getDB();
  const all = await db.getAllFromIndex('mealPlans', 'by-weekStart', weekStart);
  return all[0];
}

export async function createMealPlan(name: string, weekStart: string): Promise<MealPlanRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const plan: MealPlanRecord = {
    id: generateUUID(),
    name: name.trim() || `Week of ${weekStart}`,
    weekStart,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('mealPlans', plan);
  await logChange('mealPlans', plan.id, 'upsert', plan);
  return plan;
}

export async function updateMealPlan(
  id: string,
  data: { name?: string; slotTimes?: Record<string, string> }
): Promise<MealPlanRecord> {
  const db = await getDB();
  const plan = await db.get('mealPlans', id);
  if (!plan) throw new Error('Meal plan not found');
  if (data.name !== undefined) plan.name = data.name.trim();
  if (data.slotTimes !== undefined) plan.slotTimes = data.slotTimes;
  plan.updatedAt = new Date().toISOString();
  await db.put('mealPlans', plan);
  await logChange('mealPlans', plan.id, 'upsert', plan);
  return plan;
}

export async function deleteMealPlan(id: string): Promise<void> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('dayPlanEntries', 'by-mealPlanId', id);
  const groups = await db.getAllFromIndex('mealGroups', 'by-mealPlanId', id);
  const tx = db.transaction(['mealPlans', 'dayPlanEntries', 'mealGroups'], 'readwrite');
  for (const entry of entries) {
    await tx.objectStore('dayPlanEntries').delete(entry.id);
  }
  for (const group of groups) {
    await tx.objectStore('mealGroups').delete(group.id);
  }
  await tx.objectStore('mealPlans').delete(id);
  await tx.done;
  await logChange('mealPlans', id, 'delete');
}

// ── DayPlanEntry CRUD ────────────────────────────────────────────────

export async function getDayEntriesByMealPlanId(mealPlanId: string): Promise<DayPlanEntryRecord[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('dayPlanEntries', 'by-mealPlanId', mealPlanId);
  for (const e of entries) {
    if (e.isLeftover === undefined) e.isLeftover = false;
    if (e.sourceType === undefined) e.sourceType = 'recipe';
  }
  return entries.sort((a, b) => a.position - b.position);
}

export async function getDayEntriesByDate(date: string): Promise<DayPlanEntryRecord[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('dayPlanEntries', 'by-date', date);
  return entries.sort((a, b) => a.position - b.position);
}

export async function createDayPlanEntry(
  mealPlanId: string,
  date: string,
  slot: DaySlot,
  recipeId: string | null,
  position: number,
  options?: {
    sourceType?: 'recipe' | 'food' | 'customFood' | 'manual';
    foodName?: string;
    servings?: number;
    calories?: number;
    totalFat?: number;
    saturatedFat?: number;
    transFat?: number;
    cholesterol?: number;
    sodium?: number;
    totalCarbs?: number;
    dietaryFiber?: number;
    totalSugars?: number;
    addedSugars?: number;
    protein?: number;
    vitaminD?: number;
    calcium?: number;
    iron?: number;
    potassium?: number;
  }
): Promise<DayPlanEntryRecord> {
  const db = await getDB();
  const entry: DayPlanEntryRecord = {
    id: generateUUID(),
    mealPlanId,
    date,
    slot,
    recipeId,
    position,
    groupId: null,
    servings: options?.servings ?? 1,
    isLeftover: false,
    sourceType: options?.sourceType ?? (recipeId ? 'recipe' : 'manual'),
    foodName: options?.foodName,
    calories: options?.calories,
    totalFat: options?.totalFat,
    saturatedFat: options?.saturatedFat,
    transFat: options?.transFat,
    cholesterol: options?.cholesterol,
    sodium: options?.sodium,
    totalCarbs: options?.totalCarbs,
    dietaryFiber: options?.dietaryFiber,
    totalSugars: options?.totalSugars,
    addedSugars: options?.addedSugars,
    protein: options?.protein,
    vitaminD: options?.vitaminD,
    calcium: options?.calcium,
    iron: options?.iron,
    potassium: options?.potassium,
  };
  await db.put('dayPlanEntries', entry);
  await logChange('dayPlanEntries', entry.id, 'upsert', entry);
  return entry;
}

export async function updateDayPlanEntry(
  id: string,
  data: { slot?: DaySlot; position?: number; groupId?: string | null; servings?: number; isLeftover?: boolean }
): Promise<DayPlanEntryRecord> {
  const db = await getDB();
  const entry = await db.get('dayPlanEntries', id);
  if (!entry) throw new Error('Day plan entry not found');
  if (data.slot !== undefined) entry.slot = data.slot;
  if (data.position !== undefined) entry.position = data.position;
  if (data.groupId !== undefined) entry.groupId = data.groupId;
  if (data.servings !== undefined) entry.servings = data.servings;
  if (data.isLeftover !== undefined) entry.isLeftover = data.isLeftover;
  await db.put('dayPlanEntries', entry);
  await logChange('dayPlanEntries', entry.id, 'upsert', entry);
  return entry;
}

export async function deleteDayPlanEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('dayPlanEntries', id);
  await logChange('dayPlanEntries', id, 'delete');
}

export async function putDayPlanEntry(entry: DayPlanEntryRecord): Promise<void> {
  const db = await getDB();
  await db.put('dayPlanEntries', entry);
  await logChange('dayPlanEntries', entry.id, 'upsert', entry);
}

// ── MealGroup CRUD ──────────────────────────────────────────────────

export async function getMealGroupsByMealPlanId(mealPlanId: string): Promise<MealGroupRecord[]> {
  const db = await getDB();
  const groups = await db.getAllFromIndex('mealGroups', 'by-mealPlanId', mealPlanId);
  return groups.sort((a, b) => a.position - b.position);
}

export async function createMealGroup(
  mealPlanId: string,
  date: string,
  slot: DaySlot,
  name: string,
  position: number
): Promise<MealGroupRecord> {
  const db = await getDB();
  const group: MealGroupRecord = {
    id: generateUUID(),
    mealPlanId,
    date,
    slot,
    name: name.trim(),
    position,
  };
  await db.put('mealGroups', group);
  await logChange('mealGroups', group.id, 'upsert', group);
  return group;
}

export async function updateMealGroup(
  id: string,
  data: { name?: string; position?: number }
): Promise<MealGroupRecord> {
  const db = await getDB();
  const group = await db.get('mealGroups', id);
  if (!group) throw new Error('Meal group not found');
  if (data.name !== undefined) group.name = data.name.trim();
  if (data.position !== undefined) group.position = data.position;
  await db.put('mealGroups', group);
  await logChange('mealGroups', group.id, 'upsert', group);
  return group;
}

export async function deleteMealGroup(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('mealGroups', id);
  await logChange('mealGroups', id, 'delete');
}

// ── GroceryChecklist CRUD ───────────────────────────────────────────

export async function getGroceryChecklistByWeekStart(weekStart: string): Promise<GroceryChecklistRecord | undefined> {
  const db = await getDB();
  const all = await db.getAllFromIndex('groceryChecklists', 'by-weekStart', weekStart);
  return all[0];
}

export async function putGroceryChecklist(record: GroceryChecklistRecord): Promise<void> {
  const db = await getDB();
  record.updatedAt = new Date().toISOString();
  await db.put('groceryChecklists', record);
  await logChange('groceryChecklists', record.id, 'upsert', record);
}

export async function createGroceryChecklist(weekStart: string): Promise<GroceryChecklistRecord> {
  const record: GroceryChecklistRecord = {
    id: generateUUID(),
    weekStart,
    checkedItems: [],
    updatedAt: new Date().toISOString(),
  };
  await putGroceryChecklist(record);
  return record;
}

// ── API Key Storage (localStorage) ────────────────────────────────────

const API_KEY_STORAGE_KEY = 'dietledger-fda-api-key';

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

// ── SeasonalFoods CRUD ──────────────────────────────────────────────

export async function getSeasonalFoods(country: string, region: string, month: number): Promise<string[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('seasonalFoods', 'by-country-region-month', [country, region, month]);
  return all.length > 0 ? all[0].foods : [];
}

export async function setSeasonalFoods(country: string, region: string, month: number, foods: string[]): Promise<void> {
  const db = await getDB();
  const existing = await db.getAllFromIndex('seasonalFoods', 'by-country-region-month', [country, region, month]);
  const record: SeasonalFoodsRecord = {
    id: existing.length > 0 ? existing[0].id : generateUUID(),
    country,
    region,
    month,
    foods,
  };
  await db.put('seasonalFoods', record);
}

// ── PantryStaples CRUD ──────────────────────────────────────────────

export async function getAllPantryStaples(): Promise<string[]> {
  const db = await getDB();
  const all = await db.getAll('pantryStaples');
  return all.map(s => s.name).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export async function addPantryStaple(name: string): Promise<void> {
  const db = await getDB();
  const trimmed = name.trim().toLowerCase();
  const existing = await db.getAll('pantryStaples');
  if (existing.some(s => s.name.toLowerCase() === trimmed)) return;
  const record: PantryStapleRecord = {
    id: generateUUID(),
    name: name.trim(),
  };
  await db.put('pantryStaples', record);
  await logChange('pantryStaples', record.id, 'upsert', record);
}

export async function removePantryStaple(name: string): Promise<void> {
  const db = await getDB();
  const all = await db.getAll('pantryStaples');
  const target = all.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
  if (target) {
    await db.delete('pantryStaples', target.id);
    await logChange('pantryStaples', target.id, 'delete');
  }
}

// ── UserLocation CRUD ──────────────────────────────────────────────

export async function getUserLocation(): Promise<UserLocationRecord | undefined> {
  const db = await getDB();
  return db.get('userLocation', 'default');
}

export async function setUserLocation(country: string, region: string): Promise<void> {
  const db = await getDB();
  const record: UserLocationRecord = {
    id: 'default',
    country,
    region,
    updatedAt: new Date().toISOString(),
  };
  await db.put('userLocation', record);
}

// ── Seed Functions ─────────────────────────────────────────────────

export async function seedSeasonalFoodsIfNeeded(country: string, region: string): Promise<void> {
  const db = await getDB();
  const existing = await db.getAllFromIndex('seasonalFoods', 'by-country-region-month', [country, region, 1]);
  if (existing.length > 0) return;

  const { DEFAULT_SEASONAL_FOODS } = await import('@/data/seasonal-produce');
  const regionData = DEFAULT_SEASONAL_FOODS[region];
  if (!regionData) return;

  const tx = db.transaction('seasonalFoods', 'readwrite');
  for (let month = 1; month <= 12; month++) {
    const foods = regionData[month] || [];
    const record: SeasonalFoodsRecord = {
      id: generateUUID(),
      country,
      region,
      month,
      foods,
    };
    await tx.store.put(record);
  }
  await tx.done;
}

export async function seedPantryStaplesIfNeeded(): Promise<void> {
  const db = await getDB();
  const existing = await db.getAll('pantryStaples');
  if (existing.length > 0) return;

  const { DEFAULT_PANTRY_STAPLES } = await import('@/data/pantry-staples');
  const tx = db.transaction('pantryStaples', 'readwrite');
  for (const name of DEFAULT_PANTRY_STAPLES) {
    const record: PantryStapleRecord = {
      id: generateUUID(),
      name,
    };
    await tx.store.put(record);
  }
  await tx.done;
}

// ── Custom Foods CRUD ────────────────────────────────────────────────

export async function getAllCustomFoods(): Promise<CustomFoodRecord[]> {
  const db = await getDB();
  const foods = await db.getAll('customFoods');
  return foods.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addCustomFood(food: Omit<CustomFoodRecord, 'id' | 'createdAt'>): Promise<CustomFoodRecord> {
  const db = await getDB();
  const record: CustomFoodRecord = {
    id: generateUUID(),
    ...food,
    createdAt: new Date().toISOString(),
  };
  await db.put('customFoods', record);
  await logChange('customFoods', record.id, 'upsert', record);
  return record;
}

export async function updateCustomFood(id: string, data: Partial<Omit<CustomFoodRecord, 'id' | 'createdAt'>>): Promise<CustomFoodRecord> {
  const db = await getDB();
  const existing = await db.get('customFoods', id);
  if (!existing) throw new Error('Custom food not found');
  const updated = { ...existing, ...data };
  await db.put('customFoods', updated);
  await logChange('customFoods', updated.id, 'upsert', updated);
  return updated;
}

export async function deleteCustomFood(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('customFoods', id);
  await logChange('customFoods', id, 'delete');
}

// ── NutritionProfile CRUD ────────────────────────────────────────────

export async function getAllNutritionProfiles(): Promise<NutritionProfileRecord[]> {
  const db = await getDB();
  const profiles = await db.getAll('nutritionProfiles');
  return profiles.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getNutritionProfile(id: string): Promise<NutritionProfileRecord | undefined> {
  const db = await getDB();
  return db.get('nutritionProfiles', id);
}

export async function createNutritionProfile(data: Omit<NutritionProfileRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<NutritionProfileRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const record: NutritionProfileRecord = {
    id: generateUUID(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('nutritionProfiles', record);
  await logChange('nutritionProfiles', record.id, 'upsert', record);
  return record;
}

export async function updateNutritionProfile(id: string, data: Partial<Omit<NutritionProfileRecord, 'id' | 'createdAt'>>): Promise<NutritionProfileRecord> {
  const db = await getDB();
  const record = await db.get('nutritionProfiles', id);
  if (!record) throw new Error('Profile not found');
  Object.assign(record, data, { updatedAt: new Date().toISOString() });
  await db.put('nutritionProfiles', record);
  await logChange('nutritionProfiles', record.id, 'upsert', record);
  return record;
}

export async function deleteNutritionProfile(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['nutritionProfiles', 'foodLogEntries', 'weightEntries'], 'readwrite');
  const foodLogs = await tx.objectStore('foodLogEntries').index('by-profileId').getAllKeys(id);
  const weights = await tx.objectStore('weightEntries').index('by-profileId').getAllKeys(id);
  for (const key of foodLogs) await tx.objectStore('foodLogEntries').delete(key);
  for (const key of weights) await tx.objectStore('weightEntries').delete(key);
  await tx.objectStore('nutritionProfiles').delete(id);
  await tx.done;
  await logChange('nutritionProfiles', id, 'delete');
}

// ── FoodLogEntry CRUD ────────────────────────────────────────────────

export async function getAllFoodLogEntries(): Promise<FoodLogEntryRecord[]> {
  const db = await getDB();
  return db.getAll('foodLogEntries');
}

export async function getFoodLogEntry(id: string): Promise<FoodLogEntryRecord | undefined> {
  const db = await getDB();
  return db.get('foodLogEntries', id);
}

export async function createFoodLogEntry(data: Omit<FoodLogEntryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<FoodLogEntryRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const record: FoodLogEntryRecord = {
    id: generateUUID(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('foodLogEntries', record);
  await logChange('foodLogEntries', record.id, 'upsert', record);
  return record;
}

export async function updateFoodLogEntry(id: string, data: Partial<Omit<FoodLogEntryRecord, 'id' | 'createdAt'>>): Promise<FoodLogEntryRecord> {
  const db = await getDB();
  const record = await db.get('foodLogEntries', id);
  if (!record) throw new Error('Food log entry not found');
  Object.assign(record, data, { updatedAt: new Date().toISOString() });
  await db.put('foodLogEntries', record);
  await logChange('foodLogEntries', record.id, 'upsert', record);
  return record;
}

export async function deleteFoodLogEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('foodLogEntries', id);
  await logChange('foodLogEntries', id, 'delete');
}

export async function getFoodLogByProfileAndDate(profileId: string, date: string): Promise<FoodLogEntryRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('foodLogEntries', 'by-profileId-date', [profileId, date]);
}

export async function getFoodLogByProfileAndDateRange(profileId: string, startDate: string, endDate: string): Promise<FoodLogEntryRecord[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound([profileId, startDate], [profileId, endDate]);
  return db.getAllFromIndex('foodLogEntries', 'by-profileId-date', range);
}

// ── WeightEntry CRUD ─────────────────────────────────────────────────

export async function getAllWeightEntries(): Promise<WeightEntryRecord[]> {
  const db = await getDB();
  return db.getAll('weightEntries');
}

export async function getWeightEntry(id: string): Promise<WeightEntryRecord | undefined> {
  const db = await getDB();
  return db.get('weightEntries', id);
}

export async function createWeightEntry(data: Omit<WeightEntryRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<WeightEntryRecord> {
  const db = await getDB();
  const existing = await db.getAllFromIndex('weightEntries', 'by-profileId-date', [data.profileId, data.date]);
  if (existing.length > 0) {
    const record = existing[0];
    Object.assign(record, { weightKg: data.weightKg, notes: data.notes, lastSyncedAt: data.lastSyncedAt, updatedAt: new Date().toISOString() });
    await db.put('weightEntries', record);
    await logChange('weightEntries', record.id, 'upsert', record);
    return record;
  }
  const now = new Date().toISOString();
  const record: WeightEntryRecord = {
    id: generateUUID(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('weightEntries', record);
  await logChange('weightEntries', record.id, 'upsert', record);
  return record;
}

export async function updateWeightEntry(id: string, data: Partial<Omit<WeightEntryRecord, 'id' | 'createdAt'>>): Promise<WeightEntryRecord> {
  const db = await getDB();
  const record = await db.get('weightEntries', id);
  if (!record) throw new Error('Weight entry not found');
  Object.assign(record, data, { updatedAt: new Date().toISOString() });
  await db.put('weightEntries', record);
  await logChange('weightEntries', record.id, 'upsert', record);
  return record;
}

export async function deleteWeightEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('weightEntries', id);
  await logChange('weightEntries', id, 'delete');
}

export async function getWeightByProfile(profileId: string): Promise<WeightEntryRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('weightEntries', 'by-profileId', profileId);
}

export async function getLatestWeight(profileId: string): Promise<WeightEntryRecord | undefined> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('weightEntries', 'by-profileId', profileId);
  if (entries.length === 0) return undefined;
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

// ── DietaryProfile CRUD ──────────────────────────────────────────────

export async function getAllDietaryProfiles(): Promise<DietaryProfileRecord[]> {
  const db = await getDB();
  const profiles = await db.getAll('dietaryProfiles');
  return profiles.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getDietaryProfile(id: string): Promise<DietaryProfileRecord | undefined> {
  const db = await getDB();
  return db.get('dietaryProfiles', id);
}

export async function createDietaryProfile(data: Omit<DietaryProfileRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<DietaryProfileRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const record: DietaryProfileRecord = {
    id: generateUUID(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('dietaryProfiles', record);
  await logChange('dietaryProfiles', record.id, 'upsert', record);
  return record;
}

export async function updateDietaryProfile(id: string, data: Partial<Omit<DietaryProfileRecord, 'id' | 'createdAt'>>): Promise<DietaryProfileRecord> {
  const db = await getDB();
  const record = await db.get('dietaryProfiles', id);
  if (!record) throw new Error('Dietary profile not found');
  Object.assign(record, data, { updatedAt: new Date().toISOString() });
  await db.put('dietaryProfiles', record);
  await logChange('dietaryProfiles', record.id, 'upsert', record);
  return record;
}

export async function deleteDietaryProfile(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['dietaryProfiles', 'allergenRules'], 'readwrite');
  const rules = await tx.objectStore('allergenRules').index('by-profileId').getAllKeys(id);
  for (const key of rules) await tx.objectStore('allergenRules').delete(key);
  await tx.objectStore('dietaryProfiles').delete(id);
  await tx.done;
  await logChange('dietaryProfiles', id, 'delete');
}

// ── AllergenRule CRUD ────────────────────────────────────────────────

export async function getAllergenRulesByProfile(profileId: string): Promise<AllergenRuleRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('allergenRules', 'by-profileId', profileId);
}

export async function createAllergenRule(data: Omit<AllergenRuleRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AllergenRuleRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const record: AllergenRuleRecord = {
    id: generateUUID(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('allergenRules', record);
  await logChange('allergenRules', record.id, 'upsert', record);
  return record;
}

export async function updateAllergenRule(id: string, data: Partial<Omit<AllergenRuleRecord, 'id' | 'createdAt'>>): Promise<AllergenRuleRecord> {
  const db = await getDB();
  const record = await db.get('allergenRules', id);
  if (!record) throw new Error('Allergen rule not found');
  Object.assign(record, data, { updatedAt: new Date().toISOString() });
  await db.put('allergenRules', record);
  await logChange('allergenRules', record.id, 'upsert', record);
  return record;
}

export async function deleteAllergenRule(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('allergenRules', id);
  await logChange('allergenRules', id, 'delete');
}

// ── SharedRecipeCache CRUD ───────────────────────────────────────────

export async function getSharedRecipeByToken(shareToken: string): Promise<SharedRecipeRecord | undefined> {
  const db = await getDB();
  const results = await db.getAllFromIndex('sharedRecipeCache', 'by-shareToken', shareToken);
  return results[0];
}

export async function getSharedRecipeByRecipeId(recipeId: string): Promise<SharedRecipeRecord | undefined> {
  const db = await getDB();
  const results = await db.getAllFromIndex('sharedRecipeCache', 'by-recipeId', recipeId);
  return results[0];
}

export async function putSharedRecipe(record: SharedRecipeRecord): Promise<void> {
  const db = await getDB();
  await db.put('sharedRecipeCache', record);
}

export async function deleteSharedRecipe(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sharedRecipeCache', id);
}

export async function getAllSharedRecipes(): Promise<SharedRecipeRecord[]> {
  const db = await getDB();
  return db.getAll('sharedRecipeCache');
}

// ── BrandKit CRUD ────────────────────────────────────────────────────

export async function getAllBrandKits(): Promise<BrandKit[]> {
  const db = await getDB();
  const kits = await db.getAll('brandKits');
  return kits.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getBrandKit(id: string): Promise<BrandKit | undefined> {
  const db = await getDB();
  return db.get('brandKits', id);
}

export async function createBrandKit(data: Omit<BrandKit, 'id' | 'createdAt' | 'updatedAt'>): Promise<BrandKit> {
  const db = await getDB();
  const now = new Date().toISOString();
  const record: BrandKit = {
    id: generateUUID(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('brandKits', record);
  return record;
}

export async function updateBrandKit(id: string, data: Partial<Omit<BrandKit, 'id' | 'createdAt'>>): Promise<BrandKit> {
  const db = await getDB();
  const record = await db.get('brandKits', id);
  if (!record) throw new Error('Brand kit not found');
  Object.assign(record, data, { updatedAt: new Date().toISOString() });
  await db.put('brandKits', record);
  return record;
}

export async function deleteBrandKit(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('brandKits', id);
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
  TemplateRecord,
  TemplateLayoutRecord as TemplateLayout,
  TemplateSectionRecord as TemplateSection,
  TemplateThemeRecord as TemplateTheme,
  MealPlanRecord,
  DayPlanEntryRecord,
  MealGroupRecord,
  GroceryChecklistRecord,
  SeasonalFoodsRecord,
  PantryStapleRecord,
  UserLocationRecord,
  CustomFoodRecord,
  NutritionProfileRecord,
  FoodLogEntryRecord,
  WeightEntryRecord,
  ActivityLevel,
  MealSlot,
  FoodSourceType,
  BmrEquation,
};

export async function logChange(storeName: string, recordId: string, action: 'upsert' | 'delete', data?: unknown): Promise<void> {
  try {
    const db = await getDB();
    const entry: SyncChangeLogEntry = {
      id: generateUUID(),
      storeName,
      recordId,
      action,
      timestamp: new Date().toISOString(),
      synced: false,
      data: data !== undefined ? JSON.stringify(data) : null,
    };
    await db.put('syncChangeLog', entry);
  } catch {}
}

export async function getUnsyncedChanges(): Promise<SyncChangeLogEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('syncChangeLog', 'by-synced', IDBKeyRange.only('0'));
}

export async function getAllUnsyncedChanges(): Promise<SyncChangeLogEntry[]> {
  const db = await getDB();
  const all = await db.getAll('syncChangeLog');
  return all.filter(e => !e.synced);
}

export async function markChangesSynced(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('syncChangeLog', 'readwrite');
  for (const id of ids) {
    const entry = await tx.store.get(id);
    if (entry) {
      entry.synced = true;
      await tx.store.put(entry);
    }
  }
  await tx.done;
}

export async function clearSyncChangeLog(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('syncChangeLog', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

export async function getAllSyncServers(): Promise<SyncServerConfig[]> {
  const db = await getDB();
  return db.getAll('syncServers');
}

export async function putSyncServer(config: SyncServerConfig): Promise<void> {
  const db = await getDB();
  await db.put('syncServers', config);
}

export async function deleteSyncServer(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('syncServers', id);
}

export async function getAllStoreData(storeName: string): Promise<unknown[]> {
  const db = await getDB();
  const storeNames = [
    'recipes', 'books', 'chapters', 'chapterRecipes', 'categories',
    'recipeCategories', 'chapterPages', 'bookPages', 'templates',
    'mealPlans', 'dayPlanEntries', 'mealGroups', 'groceryChecklists',
    'customFoods', 'nutritionProfiles', 'foodLogEntries', 'weightEntries',
    'dietaryProfiles', 'allergenRules',
  ];
  if (!storeNames.includes(storeName)) return [];
  return db.getAll(storeName as never);
}

export async function putStoreData(storeName: string, records: unknown[]): Promise<void> {
  const db = await getDB();
  const storeNames = [
    'recipes', 'books', 'chapters', 'chapterRecipes', 'categories',
    'recipeCategories', 'chapterPages', 'bookPages', 'templates',
    'mealPlans', 'dayPlanEntries', 'mealGroups', 'groceryChecklists',
    'customFoods', 'nutritionProfiles', 'foodLogEntries', 'weightEntries',
    'dietaryProfiles', 'allergenRules',
  ];
  if (!storeNames.includes(storeName)) return;
  const tx = db.transaction(storeName as never, 'readwrite');
  for (const record of records) {
    await tx.store.put(record);
  }
  await tx.done;
}

export async function deleteStoreRecord(storeName: string, id: string): Promise<void> {
  const db = await getDB();
  const storeNames = [
    'recipes', 'books', 'chapters', 'chapterRecipes', 'categories',
    'recipeCategories', 'chapterPages', 'bookPages', 'templates',
    'mealPlans', 'dayPlanEntries', 'mealGroups', 'groceryChecklists',
    'customFoods', 'nutritionProfiles', 'foodLogEntries', 'weightEntries',
    'dietaryProfiles', 'allergenRules',
  ];
  if (!storeNames.includes(storeName)) return;
  await db.delete(storeName as never, id);
}

export async function getAppSettings(): Promise<AppSettingsRecord | undefined> {
  const db = await getDB();
  return db.get('appSettings', 'default');
}

export async function putAppSettings(settings: AppSettingsRecord): Promise<void> {
  const db = await getDB();
  await db.put('appSettings', settings);
}

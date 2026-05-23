export interface RecipeBook {
  id: string;
  title: string;
  description: string;
  coverColor: string;
  createdAt: string;
  updatedAt: string;
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  chapterRecipes: ChapterRecipe[];
  pageTemplateId?: string;
  recipeTemplateId?: string;
}

export interface ChapterRecipe {
  id: string;
  chapterId: string;
  recipeId: string;
  position: number;
}

export interface ChapterPage {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookPage {
  id: string;
  bookId: string;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  children: Category[];
}

export interface RecipeCategory {
  id: string;
  recipeId: string;
  categoryId: string;
}

export interface TemplateRecord {
  id: string;
  name: string;
  type: 'recipe' | 'book-page' | 'book-recipe';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  layout: TemplateLayout;
}

export interface TemplateLayout {
  pageSize: 'card' | 'a4' | 'letter' | 'custom';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  sections: TemplateSection[];
  theme: TemplateTheme;
}

export interface TemplateSection {
  id: string;
  type: 'title' | 'ingredients' | 'instructions' | 'nutrition-label' | 'nutrition-summary' | 'servings-info' | 'image' | 'notes' | 'divider' | 'column-divider' | 'chapter-title' | 'page-content' | 'page-number' | 'custom-text';
  visible: boolean;
  order: number;
  column: 1 | 2;
  style: {
    fontSize?: number;
    fontWeight?: string;
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
    showStepNumbers?: boolean;
    groupAsTabs?: boolean;
  };
}

export interface TemplateTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  borderRadius: number;
}

export type DaySlot = 'morning' | 'midMorning' | 'noon' | 'afternoon' | 'evening' | 'night';

export type MealSlotTimes = Record<DaySlot, string>;

export const DEFAULT_MEAL_SLOT_TIMES: MealSlotTimes = {
  morning: '07:30',
  midMorning: '09:45',
  noon: '12:00',
  afternoon: '15:30',
  evening: '19:00',
  night: '22:00',
};

export interface MealPlanRecord {
  id: string;
  name: string;
  weekStart: string;
  createdAt: string;
  updatedAt: string;
}

export interface DayPlanEntryRecord {
  id: string;
  mealPlanId: string;
  date: string;
  slot: DaySlot;
  recipeId: string | null;
  position: number;
  groupId: string | null;
  servings: number;
  isLeftover?: boolean;
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

export interface MealGroupRecord {
  id: string;
  mealPlanId: string;
  date: string;
  slot: DaySlot;
  name: string;
  position: number;
}

export interface GroceryChecklistRecord {
  id: string;
  weekStart: string;
  checkedItems: string[];
  updatedAt: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'conflict';

export interface SyncServerConfig {
  id: string;
  label: string;
  serverUrl: string;
  apiKey: string;
  userId: string;
  deviceId: string;
  enabled: boolean;
  autoSync: boolean;
  syncIntervalMinutes: number;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncStatus | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncChangeLogEntry {
  id: string;
  storeName: string;
  recordId: string;
  action: 'upsert' | 'delete';
  timestamp: string;
  synced: boolean;
  data: string | null;
}

export interface SyncConflictRecord {
  id: string;
  storeName: string;
  recordId: string;
  localData: string;
  remoteData: string;
  localVersion: number;
  remoteVersion: number;
  status: 'pending' | 'resolved' | 'auto-resolved';
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export const SYNC_STORE_NAMES = [
  'recipes',
  'books',
  'chapters',
  'chapterRecipes',
  'categories',
  'recipeCategories',
  'chapterPages',
  'bookPages',
  'templates',
  'mealPlans',
  'dayPlanEntries',
  'mealGroups',
  'groceryChecklists',
  'customFoods',
  'nutritionProfiles',
  'foodLogEntries',
  'weightEntries',
  'dietaryProfiles',
  'allergenRules',
] as const;

export type SyncStoreName = (typeof SYNC_STORE_NAMES)[number];

export const BOOK_COLORS = [
  '#059669', '#2563eb', '#7c3aed', '#db2777', '#ea580c',
  '#ca8a04', '#0891b2', '#4f46e5', '#dc2626', '#16a34a',
] as const;

export type BookColor = (typeof BOOK_COLORS)[number];

export type Allergen =
  | 'milk'
  | 'eggs'
  | 'fish'
  | 'shellfish'
  | 'treeNuts'
  | 'peanuts'
  | 'wheat'
  | 'soybeans'
  | 'sesame';

export type DietaryTag =
  | 'vegetarian'
  | 'vegan'
  | 'glutenFree'
  | 'dairyFree'
  | 'nutFree'
  | 'soyFree'
  | 'eggFree'
  | 'keto'
  | 'paleo'
  | 'lowFodmap'
  | 'dASH'
  | 'mediterranean';

export interface AllergenDetection {
  allergen: Allergen;
  matchedKeywords: string[];
  ingredients: string[];
}

export interface NutrientThreshold {
  nutrient: string;
  dailyMax?: number;
  perMealMax?: number;
  alertLevel: 'warning' | 'danger';
}

export interface DietaryProfileRecord {
  id: string;
  name: string;
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
  nutrientThresholds: NutrientThreshold[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AllergenRuleRecord {
  id: string;
  profileId: string;
  allergen: Allergen;
  severity: 'avoid' | 'caution';
  customKeywords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SharedRecipeRecord {
  id: string;
  recipeId: string;
  shareToken: string;
  isPublic: boolean;
  title: string;
  description?: string;
  category?: string;
  tags: string[];
  viewCount: number;
  importCount: number;
  averageRating: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandKit {
  id: string;
  name: string;
  logoDataUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  tagline?: string;
  createdAt: string;
  updatedAt: string;
}

export type ScaleMode = 'servings' | 'multiplier' | 'calorieTarget';

export interface ScaleOptions {
  mode: ScaleMode;
  originalServings: number;
  targetServings?: number;
  multiplier?: number;
  calorieTarget?: number;
  originalCalories?: number;
}

export type IngredientClassification = 'linear' | 'spice' | 'leavening' | 'acid' | 'count';

export interface ScaledIngredient {
  id: string;
  name: string;
  originalAmount: number;
  originalUnit: string;
  scaledAmount: number;
  scaledUnit: string;
  displayAmount: string;
  classification: IngredientClassification;
  scaleReason?: string;
}

export interface ScaledRecipe {
  recipeId: string;
  scaleFactor: number;
  servings: number;
  ingredients: ScaledIngredient[];
  warnings: string[];
}

export interface CookbookExportOptions {
  bookId: string;
  templateId?: string;
  brandKitId?: string;
  pageSize: 'a4' | 'letter';
  includeCover: boolean;
  includeToc: boolean;
  includeIndex: boolean;
  includePageNumbers: boolean;
  onProgress?: (percent: number) => void;
}

export interface NutritionProfileGoals {
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
}

export interface HealthMetrics {
  bloodSugar?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  measurementContext?: 'fasting' | 'postMeal' | 'random';
}

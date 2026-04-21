import { create } from "zustand";
import {
  getAllRecipes,
  getRecipe,
  createRecipe as dbCreateRecipe,
  updateRecipe as dbUpdateRecipe,
  deleteRecipe as dbDeleteRecipe,
  addIngredient as dbAddIngredient,
  removeIngredient as dbRemoveIngredient,
  getStoredApiKey,
  setStoredApiKey as dbSetApiKey,
  type RecipeRecord,
  type IngredientRecord,
} from "@/lib/storage";
import { searchFDAFoods, type FDASearchResult } from "@/lib/fda-client";

// ── Public Types ──────────────────────────────────────────────────────

interface Ingredient {
  id: string;
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

interface Recipe {
  id: string;
  name: string;
  servings: number;
  instructions: string | null;
  createdAt: string;
  updatedAt: string;
  ingredients: Ingredient[];
}

interface FDAFood {
  fdcId: number;
  description: string;
  brandOwner: string | null;
  dataType: string;
  servingSize: number;
  servingSizeUnit: string;
  nutrients: {
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

// ── Helpers ───────────────────────────────────────────────────────────

function toPublicRecipe(r: RecipeRecord): Recipe {
  return {
    ...r,
    ingredients: r.ingredients.map((i) => ({ ...i })),
  };
}

function toPublicFDAFood(r: FDASearchResult): FDAFood {
  return { ...r };
}

// ── Unit conversion to grams ──────────────────────────────────────────

const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  oz: 28.35,
  lb: 453.6,
  cup: 240,    // approximate for water-like density
  tbsp: 15,
  tsp: 5,
  ml: 1,
  whole: 100,  // approximate; user should adjust amount
};

function convertToGrams(amount: number, unit: string): number {
  const factor = UNIT_TO_GRAMS[unit.toLowerCase()] || 1;
  return amount * factor;
}

// ── Store Interface ───────────────────────────────────────────────────

interface RecipeState {
  recipes: Recipe[];
  activeRecipe: Recipe | null;
  isSearching: boolean;
  searchResults: FDAFood[];
  searchSource: 'fda' | 'fallback' | null;
  isLoading: boolean;
  error: string | null;
  apiKey: string;

  fetchRecipes: () => Promise<void>;
  createRecipe: (name: string) => Promise<void>;
  selectRecipe: (id: string) => Promise<void>;
  updateRecipe: (data: {
    name?: string;
    servings?: number;
    instructions?: string;
  }) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  searchFDA: (query: string) => Promise<void>;
  addIngredient: (food: FDAFood, amount: number, unit: string) => Promise<void>;
  removeIngredient: (ingredientId: string) => Promise<void>;
  getTotalNutrition: () => {
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
  setApiKey: (key: string) => void;
  loadApiKey: () => void;
}

// ── Store Implementation ─────────────────────────────────────────────

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipes: [],
  activeRecipe: null,
  isSearching: false,
  searchResults: [],
  searchSource: null,
  isLoading: false,
  error: null,
  apiKey: 'DEMO_KEY',

  loadApiKey: () => {
    set({ apiKey: getStoredApiKey() });
  },

  setApiKey: (key: string) => {
    dbSetApiKey(key);
    set({ apiKey: key || 'DEMO_KEY' });
  },

  fetchRecipes: async () => {
    set({ isLoading: true, error: null });
    try {
      const recipes = await getAllRecipes();
      set({ recipes: recipes.map(toPublicRecipe), isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  createRecipe: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      const recipe = await dbCreateRecipe(name);
      const publicRecipe = toPublicRecipe(recipe);
      set((state) => ({
        recipes: [publicRecipe, ...state.recipes],
        activeRecipe: publicRecipe,
        isLoading: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  selectRecipe: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const recipe = await getRecipe(id);
      if (!recipe) throw new Error("Recipe not found");
      set({ activeRecipe: toPublicRecipe(recipe), isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  updateRecipe: async (data) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    set({ isLoading: true, error: null });
    try {
      const updated = await dbUpdateRecipe(activeRecipe.id, data);
      const publicUpdated = toPublicRecipe(updated);
      set((state) => ({
        activeRecipe: publicUpdated,
        recipes: state.recipes.map((r) =>
          r.id === publicUpdated.id ? publicUpdated : r
        ),
        isLoading: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  deleteRecipe: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await dbDeleteRecipe(id);
      set((state) => ({
        recipes: state.recipes.filter((r) => r.id !== id),
        activeRecipe: state.activeRecipe?.id === id ? null : state.activeRecipe,
        isLoading: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  searchFDA: async (query: string) => {
    set({ isSearching: true, error: null, searchResults: [], searchSource: null });
    try {
      const result = await searchFDAFoods(query);
      set({
        searchResults: result.foods.map(toPublicFDAFood),
        searchSource: result.source === 'fallback' ? 'fallback' : 'fda',
        isSearching: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isSearching: false,
        searchSource: null,
      });
    }
  },

  addIngredient: async (food: FDAFood, amount: number, unit: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    set({ isLoading: true, error: null });
    try {
      // Scale nutrients: FDA data is per 100g, so convert amount to grams first
      const grams = convertToGrams(amount, unit);
      const scaleFactor = grams / 100;

      const scaleVal = (val: number) => {
        const v = parseFloat(String(val)) || 0;
        return Math.round(v * scaleFactor * 100) / 100;
      };

      const ingredientData = {
        fdcId: food.fdcId,
        name: food.description,
        amount,
        unit,
        calories: scaleVal(food.nutrients.calories),
        totalFat: scaleVal(food.nutrients.totalFat),
        saturatedFat: scaleVal(food.nutrients.saturatedFat),
        transFat: scaleVal(food.nutrients.transFat),
        cholesterol: scaleVal(food.nutrients.cholesterol),
        sodium: scaleVal(food.nutrients.sodium),
        totalCarbs: scaleVal(food.nutrients.totalCarbs),
        dietaryFiber: scaleVal(food.nutrients.dietaryFiber),
        totalSugars: scaleVal(food.nutrients.totalSugars),
        addedSugars: scaleVal(food.nutrients.addedSugars),
        protein: scaleVal(food.nutrients.protein),
        vitaminD: scaleVal(food.nutrients.vitaminD),
        calcium: scaleVal(food.nutrients.calcium),
        iron: scaleVal(food.nutrients.iron),
        potassium: scaleVal(food.nutrients.potassium),
      };

      const newIngredient = await dbAddIngredient(activeRecipe.id, ingredientData);

      const updatedRecipe: Recipe = {
        ...activeRecipe,
        ingredients: [...activeRecipe.ingredients, { ...newIngredient }],
        updatedAt: new Date().toISOString(),
      };

      set((state) => ({
        activeRecipe: updatedRecipe,
        recipes: state.recipes.map((r) =>
          r.id === updatedRecipe.id ? updatedRecipe : r
        ),
        isLoading: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  removeIngredient: async (ingredientId: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    set({ isLoading: true, error: null });
    try {
      await dbRemoveIngredient(activeRecipe.id, ingredientId);
      const updatedRecipe: Recipe = {
        ...activeRecipe,
        ingredients: activeRecipe.ingredients.filter(
          (i) => i.id !== ingredientId
        ),
        updatedAt: new Date().toISOString(),
      };
      set((state) => ({
        activeRecipe: updatedRecipe,
        recipes: state.recipes.map((r) =>
          r.id === updatedRecipe.id ? updatedRecipe : r
        ),
        isLoading: false,
      }));
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        isLoading: false,
      });
    }
  },

  getTotalNutrition: () => {
    const { activeRecipe } = get();
    if (!activeRecipe || activeRecipe.ingredients.length === 0) {
      return {
        calories: 0, totalFat: 0, saturatedFat: 0, transFat: 0,
        cholesterol: 0, sodium: 0, totalCarbs: 0, dietaryFiber: 0,
        totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0,
        calcium: 0, iron: 0, potassium: 0,
      };
    }

    return activeRecipe.ingredients.reduce(
      (totals, ingredient) => ({
        calories: totals.calories + ingredient.calories,
        totalFat: totals.totalFat + ingredient.totalFat,
        saturatedFat: totals.saturatedFat + ingredient.saturatedFat,
        transFat: totals.transFat + ingredient.transFat,
        cholesterol: totals.cholesterol + ingredient.cholesterol,
        sodium: totals.sodium + ingredient.sodium,
        totalCarbs: totals.totalCarbs + ingredient.totalCarbs,
        dietaryFiber: totals.dietaryFiber + ingredient.dietaryFiber,
        totalSugars: totals.totalSugars + ingredient.totalSugars,
        addedSugars: totals.addedSugars + ingredient.addedSugars,
        protein: totals.protein + ingredient.protein,
        vitaminD: totals.vitaminD + ingredient.vitaminD,
        calcium: totals.calcium + ingredient.calcium,
        iron: totals.iron + ingredient.iron,
        potassium: totals.potassium + ingredient.potassium,
      }),
      {
        calories: 0, totalFat: 0, saturatedFat: 0, transFat: 0,
        cholesterol: 0, sodium: 0, totalCarbs: 0, dietaryFiber: 0,
        totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0,
        calcium: 0, iron: 0, potassium: 0,
      }
    );
  },
}));

export type { Recipe, Ingredient, FDAFood, RecipeState };

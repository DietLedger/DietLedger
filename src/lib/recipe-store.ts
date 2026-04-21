import { create } from "zustand";

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

interface RecipeState {
  recipes: Recipe[];
  activeRecipe: Recipe | null;
  isSearching: boolean;
  searchResults: FDAFood[];
  searchSource: 'fda' | 'fallback' | null;
  isLoading: boolean;
  error: string | null;

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
}

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipes: [],
  activeRecipe: null,
  isSearching: false,
  searchResults: [],
  searchSource: null,
  isLoading: false,
  error: null,

  fetchRecipes: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/recipes");
      if (!res.ok) throw new Error("Failed to fetch recipes");
      const recipes: Recipe[] = await res.json();
      set({ recipes, isLoading: false });
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
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create recipe");
      const recipe: Recipe = await res.json();
      set((state) => ({
        recipes: [...state.recipes, recipe],
        activeRecipe: recipe,
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
      const res = await fetch(`/api/recipes/${id}`);
      if (!res.ok) throw new Error("Failed to fetch recipe");
      const recipe: Recipe = await res.json();
      set({ activeRecipe: recipe, isLoading: false });
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
      const res = await fetch(`/api/recipes/${activeRecipe.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update recipe");
      const updated: Recipe = await res.json();
      set((state) => ({
        activeRecipe: updated,
        recipes: state.recipes.map((r) => (r.id === updated.id ? updated : r)),
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
      const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete recipe");
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
      const res = await fetch(`/api/fda/search?query=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Failed to search FDA foods");
      const data = await res.json();
      const results: FDAFood[] = data.foods || [];
      const source = data.source === 'fallback' ? 'fallback' as const : 'fda' as const;
      set({ searchResults: results, searchSource: source, isSearching: false });
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
      const res = await fetch(`/api/recipes/${activeRecipe.id}/ingredients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fdcId: food.fdcId,
          name: food.description,
          amount,
          unit,
          calories: food.nutrients.calories,
          totalFat: food.nutrients.totalFat,
          saturatedFat: food.nutrients.saturatedFat,
          transFat: food.nutrients.transFat,
          cholesterol: food.nutrients.cholesterol,
          sodium: food.nutrients.sodium,
          totalCarbs: food.nutrients.totalCarbs,
          dietaryFiber: food.nutrients.dietaryFiber,
          totalSugars: food.nutrients.totalSugars,
          addedSugars: food.nutrients.addedSugars,
          protein: food.nutrients.protein,
          vitaminD: food.nutrients.vitaminD,
          calcium: food.nutrients.calcium,
          iron: food.nutrients.iron,
          potassium: food.nutrients.potassium,
        }),
      });
      if (!res.ok) throw new Error("Failed to add ingredient");
      const ingredient: Ingredient = await res.json();
      const updatedRecipe: Recipe = {
        ...activeRecipe,
        ingredients: [...activeRecipe.ingredients, ingredient],
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
      const res = await fetch(
        `/api/recipes/${activeRecipe.id}/ingredients/${ingredientId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to remove ingredient");
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
        calories: 0,
        totalFat: 0,
        saturatedFat: 0,
        transFat: 0,
        cholesterol: 0,
        sodium: 0,
        totalCarbs: 0,
        dietaryFiber: 0,
        totalSugars: 0,
        addedSugars: 0,
        protein: 0,
        vitaminD: 0,
        calcium: 0,
        iron: 0,
        potassium: 0,
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
        calories: 0,
        totalFat: 0,
        saturatedFat: 0,
        transFat: 0,
        cholesterol: 0,
        sodium: 0,
        totalCarbs: 0,
        dietaryFiber: 0,
        totalSugars: 0,
        addedSugars: 0,
        protein: 0,
        vitaminD: 0,
        calcium: 0,
        iron: 0,
        potassium: 0,
      }
    );
  },
}));

export type { Recipe, Ingredient, FDAFood, RecipeState };

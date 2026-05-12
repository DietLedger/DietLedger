import { create } from "zustand";
import {
  getAllRecipes,
  getRecipe,
  createRecipe as dbCreateRecipe,
  updateRecipe as dbUpdateRecipe,
  deleteRecipe as dbDeleteRecipe,
  addIngredient as dbAddIngredient,
  removeIngredient as dbRemoveIngredient,
  updateIngredient as dbUpdateIngredient,
  getStoredApiKey,
  setStoredApiKey as dbSetApiKey,
  type RecipeRecord,
  type IngredientRecord,
  type IngredientGroup,
  getAllCustomFoods,
} from "@/lib/storage";
import { searchFDAFoods, type FDASearchResult } from "@/lib/fda-client";

interface InstructionStep {
  id: string;
  text: string;
  groupId: string | null;
}

interface InstructionGroup {
  id: string;
  title: string;
}

interface InstructionsPayload {
  steps: InstructionStep[];
  groups: InstructionGroup[];
}

function parseInstructions(raw: string | null): InstructionsPayload {
  if (!raw) return { steps: [], groups: [] };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        steps: parsed.map((s: { id?: string; text?: string }, i: number) => ({
          id: s.id || `migrated-${i}`,
          text: s.text || '',
          groupId: null,
        })),
        groups: [],
      };
    }
    if (parsed && parsed.steps) {
      return {
        steps: (parsed.steps as { id: string; text: string; groupId?: string | null }[]).map(s => ({
          ...s,
          groupId: s.groupId || null,
        })),
        groups: parsed.groups || [],
      };
    }
  } catch {}
  return { steps: [{ id: 'migrated-0', text: raw, groupId: null }], groups: [] };
}

function serializeInstructions(payload: InstructionsPayload): string | null {
  if (payload.steps.length === 0) return null;
  return JSON.stringify(payload);
}

interface Ingredient {
  id: string;
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
}

interface Recipe {
  id: string;
  name: string;
  servings: number;
  servingName: string;
  instructionSteps: InstructionStep[];
  instructionGroups: InstructionGroup[];
  ingredientGroups: IngredientGroup[];
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

function toPublicRecipe(r: RecipeRecord): Recipe {
  const instr = parseInstructions(r.instructions);
  return {
    ...r,
    instructionSteps: instr.steps,
    instructionGroups: instr.groups,
    ingredientGroups: r.ingredientGroups || [],
    ingredients: r.ingredients.map((i) => ({
      ...i,
      groupId: i.groupId || null,
      linkedRecipeId: i.linkedRecipeId || null,
    })),
  };
}

function toPublicFDAFood(r: FDASearchResult): FDAFood {
  return { ...r };
}

const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  oz: 28.35,
  lb: 453.6,
  cup: 240,
  tbsp: 15,
  tsp: 5,
  ml: 1,
  whole: 100,
};

function convertToGrams(amount: number, unit: string): number {
  const factor = UNIT_TO_GRAMS[unit.toLowerCase()] || 1;
  return amount * factor;
}

type NutrientKeys =
  | 'calories' | 'totalFat' | 'saturatedFat' | 'transFat'
  | 'cholesterol' | 'sodium' | 'totalCarbs' | 'dietaryFiber'
  | 'totalSugars' | 'addedSugars' | 'protein' | 'vitaminD'
  | 'calcium' | 'iron' | 'potassium';

const NUTRIENT_KEYS: NutrientKeys[] = [
  'calories', 'totalFat', 'saturatedFat', 'transFat',
  'cholesterol', 'sodium', 'totalCarbs', 'dietaryFiber',
  'totalSugars', 'addedSugars', 'protein', 'vitaminD',
  'calcium', 'iron', 'potassium',
];

function emptyNutrition(): Record<NutrientKeys, number> {
  return {
    calories: 0, totalFat: 0, saturatedFat: 0, transFat: 0,
    cholesterol: 0, sodium: 0, totalCarbs: 0, dietaryFiber: 0,
    totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0,
    calcium: 0, iron: 0, potassium: 0,
  };
}

function sumNutrition(items: Ingredient[]): Record<NutrientKeys, number> {
  const totals = emptyNutrition();
  for (const ing of items) {
    for (const key of NUTRIENT_KEYS) {
      totals[key] += ing[key];
    }
  }
  return totals;
}

interface RecipeState {
  recipes: Recipe[];
  activeRecipe: Recipe | null;
  isSearching: boolean;
  searchResults: FDAFood[];
  searchSource: 'fda' | 'fallback' | 'local' | null;
  isLoading: boolean;
  error: string | null;
  apiKey: string;

  fetchRecipes: () => Promise<void>;
  createRecipe: (name: string) => Promise<void>;
  selectRecipe: (id: string) => Promise<void>;
  updateRecipe: (data: {
    name?: string;
    servings?: number;
    servingName?: string;
    instructionSteps?: InstructionStep[];
    instructionGroups?: InstructionGroup[];
    leftoverStorage?: string;
  }) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  searchFDA: (query: string) => Promise<void>;
  addIngredient: (food: FDAFood, amount: number, unit: string) => Promise<void>;
  addCustomIngredient: (name: string, nutrition: Record<NutrientKeys, number>, amount: number, unit: string) => Promise<void>;
  addRecipeAsIngredient: (sourceRecipe: Recipe, multiplier: number) => Promise<void>;
  removeIngredient: (ingredientId: string) => Promise<void>;
  updateIngredient: (ingredientId: string, data: { name?: string; description?: string; amount?: number; unit?: string; prepInstructions?: string[]; storageLocation?: string }) => Promise<void>;  getTotalNutrition: () => Record<NutrientKeys, number>;
  setApiKey: (key: string) => void;
  loadApiKey: () => void;
  reorderIngredients: (fromIndex: number, toIndex: number) => Promise<void>;
  reorderInstructions: (fromIndex: number, toIndex: number) => Promise<void>;
  createIngredientGroup: (ingredientIds: string[], title: string) => Promise<void>;
  removeIngredientGroup: (groupId: string) => Promise<void>;
  renameIngredientGroup: (groupId: string, title: string) => Promise<void>;
  moveIngredientToGroup: (ingredientId: string, groupId: string | null) => Promise<void>;
  createInstructionGroup: (stepIds: string[], title: string) => Promise<void>;
  removeInstructionGroup: (groupId: string) => Promise<void>;
  renameInstructionGroup: (groupId: string, title: string) => Promise<void>;
  moveInstructionToGroup: (stepId: string, groupId: string | null) => Promise<void>;
}

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
      const storageData: Record<string, unknown> = { ...data };
      if (data.instructionSteps !== undefined || data.instructionGroups !== undefined) {
        storageData.instructions = serializeInstructions({
          steps: data.instructionSteps !== undefined ? data.instructionSteps : activeRecipe.instructionSteps,
          groups: data.instructionGroups !== undefined ? data.instructionGroups : activeRecipe.instructionGroups,
        });
        delete storageData.instructionSteps;
        delete storageData.instructionGroups;
      }
      const updated = await dbUpdateRecipe(activeRecipe.id, storageData as Parameters<typeof dbUpdateRecipe>[1]);
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

      let customFoods: FDAFood[] = [];
      try {
        const allCustom = await getAllCustomFoods();
        const q = query.toLowerCase();
        customFoods = allCustom
          .filter((f) => f.name.toLowerCase().includes(q))
          .map((f) => ({
            fdcId: -(Date.now() + Math.random() * 1000),
            description: f.name,
            brandOwner: null as string | null,
            dataType: 'Custom',
            servingSize: 100,
            servingSizeUnit: 'g',
            nutrients: {
              calories: f.calories,
              totalFat: f.totalFat,
              saturatedFat: f.saturatedFat,
              transFat: f.transFat,
              cholesterol: f.cholesterol,
              sodium: f.sodium,
              totalCarbs: f.totalCarbs,
              dietaryFiber: f.dietaryFiber,
              totalSugars: f.totalSugars,
              addedSugars: f.addedSugars,
              protein: f.protein,
              vitaminD: f.vitaminD,
              calcium: f.calcium,
              iron: f.iron,
              potassium: f.potassium,
            },
          }));
      } catch {
        // ignore custom foods search error
      }

      const allFoods = [...customFoods, ...result.foods.map(toPublicFDAFood)];
      set({
        searchResults: allFoods,
        searchSource: customFoods.length > 0 && result.foods.length === 0 ? 'local' : result.source === 'fallback' ? 'fallback' : result.source === 'local' ? 'local' : 'fda',
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
        description: '',
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
        groupId: null as string | null,
        linkedRecipeId: null as string | null,
        prepInstructions: [] as string[],
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

  addCustomIngredient: async (name: string, nutrition: Record<NutrientKeys, number>, amount: number, unit: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    set({ isLoading: true, error: null });
    try {
      const grams = convertToGrams(amount, unit);
      const scaleFactor = grams / 100;
      const scaleVal = (val: number) => Math.round(val * scaleFactor * 100) / 100;

      const ingredientData = {
        fdcId: -2,
        name,
        amount,
        unit,
        description: '',
        calories: scaleVal(nutrition.calories),
        totalFat: scaleVal(nutrition.totalFat),
        saturatedFat: scaleVal(nutrition.saturatedFat),
        transFat: scaleVal(nutrition.transFat),
        cholesterol: scaleVal(nutrition.cholesterol),
        sodium: scaleVal(nutrition.sodium),
        totalCarbs: scaleVal(nutrition.totalCarbs),
        dietaryFiber: scaleVal(nutrition.dietaryFiber),
        totalSugars: scaleVal(nutrition.totalSugars),
        addedSugars: scaleVal(nutrition.addedSugars),
        protein: scaleVal(nutrition.protein),
        vitaminD: scaleVal(nutrition.vitaminD),
        calcium: scaleVal(nutrition.calcium),
        iron: scaleVal(nutrition.iron),
        potassium: scaleVal(nutrition.potassium),
        groupId: null as string | null,
        linkedRecipeId: null as string | null,
        prepInstructions: [] as string[],
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

  addRecipeAsIngredient: async (sourceRecipe: Recipe, multiplier: number) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    set({ isLoading: true, error: null });
    try {
      const sourceNutrition = sumNutrition(sourceRecipe.ingredients);
      const scaleVal = (v: number) => Math.round(v * multiplier * 100) / 100;

      const ingredientData = {
        fdcId: -1,
        name: sourceRecipe.name,
        amount: multiplier,
        unit: '× recipe',
        description: `From recipe: ${sourceRecipe.name}`,
        calories: scaleVal(sourceNutrition.calories),
        totalFat: scaleVal(sourceNutrition.totalFat),
        saturatedFat: scaleVal(sourceNutrition.saturatedFat),
        transFat: scaleVal(sourceNutrition.transFat),
        cholesterol: scaleVal(sourceNutrition.cholesterol),
        sodium: scaleVal(sourceNutrition.sodium),
        totalCarbs: scaleVal(sourceNutrition.totalCarbs),
        dietaryFiber: scaleVal(sourceNutrition.dietaryFiber),
        totalSugars: scaleVal(sourceNutrition.totalSugars),
        addedSugars: scaleVal(sourceNutrition.addedSugars),
        protein: scaleVal(sourceNutrition.protein),
        vitaminD: scaleVal(sourceNutrition.vitaminD),
        calcium: scaleVal(sourceNutrition.calcium),
        iron: scaleVal(sourceNutrition.iron),
        potassium: scaleVal(sourceNutrition.potassium),
        groupId: null as string | null,
        linkedRecipeId: sourceRecipe.id,
        prepInstructions: [] as string[],
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

  updateIngredient: async (ingredientId: string, data: { name?: string; description?: string; amount?: number; unit?: string; prepInstructions?: string[]; storageLocation?: string }) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const ingredient = activeRecipe.ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) return;

    set({ isLoading: true, error: null });
    try {
      const newAmount = data.amount !== undefined ? data.amount : ingredient.amount;
      const newUnit = data.unit !== undefined ? data.unit : ingredient.unit;

      const updateData: Record<string, unknown> = {
        amount: newAmount,
        unit: newUnit,
      };

      if (data.description !== undefined) {
        updateData.description = data.description;
      }

      if (data.name !== undefined) {
        updateData.name = data.name;
      }

      if (data.prepInstructions !== undefined) {
        updateData.prepInstructions = data.prepInstructions;
      }

      if (data.storageLocation !== undefined) {
        updateData.storageLocation = data.storageLocation;
      }

      if (ingredient.linkedRecipeId) {
        // For recipe-ingredients, rescale by multiplier change
        const oldMultiplier = ingredient.amount;
        const newMultiplier = newAmount;
        if (oldMultiplier > 0 && newMultiplier !== oldMultiplier) {
          const rescaleFactor = newMultiplier / oldMultiplier;
          const rescaleVal = (val: number) => Math.round(val * rescaleFactor * 100) / 100;
          for (const key of NUTRIENT_KEYS) {
            updateData[key] = rescaleVal(ingredient[key]);
          }
        }
      } else {
        const oldGrams = convertToGrams(ingredient.amount, ingredient.unit);
        const newGrams = convertToGrams(newAmount, newUnit);
        const rescaleFactor = newGrams / oldGrams;

        if (rescaleFactor !== 1) {
          const rescaleVal = (val: number) => Math.round(val * rescaleFactor * 100) / 100;
          for (const key of NUTRIENT_KEYS) {
            updateData[key] = rescaleVal(ingredient[key]);
          }
        }
      }

      const updatedIngredient = await dbUpdateIngredient(activeRecipe.id, ingredientId, updateData as Parameters<typeof dbUpdateIngredient>[2]);

      const updatedRecipe: Recipe = {
        ...activeRecipe,
        ingredients: activeRecipe.ingredients.map((i) =>
          i.id === ingredientId ? { ...updatedIngredient } : i
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

  reorderIngredients: async (fromIndex: number, toIndex: number) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const ingredients = [...activeRecipe.ingredients];
    const [moved] = ingredients.splice(fromIndex, 1);
    ingredients.splice(toIndex, 0, moved);
    const updatedRecipe: Recipe = {
      ...activeRecipe,
      ingredients,
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({
      activeRecipe: updatedRecipe,
      recipes: state.recipes.map((r) =>
        r.id === updatedRecipe.id ? updatedRecipe : r
      ),
    }));
    try {
      await dbUpdateRecipe(activeRecipe.id, {
        ingredients: ingredients.map((i) => ({ ...i, recipeId: activeRecipe.id })),
      });
    } catch {}
  },

  reorderInstructions: async (fromIndex: number, toIndex: number) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const steps = [...activeRecipe.instructionSteps];
    const [moved] = steps.splice(fromIndex, 1);
    steps.splice(toIndex, 0, moved);
    await get().updateRecipe({ instructionSteps: steps });
  },

  createIngredientGroup: async (ingredientIds: string[], title: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe || ingredientIds.length < 2) return;
    const groupId = crypto.randomUUID();
    const newGroup: IngredientGroup = { id: groupId, title };
    const groups = [...activeRecipe.ingredientGroups, newGroup];

    const ingredients = activeRecipe.ingredients.map((ing) =>
      ingredientIds.includes(ing.id) ? { ...ing, groupId } : ing
    );

    const orderedIds = new Set(ingredientIds);
    const grouped: Ingredient[] = [];
    const ungrouped: Ingredient[] = [];
    for (const ing of ingredients) {
      if (orderedIds.has(ing.id)) grouped.push(ing);
      else ungrouped.push(ing);
    }

    const firstIdx = ingredients.findIndex((ing) => orderedIds.has(ing.id));
    const reordered: Ingredient[] = [];
    let inserted = false;
    for (let i = 0; i < ingredients.length; i++) {
      if (i === firstIdx && !inserted) {
        reordered.push(...grouped);
        inserted = true;
      }
      if (!orderedIds.has(ingredients[i].id)) {
        reordered.push(ingredients[i]);
      }
    }
    if (!inserted) reordered.push(...grouped);

    const updatedRecipe: Recipe = {
      ...activeRecipe,
      ingredients: reordered,
      ingredientGroups: groups,
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({
      activeRecipe: updatedRecipe,
      recipes: state.recipes.map((r) =>
        r.id === updatedRecipe.id ? updatedRecipe : r
      ),
    }));
    try {
      await dbUpdateRecipe(activeRecipe.id, {
        ingredients: reordered.map((i) => ({ ...i, recipeId: activeRecipe.id })),
        ingredientGroups: groups,
      });
    } catch {}
  },

  removeIngredientGroup: async (groupId: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const groups = activeRecipe.ingredientGroups.filter((g) => g.id !== groupId);
    const ingredients = activeRecipe.ingredients.map((ing) =>
      ing.groupId === groupId ? { ...ing, groupId: null } : ing
    );
    const updatedRecipe: Recipe = {
      ...activeRecipe,
      ingredients,
      ingredientGroups: groups,
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({
      activeRecipe: updatedRecipe,
      recipes: state.recipes.map((r) =>
        r.id === updatedRecipe.id ? updatedRecipe : r
      ),
    }));
    try {
      await dbUpdateRecipe(activeRecipe.id, {
        ingredients: ingredients.map((i) => ({ ...i, recipeId: activeRecipe.id })),
        ingredientGroups: groups,
      });
    } catch {}
  },

  renameIngredientGroup: async (groupId: string, title: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const groups = activeRecipe.ingredientGroups.map((g) =>
      g.id === groupId ? { ...g, title } : g
    );
    const updatedRecipe: Recipe = {
      ...activeRecipe,
      ingredientGroups: groups,
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({
      activeRecipe: updatedRecipe,
      recipes: state.recipes.map((r) =>
        r.id === updatedRecipe.id ? updatedRecipe : r
      ),
    }));
    try {
      await dbUpdateRecipe(activeRecipe.id, { ingredientGroups: groups });
    } catch {}
  },

  moveIngredientToGroup: async (ingredientId: string, groupId: string | null) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const ingredients = activeRecipe.ingredients.map((ing) =>
      ing.id === ingredientId ? { ...ing, groupId } : ing
    );
    const updatedRecipe: Recipe = {
      ...activeRecipe,
      ingredients,
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({
      activeRecipe: updatedRecipe,
      recipes: state.recipes.map((r) =>
        r.id === updatedRecipe.id ? updatedRecipe : r
      ),
    }));
    try {
      await dbUpdateRecipe(activeRecipe.id, {
        ingredients: ingredients.map((i) => ({ ...i, recipeId: activeRecipe.id })),
      });
    } catch {}
  },

  createInstructionGroup: async (stepIds: string[], title: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe || stepIds.length < 2) return;
    const groupId = crypto.randomUUID();
    const newGroup: InstructionGroup = { id: groupId, title };
    const groups = [...activeRecipe.instructionGroups, newGroup];

    const steps = activeRecipe.instructionSteps.map((s) =>
      stepIds.includes(s.id) ? { ...s, groupId } : s
    );

    const stepIdSet = new Set(stepIds);
    const grouped: InstructionStep[] = [];
    for (const s of steps) {
      if (stepIdSet.has(s.id)) grouped.push(s);
    }
    const ungrouped: InstructionStep[] = [];
    for (const s of steps) {
      if (!stepIdSet.has(s.id)) ungrouped.push(s);
    }

    const firstIdx = steps.findIndex((s) => stepIdSet.has(s.id));
    const reordered: InstructionStep[] = [];
    let inserted = false;
    for (let i = 0; i < steps.length; i++) {
      if (i === firstIdx && !inserted) {
        reordered.push(...grouped);
        inserted = true;
      }
      if (!stepIdSet.has(steps[i].id)) {
        reordered.push(steps[i]);
      }
    }
    if (!inserted) reordered.push(...grouped);

    await get().updateRecipe({ instructionSteps: reordered, instructionGroups: groups });
  },

  removeInstructionGroup: async (groupId: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const groups = activeRecipe.instructionGroups.filter((g) => g.id !== groupId);
    const steps = activeRecipe.instructionSteps.map((s) =>
      s.groupId === groupId ? { ...s, groupId: null } : s
    );
    await get().updateRecipe({ instructionSteps: steps, instructionGroups: groups });
  },

  renameInstructionGroup: async (groupId: string, title: string) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const groups = activeRecipe.instructionGroups.map((g) =>
      g.id === groupId ? { ...g, title } : g
    );
    await get().updateRecipe({ instructionGroups: groups });
  },

  moveInstructionToGroup: async (stepId: string, groupId: string | null) => {
    const { activeRecipe } = get();
    if (!activeRecipe) return;
    const steps = activeRecipe.instructionSteps.map((s) =>
      s.id === stepId ? { ...s, groupId } : s
    );
    await get().updateRecipe({ instructionSteps: steps });
  },

  getTotalNutrition: () => {
    const { activeRecipe } = get();
    if (!activeRecipe || activeRecipe.ingredients.length === 0) {
      return emptyNutrition();
    }
    return sumNutrition(activeRecipe.ingredients);
  },
}));

export type { Recipe, Ingredient, InstructionStep, InstructionGroup, IngredientGroup, FDAFood, RecipeState };

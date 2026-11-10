'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { generateUUID } from '@/lib/utils';
import {
  toPublicIngredient,
  toPublicRecipe,
  convertToGrams,
  sumNutrition,
  serializeInstructions,
  NUTRIENT_KEYS,
  type Recipe,
  type Ingredient,
  type InstructionStep,
  type InstructionGroup,
  type FDAFood as BaseFDAFood,
  type NutrientKeys,
} from '@/lib/recipe-types';
import type { IngredientGroup, FoodStorageDefault } from '@/lib/api-client';

export type FDAFood = BaseFDAFood & { customFoodId?: string };
export type { Recipe, Ingredient, IngredientGroup, InstructionStep, InstructionGroup, NutrientKeys };

const foodStorageDefaultsKey = ['food-storage-defaults'] as const;

export function useFoodStorageDefaults() {
  return useQuery({ queryKey: foodStorageDefaultsKey, queryFn: () => getApiClient().getFoodStorageDefaults() });
}

export function useUpdateFoodStorageDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceType, sourceKey, location }: FoodStorageDefault) => getApiClient().updateFoodStorageDefault(sourceType, sourceKey, location),
    onSuccess: () => qc.invalidateQueries({ queryKey: foodStorageDefaultsKey }),
  });
}

export function foodStorageIdentity(food: FDAFood): Pick<FoodStorageDefault, 'sourceType' | 'sourceKey'> | null {
  if (food.dataType === 'Custom') return food.customFoodId ? { sourceType: 'custom_food', sourceKey: food.customFoodId } : null;
  if (food.dataType === 'Manual' || !Number.isSafeInteger(food.fdcId) || food.fdcId <= 0) return null;
  return { sourceType: 'usda', sourceKey: String(food.fdcId) };
}

export function defaultLocationForFood(food: FDAFood, defaults: FoodStorageDefault[]): string {
  const identity = foodStorageIdentity(food);
  return defaults.find((item) => item.sourceType === identity?.sourceType && item.sourceKey === identity.sourceKey)?.location ?? '';
}

export function useFoodStorageDefaultLookup() {
  const qc = useQueryClient();
  return () => {
    // Defaults are preloaded by useFoodStorageDefaults. Do not issue an
    // authenticated lookup in the middle of an ingredient mutation: if that
    // optional request fails, the nutrition update must still be submitted.
    return Promise.resolve(qc.getQueryData<FoodStorageDefault[]>(foodStorageDefaultsKey) ?? []);
  };
}

export function useRecipes() {
  return useQuery({
    queryKey: queryKeys.recipes.lists(),
    queryFn: async () => {
      const api = getApiClient();
      const firstPage = await api.getRecipes(1, 100);
      let allRecipes = firstPage.data;
      for (let p = 2; p <= firstPage.totalPages; p++) {
        const page = await api.getRecipes(p, 100);
        allRecipes = allRecipes.concat(page.data);
      }
      return allRecipes.map(toPublicRecipe);
    },
  });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: queryKeys.recipes.detail(id),
    queryFn: async () => {
      const api = getApiClient();
      const recipe = await api.getRecipe(id);
      if (!recipe) throw new Error('Recipe not found');
      return toPublicRecipe(recipe);
    },
    enabled: !!id,
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const recipe = await getApiClient().createRecipe(name);
      return toPublicRecipe(recipe);
    },
    onSuccess: (recipe) => {
      qc.setQueryData(queryKeys.recipes.detail(recipe.id), recipe);
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
    },
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const updated = await getApiClient().updateRecipe(id, data as any);
      return toPublicRecipe(updated);
    },
    onSuccess: (recipe) => {
      qc.setQueryData(queryKeys.recipes.detail(recipe.id), recipe);
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
    },
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await getApiClient().deleteRecipe(id);
      return id;
    },
    onSuccess: (id) => {
      qc.removeQueries({ queryKey: queryKeys.recipes.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
    },
  });
}

export function useAddIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, ingredient }: { recipeId: string; ingredient: Omit<import('@/lib/api-client').IngredientRecord, 'id' | 'recipeId'> }) => {
      return getApiClient().addIngredient(recipeId, ingredient);
    },
    onSuccess: (created, variables) => {
      qc.setQueryData<Recipe>(queryKeys.recipes.detail(variables.recipeId), (recipe) => {
        if (!recipe) return recipe;
        const savedIngredient = toPublicIngredient(created);
        const exists = recipe.ingredients.some((ingredient) => ingredient.id === savedIngredient.id);
        return {
          ...recipe,
          ingredients: exists
            ? recipe.ingredients.map((ingredient) => ingredient.id === savedIngredient.id ? savedIngredient : ingredient)
            : [...recipe.ingredients, savedIngredient],
        };
      });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.detail(variables.recipeId) });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
    },
  });
}

export function useUpdateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, ingredientId, data }: { recipeId: string; ingredientId: string; data: Partial<Omit<import('@/lib/api-client').IngredientRecord, 'id' | 'recipeId'>> }) => {
      return getApiClient().updateIngredient(recipeId, ingredientId, data as any);
    },
    onSuccess: (updated, variables) => {
      qc.setQueryData<Recipe>(queryKeys.recipes.detail(variables.recipeId), (recipe) => {
        if (!recipe) return recipe;
        const savedIngredient = toPublicIngredient(updated);
        return {
          ...recipe,
          ingredients: recipe.ingredients.map((ingredient) =>
            ingredient.id === variables.ingredientId ? savedIngredient : ingredient,
          ),
        };
      });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.detail(variables.recipeId) });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
      qc.invalidateQueries({ queryKey: foodStorageDefaultsKey });
    },
  });
}

export function useRemoveIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, ingredientId }: { recipeId: string; ingredientId: string }) => {
      await getApiClient().removeIngredient(recipeId, ingredientId);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.recipes.detail(variables.recipeId) });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
    },
  });
}

export function useReorderIngredients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, ingredients }: { recipeId: string; ingredients: Ingredient[] }) => {
      await getApiClient().updateRecipe(recipeId, {
        ingredients: ingredients.map((i) => ({ ...i, recipeId })),
      });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.recipes.detail(variables.recipeId) });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
    },
  });
}

export function useUpdateRecipeGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipeId, ingredients, ingredientGroups }: { recipeId: string; ingredients?: Ingredient[]; ingredientGroups?: IngredientGroup[] }) => {
      const updateData: Record<string, unknown> = {};
      if (ingredients) updateData.ingredients = ingredients.map((i) => ({ ...i, recipeId }));
      if (ingredientGroups) updateData.ingredientGroups = ingredientGroups;
      await getApiClient().updateRecipe(recipeId, updateData as any);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.recipes.detail(variables.recipeId) });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
    },
  });
}

function foodAmountInGrams(food: FDAFood, amount: number, unit: string): number {
  const normalizedUnit = unit.toLowerCase().trim().replace(/s$/, '');
  const matchingPortions = (food.portions ?? []).filter((portion) =>
    portion.measureUnit.toLowerCase().trim().replace(/s$/, '') === normalizedUnit &&
    Number.isFinite(portion.amount) && portion.amount > 0 &&
    Number.isFinite(portion.gramWeight) && portion.gramWeight > 0,
  );
  if (matchingPortions.length > 0) {
    const gramRatios = matchingPortions.map((portion) => portion.gramWeight / portion.amount);
    if (gramRatios.every((ratio) => Math.abs(ratio - gramRatios[0]) < 0.001)) {
      return amount * gramRatios[0];
    }
  }
  return convertToGrams(amount, unit);
}

export function buildIngredientData(food: FDAFood, amount: number, unit: string, storageLocation = ''): Omit<import('@/lib/api-client').IngredientRecord, 'id' | 'recipeId'> {
  const grams = foodAmountInGrams(food, amount, unit);
  const scaleFactor = grams / 100;
  const scaleVal = (val: number) => {
    const v = parseFloat(String(val)) || 0;
    // Older USDA rows may contain negative analytical differences (e.g.
    // carbohydrate by difference). Never send negative nutrient snapshots.
    return Math.max(0, Math.round(v * scaleFactor * 100) / 100);
  };

  const identity = foodStorageIdentity(food);
  return {
    fdcId: identity?.sourceType === 'custom_food' ? -2 : food.fdcId,
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
    groupId: null,
    linkedRecipeId: null,
    sourceType: identity?.sourceType ?? 'manual',
    sourceKey: identity?.sourceKey ?? null,
    prepInstructions: [],
    storageLocation,
  };
}

export function buildCustomIngredientData(name: string, nutrition: Record<NutrientKeys, number>, amount: number, unit: string): Omit<import('@/lib/api-client').IngredientRecord, 'id' | 'recipeId'> {
  const grams = convertToGrams(amount, unit);
  const scaleFactor = grams / 100;
  const scaleVal = (val: number) => Math.round(val * scaleFactor * 100) / 100;

  return {
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
    groupId: null,
    linkedRecipeId: null,
    sourceType: 'manual',
    sourceKey: null,
    prepInstructions: [],
    storageLocation: '',
  };
}

export function buildRecipeAsIngredientData(sourceRecipe: Recipe, multiplier: number): Omit<import('@/lib/api-client').IngredientRecord, 'id' | 'recipeId'> {
  const sourceNutrition = sumNutrition(sourceRecipe.ingredients);
  const scaleVal = (v: number) => Math.round(v * multiplier * 100) / 100;

  return {
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
    groupId: null,
    linkedRecipeId: sourceRecipe.id,
    sourceType: 'recipe',
    sourceKey: sourceRecipe.id,
    prepInstructions: [],
    storageLocation: '',
  };
}

export function buildIngredientRematchUpdate(ingredient: Ingredient, food: FDAFood, defaultLocation?: string, amount = ingredient.amount, unit = ingredient.unit): Omit<import('@/lib/api-client').IngredientRecord, 'id' | 'recipeId'> {
  const resolvedUnit = unit.trim() ? unit : 'g';
  return {
    ...buildIngredientData(food, amount, resolvedUnit),
    name: ingredient.name,
    description: ingredient.description,
    groupId: ingredient.groupId,
    prepInstructions: ingredient.prepInstructions,
    storageLocation: ingredient.storageLocation || defaultLocation || '',
  };
}

export function buildRescaledIngredientUpdate(ingredient: Ingredient, data: { name?: string; description?: string; amount?: number; unit?: string; prepInstructions?: string[]; storageLocation?: string }): Record<string, unknown> {
  const newAmount = data.amount !== undefined ? data.amount : ingredient.amount;
  const newUnit = data.unit !== undefined ? data.unit : ingredient.unit;
  let nutritionScaleFactor = 1;

  if (ingredient.linkedRecipeId) {
    const oldMultiplier = ingredient.amount;
    if (oldMultiplier > 0) {
      nutritionScaleFactor = newAmount / oldMultiplier;
    }
  } else {
    const oldGrams = convertToGrams(ingredient.amount, ingredient.unit);
    const newGrams = convertToGrams(newAmount, newUnit);
    if (oldGrams > 0) {
      nutritionScaleFactor = newGrams / oldGrams;
    }
  }

  const rescaleVal = (val: number) => Math.round(val * nutritionScaleFactor * 100) / 100;

  const updateData: Record<string, unknown> = {
    fdcId: ingredient.fdcId,
    name: data.name !== undefined ? data.name : ingredient.name,
    amount: newAmount,
    unit: newUnit,
    description: data.description !== undefined ? data.description : ingredient.description,
    groupId: ingredient.groupId,
    linkedRecipeId: ingredient.linkedRecipeId,
    sourceType: ingredient.sourceType || 'manual',
    sourceKey: ingredient.sourceKey || null,
    prepInstructions: data.prepInstructions !== undefined ? data.prepInstructions : ingredient.prepInstructions,
    storageLocation: data.storageLocation !== undefined ? data.storageLocation : ingredient.storageLocation,
  };

  for (const key of NUTRIENT_KEYS) {
    updateData[key] = rescaleVal(ingredient[key]);
  }

  return updateData;
}

export function buildInstructionUpdate(recipe: Recipe, data: { instructionSteps?: InstructionStep[]; instructionGroups?: InstructionGroup[]; leftoverStorage?: string }): Record<string, unknown> {
  const storageData: Record<string, unknown> = { ...data };
  if (data.instructionSteps !== undefined || data.instructionGroups !== undefined) {
    storageData.instructions = serializeInstructions({
      steps: data.instructionSteps !== undefined ? data.instructionSteps : recipe.instructionSteps,
      groups: data.instructionGroups !== undefined ? data.instructionGroups : recipe.instructionGroups,
    });
    delete storageData.instructionSteps;
    delete storageData.instructionGroups;
  }
  return storageData;
}

export function computeIngredientGroupUpdate(recipe: Recipe, ingredientIds: string[], title: string): { ingredients: Ingredient[]; ingredientGroups: IngredientGroup[] } {
  const groupId = generateUUID();
  const newGroup: IngredientGroup = { id: groupId, title };
  const groups = [...recipe.ingredientGroups, newGroup];

  const ingredients = recipe.ingredients.map((ing) =>
    ingredientIds.includes(ing.id) ? { ...ing, groupId } : ing
  );

  const orderedIds = new Set(ingredientIds);
  const grouped: Ingredient[] = [];
  for (const ing of ingredients) {
    if (orderedIds.has(ing.id)) grouped.push(ing);
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

  return { ingredients: reordered, ingredientGroups: groups };
}

export function computeRemoveIngredientGroup(recipe: Recipe, groupId: string): { ingredients: Ingredient[]; ingredientGroups: IngredientGroup[] } {
  const groups = recipe.ingredientGroups.filter((g) => g.id !== groupId);
  const ingredients = recipe.ingredients.map((ing) =>
    ing.groupId === groupId ? { ...ing, groupId: null } : ing
  );
  return { ingredients, ingredientGroups: groups };
}

export function computeRenameIngredientGroup(recipe: Recipe, groupId: string, title: string): IngredientGroup[] {
  return recipe.ingredientGroups.map((g) =>
    g.id === groupId ? { ...g, title } : g
  );
}

export function computeMoveIngredientToGroup(recipe: Recipe, ingredientId: string, groupId: string | null): Ingredient[] {
  return recipe.ingredients.map((ing) =>
    ing.id === ingredientId ? { ...ing, groupId } : ing
  );
}

export function computeInstructionGroupUpdate(recipe: Recipe, stepIds: string[], title: string): { instructionSteps: InstructionStep[]; instructionGroups: InstructionGroup[] } {
  const groupId = generateUUID();
  const newGroup: InstructionGroup = { id: groupId, title };
  const groups = [...recipe.instructionGroups, newGroup];

  const steps = recipe.instructionSteps.map((s) =>
    stepIds.includes(s.id) ? { ...s, groupId } : s
  );

  const stepIdSet = new Set(stepIds);
  const grouped: InstructionStep[] = [];
  for (const s of steps) {
    if (stepIdSet.has(s.id)) grouped.push(s);
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

  return { instructionSteps: reordered, instructionGroups: groups };
}

export function computeRemoveInstructionGroup(recipe: Recipe, groupId: string): { instructionSteps: InstructionStep[]; instructionGroups: InstructionGroup[] } {
  const groups = recipe.instructionGroups.filter((g) => g.id !== groupId);
  const steps = recipe.instructionSteps.map((s) =>
    s.groupId === groupId ? { ...s, groupId: null } : s
  );
  return { instructionSteps: steps, instructionGroups: groups };
}

export function computeRenameInstructionGroup(recipe: Recipe, groupId: string, title: string): InstructionGroup[] {
  return recipe.instructionGroups.map((g) =>
    g.id === groupId ? { ...g, title } : g
  );
}

export function computeMoveInstructionToGroup(recipe: Recipe, stepId: string, groupId: string | null): InstructionStep[] {
  return recipe.instructionSteps.map((s) =>
    s.id === stepId ? { ...s, groupId } : s
  );
}

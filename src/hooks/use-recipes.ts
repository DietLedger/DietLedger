'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { generateUUID } from '@/lib/utils';
import {
  toPublicRecipe,
  convertToGrams,
  sumNutrition,
  serializeInstructions,
  NUTRIENT_KEYS,
  type Recipe,
  type Ingredient,
  type InstructionStep,
  type InstructionGroup,
  type FDAFood,
  type NutrientKeys,
} from '@/lib/recipe-types';
import type { IngredientGroup } from '@/lib/api-client';

export type { Recipe, Ingredient, InstructionStep, InstructionGroup, FDAFood, NutrientKeys };

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
    onSuccess: (_data, variables) => {
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
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.recipes.detail(variables.recipeId) });
      qc.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
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

export function buildIngredientData(food: FDAFood, amount: number, unit: string): Omit<import('@/lib/api-client').IngredientRecord, 'id' | 'recipeId'> {
  const grams = convertToGrams(amount, unit);
  const scaleFactor = grams / 100;
  const scaleVal = (val: number) => {
    const v = parseFloat(String(val)) || 0;
    return Math.round(v * scaleFactor * 100) / 100;
  };

  return {
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
    groupId: null,
    linkedRecipeId: null,
    prepInstructions: [],
    storageLocation: '',
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
    prepInstructions: [],
    storageLocation: '',
  };
}

export function buildRescaledIngredientUpdate(ingredient: Ingredient, data: { name?: string; description?: string; amount?: number; unit?: string; prepInstructions?: string[]; storageLocation?: string }): Record<string, unknown> {
  const newAmount = data.amount !== undefined ? data.amount : ingredient.amount;
  const newUnit = data.unit !== undefined ? data.unit : ingredient.unit;

  const updateData: Record<string, unknown> = {
    amount: newAmount,
    unit: newUnit,
  };

  if (data.description !== undefined) updateData.description = data.description;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.prepInstructions !== undefined) updateData.prepInstructions = data.prepInstructions;
  if (data.storageLocation !== undefined) updateData.storageLocation = data.storageLocation;

  if (ingredient.linkedRecipeId) {
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

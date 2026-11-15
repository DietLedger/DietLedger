import type { RecipeBundle, IngredientRecord } from './api-client';
import type { CustomFoodRecord, SharedRecipeRecord, IngredientSourceReference } from './types';
import type { ImportRecipeDraft } from './recipe-import';
import { buildIngredientData } from '@/hooks/use-recipes';
import { emptyNutrition, NUTRIENT_KEYS, serializeInstructions } from './recipe-types';

function bundleEnvelope(): RecipeBundle {
  return { format: 'dietledger.recipe-bundle', version: 2, exportedAt: new Date().toISOString(), customFoods: [] };
}

function bundleIngredient(ingredient: Partial<IngredientRecord>, id: string, position: number, source: IngredientSourceReference) {
  const nutrients = Object.fromEntries(NUTRIENT_KEYS.map(key => [key, ingredient[key] ?? 0]));
  return {
    bundleIngredientId: id, position, name: ingredient.name, amount: ingredient.amount, unit: ingredient.unit,
    description: ingredient.description ?? '', bundleGroupId: ingredient.groupId ?? null,
    prepInstructions: ingredient.prepInstructions ?? [], storageLocation: ingredient.storageLocation ?? '',
    source, nutrients, zeroNutritionOverride: ingredient.zeroNutritionOverride ?? false,
    ...(ingredient.unconfirmedNutrition ? { suppliedNutrition: ingredient.unconfirmedNutrition } : {}),
  };
}

// Same native contract as file import; one atomic staging request, including unmatched rows.
export function markdownDraftToBundle(draft: ImportRecipeDraft, customFoods: CustomFoodRecord[] = []): RecipeBundle {
  const bundle = bundleEnvelope();
  const selectedCustomIds = new Set(draft.ingredients.flatMap(ingredient => ingredient.matchedFood?.customFoodId ? [ingredient.matchedFood.customFoodId] : []));
  bundle.customFoods = [...selectedCustomIds].map(id => {
    const food = customFoods.find(candidate => candidate.id === id);
    if (!food) throw new Error('Selected custom food is no longer available. The draft has been preserved.');
    return {
      bundleCustomFoodId: id, sourceCustomFoodId: id, portableId: food.portableId, name: food.name,
      nutrients: Object.fromEntries(NUTRIENT_KEYS.map(key => [key, food[key]])),
    };
  });
  bundle.recipes = [{
    bundleRecipeId: draft.id, name: draft.title.trim(), servings: draft.servings,
    servingName: draft.servingName.trim() || 'servings', prepTime: draft.prepTime || undefined, cookTime: draft.cookTime || undefined,
    instructions: serializeInstructions({ steps: draft.instructionSteps, groups: [] }),
    ingredientGroups: draft.ingredientGroups.map(group => ({ bundleGroupId: group.id, title: group.title })),
    ingredients: draft.ingredients.map((ingredient, position) => {
      const food = ingredient.matchedFood;
      const data = food ? buildIngredientData(food, ingredient.amount, ingredient.unit) : { ...emptyNutrition(), fdcId: 0 };
      const source: IngredientSourceReference = food?.customFoodId
        ? { type: 'custom_food', bundleCustomFoodId: food.customFoodId }
        : food && food.fdcId > 0 ? { type: 'usda', fdcId: food.fdcId } : { type: 'manual' };
      return bundleIngredient({
        ...data, name: ingredient.name.trim() || food?.description || ingredient.originalText,
        amount: ingredient.amount, unit: ingredient.unit, description: `Imported: ${ingredient.originalText}`,
        groupId: ingredient.groupId, prepInstructions: ingredient.prepInstructions,
        ...(food && source.type === 'manual' && food.fdcId !== -3 ? {
          unconfirmedNutrition: { basis: 'per100g' as const, nutrients: food.nutrients, provenance: draft.sourceFileName },
        } : {}),
      }, ingredient.id, position, source);
    }),
  }];
  return bundle;
}

// Existing share snapshots use local source IDs. Keep these as unresolved, scoped package
// references, never as live foreign ingredient/recipe/custom-food keys in the recipient library.
export function sharedRecipeToBundle(shared: SharedRecipeRecord): RecipeBundle {
  const raw = JSON.parse(shared.recipeData);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.ingredients)) throw new Error('Invalid shared recipe snapshot');
  const bundle = bundleEnvelope();
  bundle.recipes = [{
    bundleRecipeId: `shared:${shared.id}`, name: raw.name || shared.title, servings: raw.servings ?? 1,
    servingName: raw.servingName || 'servings', prepTime: raw.prepTime, cookTime: raw.cookTime, leftoverStorage: raw.leftoverStorage,
    instructions: Array.isArray(raw.instructionSteps)
      ? serializeInstructions({ steps: raw.instructionSteps, groups: raw.instructionGroups ?? [] }) : raw.instructions ?? null,
    ingredientGroups: (raw.ingredientGroups ?? []).map((group: { id: string; title: string }) => ({ bundleGroupId: group.id, title: group.title })),
    ingredients: raw.ingredients.map((ingredient: Partial<IngredientRecord>, position: number) => {
      let source: IngredientSourceReference = { type: 'manual' };
      const original = ingredient.unresolvedSource;
      if ((ingredient.sourceType === 'usda' || (!ingredient.sourceType && (ingredient.fdcId ?? 0) > 0)) && (ingredient.fdcId ?? 0) > 0) source = { type: 'usda', fdcId: ingredient.fdcId };
      else if (original?.type === 'usda') source = original;
      else if (ingredient.linkedRecipeId || ingredient.sourceType === 'recipe' || original?.type === 'recipe') source = { type: 'recipe', bundleRecipeId: `shared:${shared.id}:${ingredient.linkedRecipeId || ingredient.sourceKey || original?.bundleRecipeId || 'missing'}` };
      else if (ingredient.sourceType === 'custom_food' || original?.type === 'custom_food') source = { type: 'custom_food', bundleCustomFoodId: `shared:${shared.id}:${ingredient.sourceKey || original?.bundleCustomFoodId || 'missing'}` };
      const zero = ingredient.zeroNutritionOverride === true || (ingredient.sourceType === 'manual' && ingredient.fdcId === -3);
      return bundleIngredient({
        ...ingredient, zeroNutritionOverride: zero,
        unconfirmedNutrition: ingredient.unconfirmedNutrition ?? (zero ? null : {
          basis: 'ingredientAmount', provenance: `Shared recipe ${shared.id}`,
          nutrients: Object.fromEntries(NUTRIENT_KEYS.map(key => [key, ingredient[key] ?? 0])),
        }),
      }, ingredient.id || `ingredient-${position}`, position, source);
    }),
  }];
  return bundle;
}

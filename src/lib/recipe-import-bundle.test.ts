import { describe, expect, it } from 'vitest';
import { markdownDraftToBundle, sharedRecipeToBundle } from './recipe-import-bundle';
import { parseSeedRecipeMarkdown, createZeroNutritionImportFood, createManualImportFood } from './recipe-import';
import { emptyNutrition } from './recipe-types';
import type { CustomFoodRecord, SharedRecipeRecord } from './types';

describe('complete atomic import bundles', () => {
  it('retains every Markdown row, metadata, grouping, prep, explicit zero and actual custom food identity', () => {
    const draft = parseSeedRecipeMarkdown('# Soup\nPrep time: 10 min\nCook time: 20 min\nServings: 2\n## Ingredients\n### Sauce\n- 100 g Mystery vegetable\n- 50 g Water\n- 25 g My sauce\n- 5 g Manual spice\n## Directions\n1. Stir.');
    draft.ingredients[0].prepInstructions = ['diced'];
    draft.ingredients[1].matchedFood = createZeroNutritionImportFood('Water');
    draft.ingredients[2].matchedFood = { ...createManualImportFood('My sauce', { calories: 200 }), fdcId: -2, dataType: 'Custom', customFoodId: 'custom-id' };
    draft.ingredients[3].matchedFood = createManualImportFood('Manual spice', { sodium: 8 });
    const food = { ...emptyNutrition(), id: 'custom-id', name: 'My sauce', portableId: 'dietledger:food:uuid', calories: 200 } as CustomFoodRecord;
    const bundle = markdownDraftToBundle(draft, [food]);
    const recipe = bundle.recipes![0] as Record<string, unknown>;
    const ingredients = recipe.ingredients as Array<Record<string, unknown>>;
    expect(ingredients).toHaveLength(4);
    expect(recipe).toMatchObject({ name: 'Soup', prepTime: '10 min', cookTime: '20 min', servings: 2 });
    expect(recipe.instructions).toContain('Stir.');
    expect(ingredients[0]).toMatchObject({ name: 'Mystery vegetable', prepInstructions: ['diced'], source: { type: 'manual' }, zeroNutritionOverride: false });
    expect(ingredients[0].bundleGroupId).toBeTruthy();
    expect(ingredients[1]).toMatchObject({ source: { type: 'manual' }, zeroNutritionOverride: true, nutrients: emptyNutrition() });
    expect(ingredients[2]).toMatchObject({ source: { type: 'custom_food', bundleCustomFoodId: 'custom-id' }, nutrients: { calories: 50 } });
    expect(bundle.customFoods).toEqual([expect.objectContaining({ bundleCustomFoodId: 'custom-id', sourceCustomFoodId: 'custom-id', portableId: food.portableId })]);
    expect(ingredients[3]).toMatchObject({ source: { type: 'manual' }, zeroNutritionOverride: false, suppliedNutrition: { basis: 'per100g', nutrients: { sodium: 8 } } });
    expect(markdownDraftToBundle(draft, [food]).recipes).toEqual(bundle.recipes);
  });

  it('serializes the existing shared snapshot without dropping ingredients or trusting foreign local links', () => {
    const shared = { id: 'share-id', title: 'Title', recipeData: JSON.stringify({
      id: 'foreign-recipe', name: 'Shared soup', servings: 3, prepTime: '5 min', leftoverStorage: 'Refrigerate', ingredientGroups: [{ id: 'g', title: 'Sauce' }],
      instructionSteps: [{ id: 'step', text: 'Mix', groupId: null }], instructionGroups: [],
      ingredients: [
        { ...emptyNutrition(), id: 'usda', name: 'Salt', fdcId: 123, sourceType: 'usda', amount: 2, unit: 'g', sodium: 80, groupId: 'g' },
        { ...emptyNutrition(), id: 'private', name: 'Private food', fdcId: -2, sourceType: 'custom_food', sourceKey: 'foreign-custom', amount: 1, unit: 'cup', calories: 80 },
        { ...emptyNutrition(), id: 'child', name: 'Child', sourceType: 'recipe', linkedRecipeId: 'foreign-child', amount: 1, unit: '× recipe', calories: 50 },
      ],
    }) } as SharedRecipeRecord;
    const bundle = sharedRecipeToBundle(shared);
    const recipe = bundle.recipes![0] as Record<string, unknown>;
    expect(recipe).toMatchObject({ name: 'Shared soup', servings: 3, prepTime: '5 min', leftoverStorage: 'Refrigerate' });
    expect(recipe.instructions).toContain('Mix');
    const ingredients = recipe.ingredients as Array<Record<string, unknown>>;
    expect(ingredients).toHaveLength(3);
    expect(ingredients[0]).toMatchObject({ source: { type: 'usda', fdcId: 123 }, nutrients: { sodium: 80 } });
    expect(ingredients[1]).toMatchObject({ source: { type: 'custom_food', bundleCustomFoodId: 'shared:share-id:foreign-custom' }, suppliedNutrition: { basis: 'ingredientAmount', nutrients: { calories: 80 } } });
    expect(ingredients[2]).toMatchObject({ source: { type: 'recipe', bundleRecipeId: 'shared:share-id:foreign-child' }, suppliedNutrition: { basis: 'ingredientAmount', nutrients: { calories: 50 } } });
    expect(bundle.customFoods).toEqual([]);
  });
});

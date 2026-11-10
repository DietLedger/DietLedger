import { describe, expect, it } from 'vitest';
import { createManualImportFood, createZeroNutritionImportFood, isImportDraftReady, parseSeedRecipeMarkdown, resetImportDraft } from './recipe-import';

const applePieMarkdown = `---
title: "Apple Pie"
date: 2021-05-13
tags: ['dessert', 'pie']
author: mfed3
---

![Apple Pie](/pix/apple-pie.webp)

- ⏲️ Prep time: 30 min
- 🍳Cook time: 45 min
- 🍽️ Servings: 8

## Ingredients

### Filling

- 900 g (4-5) golden delicious apples
- 15 g (1 tbsp) lemon juice
- 1-2 g nutmeg

### Crust

- 350 g flour
- 225 g cold butter, cut into slices
- 50-100 ml ice water

## Directions

1. Peel and cut the apples into 1-2 inch strips
2. Bake 45 minutes at 350°F or until browned
`;

const aglioMarkdown = `---
title: "Spaghetti aglio e olio"
date: 2021-03-21
---

- 🍳 Cook time: 15 min
- 🍽️ Servings: 4

## Ingredients

- 1 pound (500g) spaghetti (or similarly shaped pasta)
- 1/2 cup (110g) extra virgin olive oil
- 5-6 cloves of garlic
- 1/4 tsp red pepper flakes
- A bunch of fresh parsley

## Directions

1. Heat a large skillet.
2. Add the parsley.
`;

describe('parseSeedRecipeMarkdown', () => {
  it('parses seed markdown front matter, metadata, groups, ingredients, and directions', () => {
    const draft = parseSeedRecipeMarkdown(applePieMarkdown, 'apple-pie.md');

    expect(draft.title).toBe('Apple Pie');
    expect(draft.servings).toBe(8);
    expect(draft.servingName).toBe('servings');
    expect(draft.prepTime).toBe('30 min');
    expect(draft.cookTime).toBe('45 min');
    expect(draft.ingredientGroups.map((g) => g.title)).toEqual(['Filling', 'Crust']);
    expect(draft.ingredients).toHaveLength(6);
    expect(draft.ingredients[0]).toMatchObject({
      originalText: '900 g (4-5) golden delicious apples',
      name: 'golden delicious apples',
      amount: 900,
      unit: 'g',
      groupId: draft.ingredientGroups[0].id,
    });
    expect(draft.ingredients[2]).toMatchObject({ name: 'nutmeg', amount: 1.5, unit: 'g' });
    expect(draft.ingredients[4]).toMatchObject({ name: 'cold butter', amount: 225, unit: 'g', prepInstructions: ['cut into slices'] });
    expect(draft.ingredients[5]).toMatchObject({ name: 'ice water', amount: 75, unit: 'ml' });
    expect(draft.instructionSteps.map((s) => s.text)).toEqual([
      'Peel and cut the apples into 1-2 inch strips',
      'Bake 45 minutes at 350°F or until browned',
    ]);
  });

  it('prefers metric quantities in parentheses when present and handles fractions/fuzzy amounts', () => {
    const draft = parseSeedRecipeMarkdown(aglioMarkdown, 'aglio-e-olio.md');

    expect(draft.servings).toBe(4);
    expect(draft.cookTime).toBe('15 min');
    expect(draft.prepTime).toBe('');
    expect(draft.ingredients[0]).toMatchObject({ name: 'spaghetti (or similarly shaped pasta)', amount: 500, unit: 'g' });
    expect(draft.ingredients[1]).toMatchObject({ name: 'extra virgin olive oil', amount: 110, unit: 'g' });
    expect(draft.ingredients[2]).toMatchObject({ name: 'garlic', amount: 5.5, unit: 'whole' });
    expect(draft.ingredients[3]).toMatchObject({ name: 'red pepper flakes', amount: 0.25, unit: 'tsp' });
    expect(draft.ingredients[4]).toMatchObject({ name: 'A bunch of fresh parsley', amount: 1, unit: 'whole' });
  });
});

describe('createManualImportFood', () => {
  it('creates a zero-nutrition match for water, spices, and other trace ingredients', () => {
    const food = createZeroNutritionImportFood('water');

    expect(food).toMatchObject({
      fdcId: -3,
      description: 'water',
      dataType: 'No nutrition',
      servingSize: 100,
      servingSizeUnit: 'g',
      nutrients: {
        calories: 0,
        protein: 0,
        totalFat: 0,
        totalCarbs: 0,
        sodium: 0,
        potassium: 0,
      },
    });
  });

  it('creates a manual match with canonical nutrient fields for ingredients missing database nutrition', () => {
    const food = createManualImportFood('sumac', {
      calories: 280,
      protein: 12,
      totalFat: 8,
      totalCarbs: 48,
      sodium: 30,
    });

    expect(food).toMatchObject({
      fdcId: -2,
      description: 'sumac',
      dataType: 'Manual',
      servingSize: 100,
      servingSizeUnit: 'g',
      nutrients: {
        calories: 280,
        protein: 12,
        totalFat: 8,
        totalCarbs: 48,
        sodium: 30,
        saturatedFat: 0,
        potassium: 0,
      },
    });
  });
});

describe('isImportDraftReady', () => {
  it('requires every imported ingredient to have a matched food before saving', () => {
    const draft = parseSeedRecipeMarkdown(aglioMarkdown, 'aglio-e-olio.md');
    const matched = {
      fdcId: 123,
      description: 'Food',
      brandOwner: null,
      dataType: 'Foundation',
      servingSize: 100,
      servingSizeUnit: 'g',
      nutrients: {
        calories: 1,
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
      },
    };

    expect(isImportDraftReady(draft)).toBe(false);
    expect(isImportDraftReady({
      ...draft,
      ingredients: draft.ingredients.map((ingredient) => ({ ...ingredient, matchedFood: matched })),
    })).toBe(true);
  });

  it('reset restores the original parsed recipe and clears matches', () => {
    const draft = parseSeedRecipeMarkdown(aglioMarkdown, 'aglio-e-olio.md');
    const edited = {
      ...draft,
      title: 'Edited',
      ingredients: draft.ingredients.map((ingredient) => ({ ...ingredient, name: 'changed' })),
    };

    const reset = resetImportDraft(edited);

    expect(reset.title).toBe('Spaghetti aglio e olio');
    expect(reset.ingredients[0].name).toBe('spaghetti (or similarly shaped pasta)');
    expect(reset.ingredients.every((ingredient) => ingredient.matchedFood === null)).toBe(true);
  });
});

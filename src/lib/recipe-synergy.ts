import type { RecipeRecord } from '@/lib/storage';

export interface SynergyResult {
  recipe: RecipeRecord;
  sharedIngredients: string[];
  score: number;
}

export function computeSynergies(
  mealPlanRecipeIds: string[],
  allRecipes: RecipeRecord[],
  pantryStaples: Set<string>
): SynergyResult[] {
  if (mealPlanRecipeIds.length === 0) return [];

  const mealPlanRecipes = allRecipes.filter(r => mealPlanRecipeIds.includes(r.id));

  const mealPlanIngredients = new Set<string>();
  for (const recipe of mealPlanRecipes) {
    for (const ing of recipe.ingredients) {
      const name = ing.name.toLowerCase().trim();
      if (name && !pantryStaples.has(name)) {
        mealPlanIngredients.add(name);
      }
    }
  }

  if (mealPlanIngredients.size === 0) return [];

  const mealPlanIdSet = new Set(mealPlanRecipeIds);
  const results: SynergyResult[] = [];

  for (const recipe of allRecipes) {
    if (mealPlanIdSet.has(recipe.id)) continue;

    const shared: string[] = [];
    for (const ing of recipe.ingredients) {
      const name = ing.name.toLowerCase().trim();
      if (name && !pantryStaples.has(name) && mealPlanIngredients.has(name)) {
        shared.push(name);
      }
    }

    if (shared.length > 0) {
      results.push({
        recipe,
        sharedIngredients: [...new Set(shared)],
        score: new Set(shared).size,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export function findRecipesContainingIngredient(
  recipes: RecipeRecord[],
  ingredientName: string
): RecipeRecord[] {
  const search = ingredientName.toLowerCase().trim();
  if (!search) return [];
  return recipes.filter(r =>
    r.ingredients.some(ing => ing.name.toLowerCase().includes(search))
  );
}

import { findGI, glCategory, glCategoryColor, type GLCategory } from '@/data/glycemic-index';

interface IngredientForGL {
  name: string;
  totalCarbs: number;
  dietaryFiber: number;
  linkedRecipeId: string | null;
  amount: number;
}

interface RecipeForGL {
  id: string;
  customNutrition?: import('./types').CustomRecipeNutrition | null;
  servings: number;
  ingredients: IngredientForGL[];
}

export interface GLResult {
  gl: number;
  category: GLCategory;
  colorClass: string;
  matchedCount: number;
  totalCount: number;
}

export function computeRecipeGL(
  recipe: RecipeForGL,
  servings: number = 1,
  allRecipes?: RecipeForGL[],
  depth: number = 0
): GLResult | null {
  const gl = computeRecipeGLInternal(recipe, servings, allRecipes, depth);
  if (gl === null) return null;
  const category = glCategory(gl);
  return {
    gl: Math.round(gl * 10) / 10,
    category,
    colorClass: glCategoryColor(category),
    matchedCount: 0,
    totalCount: 0,
  };
}

function computeRecipeGLInternal(
  recipe: RecipeForGL,
  servings: number,
  allRecipes?: RecipeForGL[],
  depth: number = 0
): number | null {
  // Published totals do not supply an ingredient-level glycemic index.
  if (recipe.customNutrition) return null;
  if (depth > 3) return 0;
  const perServing = 1 / (recipe.servings || 1);
  const multiplier = perServing * servings;
  let totalGL = 0;

  for (const ing of recipe.ingredients) {
    if (ing.linkedRecipeId) {
      const linked = allRecipes?.find((r) => r.id === ing.linkedRecipeId);
      // A linked total alone has no ingredient-level GI; lack of a cached child
      // must not turn a published recipe's unknown GL into a Low/0 claim.
      if (!linked) return null;
      if (linked) {
        const linkedServings = (ing.amount * multiplier) / (linked.servings || 1);
        const linkedGL = computeRecipeGLInternal(linked, linkedServings, allRecipes, depth + 1);
        if (linkedGL === null) return null;
        totalGL += linkedGL;
        continue;
      }
    }

    const gi = findGI(ing.name);
    if (gi === null) continue;
    const netCarbs = ((ing.totalCarbs || 0) - (ing.dietaryFiber || 0)) * multiplier;
    if (netCarbs <= 0) continue;
    totalGL += (gi * netCarbs) / 100;
  }

  return totalGL;
}

export function computeEntryGL(
  entry: {
    sourceType: string;
    recipeId: string | null;
    servings: number;
    totalCarbs?: number;
    dietaryFiber?: number;
    foodName?: string;
  },
  allRecipes: RecipeForGL[]
): GLResult | null {
  if (entry.sourceType === 'recipe' && entry.recipeId) {
    const recipe = allRecipes.find((r) => r.id === entry.recipeId);
    if (recipe) return computeRecipeGL(recipe, entry.servings, allRecipes);
  }

  if (entry.totalCarbs !== undefined) {
    const gi = findGI(entry.foodName || '');
    if (gi !== null) {
      const netCarbs = (entry.totalCarbs - (entry.dietaryFiber || 0)) * entry.servings;
      const gl = Math.max(0, (gi * netCarbs) / 100);
      const category = glCategory(gl);
      return {
        gl: Math.round(gl * 10) / 10,
        category,
        colorClass: glCategoryColor(category),
        matchedCount: 0,
        totalCount: 0,
      };
    }
  }

  return null;
}

export function sumGL(results: (GLResult | null)[]): GLResult | null {
  // Do not advertise a partial known sum as the load of an unknown meal.
  if (results.some(result => result === null)) return null;
  const valid = results.filter((r): r is GLResult => r !== null);
  if (valid.length === 0) return null;
  const gl = valid.reduce((sum, r) => sum + r.gl, 0);
  const category = glCategory(gl);
  return {
    gl: Math.round(gl * 10) / 10,
    category,
    colorClass: glCategoryColor(category),
    matchedCount: 0,
    totalCount: 0,
  };
}

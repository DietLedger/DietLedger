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
): GLResult {
  const gl = computeRecipeGLInternal(recipe, servings, allRecipes, depth);
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
): number {
  if (depth > 3) return 0;
  const perServing = 1 / (recipe.servings || 1);
  const multiplier = perServing * servings;
  let totalGL = 0;

  for (const ing of recipe.ingredients) {
    if (ing.linkedRecipeId && allRecipes) {
      const linked = allRecipes.find((r) => r.id === ing.linkedRecipeId);
      if (linked) {
        const linkedServings = (ing.amount * multiplier) / (linked.servings || 1);
        totalGL += computeRecipeGLInternal(linked, linkedServings, allRecipes, depth + 1);
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

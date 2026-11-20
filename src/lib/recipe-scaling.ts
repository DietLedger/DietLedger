import type {
  ScaleOptions,
  ScaledIngredient,
  ScaledRecipe,
  IngredientClassification,
} from '@/lib/types';
import { recipeNutrition } from '@/lib/recipe-types';

const SPICE_KEYWORDS = new Set([
  'salt', 'pepper', 'black pepper', 'white pepper', 'ground black pepper', 'ground white pepper', 'cumin', 'paprika', 'cinnamon', 'oregano', 'basil',
  'thyme', 'rosemary', 'turmeric', 'cayenne', 'chili', 'chili powder',
  'curry', 'ginger', 'nutmeg', 'cloves', 'coriander', 'saffron',
  'bay leaf', 'bay leaves', 'allspice', 'cardamom', 'clove', 'dill',
  'parsley', 'sage', 'mint', 'tarragon', 'chive', 'chives',
  'vanilla', 'vanilla extract', 'red pepper flakes', 'italian seasoning',
  'herbes de provence', 'chinese five spice', 'garam masala', 'taco seasoning',
  'old bay', 'seasoning', 'spice', 'spices', 'chili flakes',
]);

const LEAVENING_KEYWORDS = new Set([
  'baking powder', 'baking soda', 'yeast', 'active dry yeast',
  'instant yeast', 'sourdough starter', 'cream of tartar',
]);

const ACID_KEYWORDS = new Set([
  'lemon juice', 'lime juice', 'vinegar', 'white vinegar',
  'apple cider vinegar', 'balsamic vinegar', 'red wine vinegar',
  'rice vinegar', 'white wine vinegar', 'citric acid',
]);

function startsWithIngredient(name: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(?=$|[\\s,()])`, 'i').test(name.trim());
}

function startsWithAny(name: string, keywords: Set<string>): boolean {
  if ([...keywords].some(keyword => startsWithIngredient(name, keyword))) return true;
  return /^(?:ground|whole|crushed|dried|dry)\s+/.test(name.trim()) && [...keywords].some(keyword => startsWithIngredient(name.trim().replace(/^(?:ground|whole|crushed|dried|dry)\s+/, ''), keyword));
}

export function classifyIngredient(name: string): IngredientClassification {
  const normalized = name.toLowerCase().trim();
  if (startsWithAny(normalized, LEAVENING_KEYWORDS)) return 'leavening';
  if (startsWithAny(normalized, ACID_KEYWORDS)) return 'acid';
  if (startsWithAny(normalized, SPICE_KEYWORDS)) return 'spice';
  if (/^(?:spice|spices|seasoning|seasonings)\b/.test(normalized)) return 'spice';
  return 'linear';
}

function isBetaSeasoning(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  const recognized = startsWithAny(normalized, SPICE_KEYWORDS) || /^(?:spice|spices|seasoning|seasonings)\b/.test(normalized);
  if (!recognized || /\b(?:fresh|salt|table salt|sea salt|kosher salt|salt-free|salt free)\b/.test(normalized)) return false;
  const herb = /\b(?:basil|oregano|thyme|rosemary|bay leaves?|dill|parsley|sage|mint|tarragon|chives?)\b/.test(normalized);
  return !herb || /\b(?:dried|dry)\b/.test(normalized);
}

export function computeScaleFactor(options: ScaleOptions): number {
  switch (options.mode) {
    case 'servings': {
      if (!options.targetServings || options.originalServings === 0) return 1;
      return options.targetServings / options.originalServings;
    }
    case 'multiplier': {
      return options.multiplier ?? 1;
    }
    case 'calorieTarget': {
      if (!options.calorieTarget || !options.originalCalories || options.originalCalories === 0) return 1;
      return options.calorieTarget / options.originalCalories;
    }
    default:
      return 1;
  }
}

export function formatScaledAmount(scaledAmount: number): string {
  if (scaledAmount === 0) return '0';

  const fractions: [number, string][] = [
    [0.125, '\u215B'],
    [0.25, '\u00BC'],
    [0.333, '\u2153'],
    [0.5, '\u00BD'],
    [0.667, '\u2154'],
    [0.75, '\u00BE'],
  ];

  const whole = Math.floor(scaledAmount);
  const frac = scaledAmount - whole;
  if (frac === 0) return String(whole);

  for (const [val, sym] of fractions) {
    if (Math.abs(frac - val) < 0.02) return whole > 0 ? `${whole} ${sym}` : sym;
  }
  return String(Math.round(scaledAmount * 100) / 100);
}

export function smartScaleAmount(amount: number, unit: string, factor: number): { amount: number; unit: string; display: string } {
  const scaledAmount = amount * factor;
  return { amount: scaledAmount, unit, display: formatScaledAmount(scaledAmount) };
}

export function scaleIngredient(
  ingredient: { id: string; name: string; amount: number; unit: string },
  factor: number,
  options?: Pick<ScaleOptions, 'largeBatchBeta' | 'seasoningScalePercent'>,
): ScaledIngredient {
  const classification = classifyIngredient(ingredient.name);
  const largeBatchEligible = isBetaSeasoning(ingredient.name);
  let scaledAmount = ingredient.amount * factor;
  let reason: string | undefined;
  if (options?.largeBatchBeta && largeBatchEligible && factor >= 2 && factor <= 4) {
    const percent = Math.min(100, Math.max(1, options.seasoningScalePercent ?? 75));
    scaledAmount = ingredient.amount * factor * percent / 100;
    reason = `Large batch beta · ${percent}% of proportional`;
  }

  return {
    id: ingredient.id,
    name: ingredient.name,
    originalAmount: ingredient.amount,
    originalUnit: ingredient.unit,
    scaledAmount,
    scaledUnit: ingredient.unit,
    displayAmount: formatScaledAmount(scaledAmount),
    classification,
    largeBatchEligible,
    scaleReason: reason,
  };
}

export function scaleRecipe(
  recipe: {
    id: string;
    servings: number;
    ingredients: Array<{ id: string; name: string; amount: number; unit: string }>;
    totalCalories?: number;
    customNutrition?: import('./types').CustomRecipeNutrition | null;
  },
  options: ScaleOptions,
): ScaledRecipe {
  const opts: ScaleOptions = {
    ...options,
    originalServings: options.originalServings ?? recipe.servings,
    originalCalories: options.originalCalories ?? recipe.customNutrition?.nutrients.calories ?? recipe.totalCalories,
  };
  const factor = computeScaleFactor(opts);
  const scaledServings = Math.round(recipe.servings * factor);
  const warnings: string[] = [];
  if (options.largeBatchBeta && recipe.customNutrition) {
    warnings.push('Large batch beta is unavailable for recipes with published nutrition; ingredients scale proportionally.');
  }
  if (options.largeBatchBeta && factor > 4) {
    warnings.push('Above 4x, seasoning amounts remain proportional. Use a tested quantity recipe or make several smaller batches; no validated automatic seasoning adjustment is available.');
  }
  if (factor > 1 && recipe.servings * factor >= 50) {
    warnings.push('Large batch: test and standardize the recipe; equipment, cooking, and seasoning may not scale directly.');
  }

  const proportionalIds = new Set(options.proportionalIngredientIds ?? []);
  const useBeta = !!options.largeBatchBeta && !recipe.customNutrition;
  const ingredients = recipe.ingredients.map(ingredient => scaleIngredient(ingredient, factor, {
    largeBatchBeta: useBeta && !proportionalIds.has(ingredient.id),
    seasoningScalePercent: options.seasoningScalePercent,
  }));

  return {
    recipeId: recipe.id,
    ...(recipe.customNutrition ? { customNutrition: { ...recipe.customNutrition, nutrients: recipeNutrition({ customNutrition: recipe.customNutrition }, factor) } } : {}),
    scaleFactor: factor,
    servings: scaledServings,
    ingredients,
    warnings,
  };
}

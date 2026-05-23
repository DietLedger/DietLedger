import type {
  ScaleOptions,
  ScaledIngredient,
  ScaledRecipe,
  IngredientClassification,
} from '@/lib/types';
import { toBaseUnit, isCountUnit, formatAmount, getUnitSystem } from '@/lib/unit-conversion';

const SPICE_KEYWORDS = new Set([
  'salt', 'pepper', 'cumin', 'paprika', 'cinnamon', 'oregano', 'basil',
  'thyme', 'rosemary', 'turmeric', 'cayenne', 'chili', 'chili powder',
  'curry', 'ginger', 'nutmeg', 'cloves', 'coriander', 'cumin', 'saffron',
  'bay leaf', 'bay leaves', 'allspice', 'cardamom', 'clove', 'dill',
  'parsley', 'sage', 'mint', 'tarragon', 'chive', 'chives', 'cumin',
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

const SPICE_SCALE_POWER = 0.5;
const LEAVENING_MAX_FACTOR = 1.5;
const ACID_MAX_FACTOR = 1.5;

export function classifyIngredient(name: string): IngredientClassification {
  const lower = name.toLowerCase().trim();

  for (const kw of LEAVENING_KEYWORDS) {
    if (lower.includes(kw)) return 'leavening';
  }
  for (const kw of ACID_KEYWORDS) {
    if (lower.includes(kw)) return 'acid';
  }
  for (const kw of SPICE_KEYWORDS) {
    if (lower.includes(kw)) return 'spice';
  }

  return 'linear';
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

function applySmartScale(
  amount: number,
  classification: IngredientClassification,
  factor: number,
): { scaledAmount: number; reason?: string } {
  if (classification === 'count') {
    return { scaledAmount: Math.round(amount * factor) };
  }

  if (classification === 'spice') {
    if (factor > 1) {
      const spiceFactor = Math.pow(factor, SPICE_SCALE_POWER);
      return {
        scaledAmount: amount * spiceFactor,
        reason: 'spice \u2014 sub-linear scaling',
      };
    }
    return { scaledAmount: amount * factor };
  }

  if (classification === 'leavening') {
    const capped = Math.min(factor, LEAVENING_MAX_FACTOR);
    return {
      scaledAmount: amount * capped,
      reason: factor > LEAVENING_MAX_FACTOR ? 'leavening \u2014 capped to prevent overflow' : undefined,
    };
  }

  if (classification === 'acid') {
    const capped = Math.min(factor, ACID_MAX_FACTOR);
    return {
      scaledAmount: amount * capped,
      reason: factor > ACID_MAX_FACTOR ? 'acid \u2014 capped to prevent over-acidification' : undefined,
    };
  }

  return { scaledAmount: amount * factor };
}

export function smartScaleAmount(
  amount: number,
  unit: string,
  factor: number,
): { amount: number; unit: string; display: string } {
  const base = toBaseUnit(amount, unit);
  if (!base || base.type === 'count') {
    return { amount: amount * factor, unit, display: '' };
  }

  const scaledBase = base.amount * factor;
  const system = getUnitSystem();
  const display = formatAmount(scaledBase, base.type, system);

  return { amount: scaledBase, unit: base.baseUnit, display };
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
    if (Math.abs(frac - val) < 0.02) {
      return whole > 0 ? `${whole} ${sym}` : sym;
    }
  }

  const rounded = Math.round(scaledAmount * 100) / 100;
  return String(rounded);
}

export function scaleIngredient(
  ingredient: { id: string; name: string; amount: number; unit: string },
  factor: number,
): ScaledIngredient {
  const classification = classifyIngredient(ingredient.name);
  const { scaledAmount, reason } = applySmartScale(
    ingredient.amount,
    classification,
    factor,
  );

  const scaled = smartScaleAmount(ingredient.amount, ingredient.unit, factor);
  const display = scaled.display || formatScaledAmount(scaledAmount);

  return {
    id: ingredient.id,
    name: ingredient.name,
    originalAmount: ingredient.amount,
    originalUnit: ingredient.unit,
    scaledAmount,
    scaledUnit: ingredient.unit,
    displayAmount: display,
    classification,
    scaleReason: reason,
  };
}

export function scaleRecipe(
  recipe: {
    id: string;
    servings: number;
    ingredients: Array<{ id: string; name: string; amount: number; unit: string }>;
    totalCalories?: number;
  },
  options: ScaleOptions,
): ScaledRecipe {
  const opts: ScaleOptions = {
    ...options,
    originalServings: options.originalServings ?? recipe.servings,
    originalCalories: options.originalCalories ?? recipe.totalCalories,
  };

  const factor = computeScaleFactor(opts);
  const scaledServings = Math.round(recipe.servings * factor);

  const warnings: string[] = [];
  if (scaledServings >= 50) {
    warnings.push(
      `Batch mode: ${scaledServings} servings. Spice and leavening amounts are automatically adjusted.`,
    );
  }

  const ingredients = recipe.ingredients.map((ing) =>
    scaleIngredient(ing, factor),
  );

  return {
    recipeId: recipe.id,
    scaleFactor: factor,
    servings: scaledServings,
    ingredients,
    warnings,
  };
}

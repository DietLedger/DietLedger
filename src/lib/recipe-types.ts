import type { RecipeRecord, IngredientGroup } from '@/lib/api-client';

export interface InstructionStep {
  id: string;
  text: string;
  groupId: string | null;
}

export interface InstructionGroup {
  id: string;
  title: string;
}

export interface InstructionsPayload {
  steps: InstructionStep[];
  groups: InstructionGroup[];
}

export interface Ingredient {
  id: string;
  fdcId: number;
  name: string;
  amount: number;
  unit: string;
  description: string;
  calories: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  totalCarbs: number;
  dietaryFiber: number;
  totalSugars: number;
  addedSugars: number;
  protein: number;
  vitaminD: number;
  calcium: number;
  iron: number;
  potassium: number;
  groupId: string | null;
  linkedRecipeId: string | null;
  prepInstructions: string[];
  storageLocation: string;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  servingName: string;
  prepTime?: string;
  cookTime?: string;
  instructionSteps: InstructionStep[];
  instructionGroups: InstructionGroup[];
  ingredientGroups: IngredientGroup[];
  createdAt: string;
  updatedAt: string;
  ingredients: Ingredient[];
  leftoverStorage?: string;
}

export interface FDAFood {
  fdcId: number;
  description: string;
  brandOwner: string | null;
  dataType: string;
  servingSize: number;
  servingSizeUnit: string;
  nutrients: {
    calories: number;
    totalFat: number;
    saturatedFat: number;
    transFat: number;
    cholesterol: number;
    sodium: number;
    totalCarbs: number;
    dietaryFiber: number;
    totalSugars: number;
    addedSugars: number;
    protein: number;
    vitaminD: number;
    calcium: number;
    iron: number;
    potassium: number;
  };
}

export type NutrientKeys =
  | 'calories' | 'totalFat' | 'saturatedFat' | 'transFat'
  | 'cholesterol' | 'sodium' | 'totalCarbs' | 'dietaryFiber'
  | 'totalSugars' | 'addedSugars' | 'protein' | 'vitaminD'
  | 'calcium' | 'iron' | 'potassium';

export const NUTRIENT_KEYS: NutrientKeys[] = [
  'calories', 'totalFat', 'saturatedFat', 'transFat',
  'cholesterol', 'sodium', 'totalCarbs', 'dietaryFiber',
  'totalSugars', 'addedSugars', 'protein', 'vitaminD',
  'calcium', 'iron', 'potassium',
];

export function parseInstructions(raw: string | null): InstructionsPayload {
  if (!raw) return { steps: [], groups: [] };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        steps: parsed.map((s: { id?: string; text?: string }, i: number) => ({
          id: s.id || `migrated-${i}`,
          text: s.text || '',
          groupId: null,
        })),
        groups: [],
      };
    }
    if (parsed && parsed.steps) {
      return {
        steps: (parsed.steps as { id: string; text: string; groupId?: string | null }[]).map(s => ({
          ...s,
          groupId: s.groupId || null,
        })),
        groups: parsed.groups || [],
      };
    }
  } catch {}
  return { steps: [{ id: 'migrated-0', text: raw, groupId: null }], groups: [] };
}

export function serializeInstructions(payload: InstructionsPayload): string | null {
  if (payload.steps.length === 0) return null;
  return JSON.stringify(payload);
}

export function toPublicRecipe(r: RecipeRecord): Recipe {
  const instr = parseInstructions(r.instructions);
  let ingredientGroups = r.ingredientGroups || [];
  if (typeof ingredientGroups === 'string') {
    try { ingredientGroups = JSON.parse(ingredientGroups); } catch { ingredientGroups = []; }
  }
  return {
    ...r,
    instructionSteps: instr.steps,
    instructionGroups: instr.groups,
    ingredientGroups,
    ingredients: (r.ingredients || []).map((i) => ({
      ...i,
      groupId: i.groupId || null,
      linkedRecipeId: i.linkedRecipeId || null,
    })),
  };
}

export const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  oz: 28.35,
  lb: 453.6,
  cup: 240,
  tbsp: 15,
  tsp: 5,
  ml: 1,
  whole: 100,
};

export function convertToGrams(amount: number, unit: string): number {
  const factor = UNIT_TO_GRAMS[unit.toLowerCase()] || 1;
  return amount * factor;
}

export function emptyNutrition(): Record<NutrientKeys, number> {
  return {
    calories: 0, totalFat: 0, saturatedFat: 0, transFat: 0,
    cholesterol: 0, sodium: 0, totalCarbs: 0, dietaryFiber: 0,
    totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0,
    calcium: 0, iron: 0, potassium: 0,
  };
}

export function sumNutrition(items: Ingredient[]): Record<NutrientKeys, number> {
  const totals = emptyNutrition();
  for (const ing of items) {
    for (const key of NUTRIENT_KEYS) {
      totals[key] += ing[key];
    }
  }
  return totals;
}

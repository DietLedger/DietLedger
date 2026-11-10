import { NUTRIENT_KEYS, type NutrientKeys } from '@/lib/recipe-types';

/** A food is selectable when at least one canonical nutrient has a positive value. */
export function hasMeaningfulNutrition(nutrients: Partial<Record<NutrientKeys, number>>): boolean {
  return NUTRIENT_KEYS.some((key) => Number.isFinite(nutrients[key]) && nutrients[key]! > 0);
}

import { formatAmount, toBaseUnit } from '@/lib/unit-conversion';
import type { CookbookExportOptions, FoodPortion } from '@/lib/types';

type MeasurementSystem = CookbookExportOptions['measurementSystem'];

function roundGrams(grams: number): string {
  if (grams !== 0 && Math.abs(grams) < 0.01) {
    return String(Number(grams.toFixed(6)));
  }
  return String(Math.round(grams * 100) / 100);
}

const UNIT_NAMES: Record<string, string> = {
  grams: 'g', gram: 'g', kilograms: 'kg', kilogram: 'kg', milligrams: 'mg', milligram: 'mg',
  pounds: 'lb', pound: 'lb', lbs: 'lb', ounces: 'oz', ounce: 'oz',
  cups: 'cup', tablespoons: 'tbsp', tablespoon: 'tbsp', tbsps: 'tbsp',
  teaspoons: 'tsp', teaspoon: 'tsp', tsps: 'tsp',
  slices: 'slice', pieces: 'piece', cloves: 'clove',
  'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  pint: 'pt', pints: 'pt', quart: 'qt', quarts: 'qt', gallon: 'gal', gallons: 'gal',
  liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
};

function normalizedUnit(unit: string): string {
  const value = unit.trim().toLowerCase();
  return UNIT_NAMES[value] ?? value;
}

function portionMatchesUnit(portion: FoodPortion, unit: string): boolean {
  const target = normalizedUnit(unit);
  const measure = normalizedUnit(portion.measureUnit ?? '');
  const specifiedMeasure = measure === 'undetermined' ? '' : measure;
  // USDA sometimes places the bare measure in modifier when measureUnit is
  // "undetermined". A preparation modifier such as "chopped" is not a match.
  const modifier = normalizedUnit(portion.modifier ?? '');
  if ((specifiedMeasure && specifiedMeasure !== target) || (modifier && modifier !== target)) return false;
  // A description with extra preparation/size detail cannot safely stand in
  // for a bare recipe measure (e.g. "1 cup chopped" versus "1 cup").
  const description = (portion.portionDescription ?? '').toLowerCase().trim();
  if (description) {
    const describedUnit = description.replace(/^\d+(?:\.\d+)?\s*/, '');
    if (normalizedUnit(describedUnit) !== target) return false;
  }
  return Boolean(specifiedMeasure || description || modifier);
}

function gramsFromPortions(amount: number, unit: string, portions: FoodPortion[]): number | null {
  const matches = portions
    .filter((portion) => portion.amount > 0 && portion.gramWeight > 0 && Number.isFinite(portion.gramWeight) && portionMatchesUnit(portion, unit))
    .map((portion) => portion.gramWeight / portion.amount);
  if (!matches.length || matches.some((perUnit) => Math.abs(perUnit - matches[0]) > 0.001)) return null;
  return amount * matches[0];
}

export function formatCookbookIngredient(
  amount: number,
  unit: string,
  system: MeasurementSystem,
  portions: FoodPortion[] = [],
): { text: string; retainedOriginal: boolean } {
  const original = `${amount} ${unit}`.trim();
  if (!Number.isFinite(amount)) return { text: original, retainedOriginal: true };
  const base = toBaseUnit(amount, normalizedUnit(unit));
  if (system === 'grams') {
    const grams = base?.type === 'weight' ? base.amount : gramsFromPortions(amount, unit, portions);
    if (grams === null || !Number.isFinite(grams)) return { text: original, retainedOriginal: true };
    return { text: `${roundGrams(grams)} g`, retainedOriginal: false };
  }
  if (!base || base.type === 'count') return { text: original, retainedOriginal: true };
  if (base.type === 'weight') {
    const displayed = system === 'metric'
      ? (base.amount >= 1000 ? base.amount / 1000 : base.amount)
      : (base.amount >= 453.592 ? base.amount / 453.592 : base.amount / 28.3495);
    if (displayed !== 0 && Math.abs(displayed) < 0.005) {
      const label = system === 'metric' ? (base.amount >= 1000 ? 'kg' : 'g') : (base.amount >= 453.592 ? 'lb' : 'oz');
      return { text: `${Number(displayed.toPrecision(2))} ${label}`, retainedOriginal: false };
    }
  }
  return { text: formatAmount(base.amount, base.type, system), retainedOriginal: false };
}

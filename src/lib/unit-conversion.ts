const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1, oz: 28.3495, lb: 453.592, kg: 1000, mg: 0.001,
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, 'fl oz': 29.574,
  cup: 236.588, pt: 473.176, qt: 946.353, gal: 3785.41,
};

const VOLUME_TO_GRAMS: Record<string, number> = {
  cup: 240, tbsp: 15, tsp: 5, ml: 1, l: 1000,
  'fl oz': 30, pt: 480, qt: 960, gal: 3840,
};

const COUNT_UNITS = new Set([
  'whole', 'slice', 'piece', 'clove', 'leaf', 'sprig', 'pinch', 'dash',
  'can', 'bag', 'bunch', 'stick',
]);

export type UnitSystem = 'imperial' | 'metric';

const UNIT_SYSTEM_KEY = 'dietledger-unit-system';

export function getUnitSystem(): UnitSystem {
  if (typeof window === 'undefined') return 'imperial';
  return (localStorage.getItem(UNIT_SYSTEM_KEY) as UnitSystem) || 'imperial';
}

export function setUnitSystem(system: UnitSystem): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(UNIT_SYSTEM_KEY, system);
  import('@/lib/api-client').then(m => {
    const api = m.getApiClient();
    api.getSettings().then(settings => {
      api.updateSettings({ ...settings, unitSystem: system });
    });
  }).catch(() => {});
}

function normalizeUnit(unit: string): string {
  return unit.toLowerCase().trim();
}

export function isCountUnit(unit: string): boolean {
  return COUNT_UNITS.has(normalizeUnit(unit));
}

export function isWeightUnit(unit: string): boolean {
  return normalizeUnit(unit) in WEIGHT_TO_GRAMS;
}

export function isVolumeUnit(unit: string): boolean {
  return normalizeUnit(unit) in VOLUME_TO_ML;
}

export function toBaseUnit(amount: number, unit: string): { amount: number; type: 'weight' | 'volume' | 'count'; baseUnit: string } | null {
  const norm = normalizeUnit(unit);
  if (norm in WEIGHT_TO_GRAMS) {
    return { amount: amount * WEIGHT_TO_GRAMS[norm], type: 'weight', baseUnit: 'g' };
  }
  if (norm in VOLUME_TO_ML) {
    return { amount: amount * VOLUME_TO_ML[norm], type: 'volume', baseUnit: 'ml' };
  }
  if (COUNT_UNITS.has(norm)) {
    return { amount, type: 'count', baseUnit: norm };
  }
  return null;
}

export function formatAmount(baseAmount: number, type: 'weight' | 'volume' | 'count', system: UnitSystem, baseUnit?: string): string {
  if (type === 'count' && baseUnit) {
    return `${roundAmount(baseAmount)} ${baseUnit}${baseAmount !== 1 ? 's' : ''}`;
  }

  if (type === 'weight') {
    if (system === 'metric') {
      if (baseAmount >= 1000) return `${roundAmount(baseAmount / 1000)} kg`;
      return `${roundAmount(baseAmount)} g`;
    }
    if (baseAmount >= 453.592) return `${roundAmount(baseAmount / 453.592)} lb`;
    return `${roundAmount(baseAmount / 28.3495)} oz`;
  }

  if (type === 'volume') {
    if (system === 'metric') {
      if (baseAmount >= 1000) return `${roundAmount(baseAmount / 1000)} L`;
      return `${roundAmount(baseAmount)} ml`;
    }
    if (baseAmount >= 236.588) return `${roundAmount(baseAmount / 236.588)} cup${baseAmount / 236.588 > 1 ? 's' : ''}`;
    if (baseAmount >= 14.787) return `${roundAmount(baseAmount / 14.787)} tbsp`;
    return `${roundAmount(baseAmount / 4.929)} tsp`;
  }

  return `${roundAmount(baseAmount)}`;
}

function roundAmount(n: number): string {
  if (n === Math.floor(n)) return n.toString();
  const rounded = Math.round(n * 100) / 100;
  if (rounded === Math.floor(rounded)) return Math.floor(rounded).toString();
  return rounded.toString();
}

export const WEIGHT_UNITS = Object.keys(WEIGHT_TO_GRAMS);
export const VOLUME_UNITS = Object.keys(VOLUME_TO_GRAMS);
export const COUNT_UNITS_LIST = Array.from(COUNT_UNITS);
export const ALL_CONVERTIBLE_UNITS = [...WEIGHT_UNITS, ...VOLUME_UNITS];

export function gramsToUnit(grams: number, unit: string): number {
  const norm = normalizeUnit(unit);
  if (norm in WEIGHT_TO_GRAMS) return grams / WEIGHT_TO_GRAMS[norm];
  if (norm in VOLUME_TO_GRAMS) return grams / VOLUME_TO_GRAMS[norm];
  return grams;
}

export function unitToGrams(amount: number, unit: string): number {
  const norm = normalizeUnit(unit);
  if (norm in WEIGHT_TO_GRAMS) return amount * WEIGHT_TO_GRAMS[norm];
  if (norm in VOLUME_TO_GRAMS) return amount * VOLUME_TO_GRAMS[norm];
  return 0;
}

export function defaultDisplayUnit(totalGrams: number, system: UnitSystem): string {
  if (system === 'metric') return totalGrams >= 1000 ? 'kg' : 'g';
  return totalGrams >= 453.592 ? 'lb' : 'oz';
}

export function formatGramsAs(grams: number, unit: string): string {
  const amount = gramsToUnit(grams, unit);
  return `${roundAmount(amount)} ${unit}`;
}

export interface AggregatedIngredient {
  name: string;
  totalGrams: number;
  countParts: Array<{ unit: string; amount: number }>;
  unknownParts: Array<{ unit: string; amount: number }>;
  displayAmount: string;
}

export function aggregateIngredients(
  ingredients: Array<{ name: string; amount: number; unit: string }>
): AggregatedIngredient[] {
  const byName = new Map<string, Array<{ amount: number; unit: string }>>();

  for (const ing of ingredients) {
    const key = ing.name.toLowerCase().trim();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push({ amount: ing.amount, unit: ing.unit });
  }

  const system = getUnitSystem();
  const results: AggregatedIngredient[] = [];

  for (const [key, items] of byName) {
    const name = items.length > 0 ? ingredients.find(i => i.name.toLowerCase().trim() === key)!.name : key;
    const result = computeAggregation(items, system);
    results.push({ name, ...result });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function computeAggregation(
  items: Array<{ amount: number; unit: string }>,
  system: UnitSystem,
): Omit<AggregatedIngredient, 'name'> {
  let totalGrams = 0;
  const countMap = new Map<string, number>();
  const unknownMap = new Map<string, number>();

  for (const item of items) {
    const norm = normalizeUnit(item.unit);
    const converted = toBaseUnit(item.amount, item.unit);

    if (converted && converted.type === 'weight') {
      totalGrams += converted.amount;
    } else if (norm in VOLUME_TO_GRAMS) {
      totalGrams += item.amount * VOLUME_TO_GRAMS[norm];
    } else if (converted && converted.type === 'count') {
      countMap.set(converted.baseUnit, (countMap.get(converted.baseUnit) || 0) + converted.amount);
    } else {
      unknownMap.set(norm, (unknownMap.get(norm) || 0) + item.amount);
    }
  }

  const countParts = Array.from(countMap.entries()).map(([unit, amount]) => ({ unit, amount }));
  const unknownParts = Array.from(unknownMap.entries()).map(([unit, amount]) => ({ unit, amount }));

  const parts: string[] = [];
  if (totalGrams > 0) parts.push(formatAmount(totalGrams, 'weight', system));
  for (const [unit, total] of countMap) {
    parts.push(`${roundAmount(total)} ${unit}${total !== 1 ? 's' : ''}`);
  }
  for (const [unit, total] of unknownMap) {
    parts.push(`${roundAmount(total)} ${unit}${total !== 1 ? 's' : ''}`);
  }

  return { totalGrams, countParts, unknownParts, displayAmount: parts.join(' + ') };
}

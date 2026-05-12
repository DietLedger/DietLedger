const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1, oz: 28.3495, lb: 453.592, kg: 1000, mg: 0.001,
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, 'fl oz': 29.574,
  cup: 236.588, pt: 473.176, qt: 946.353, gal: 3785.41,
};

const COUNT_UNITS = new Set([
  'whole', 'slice', 'piece', 'clove', 'leaf', 'sprig', 'pinch', 'dash',
  'can', 'bag', 'bunch', 'stick',
]);

export type UnitSystem = 'imperial' | 'metric';

const UNIT_SYSTEM_KEY = 'nutrilabel-unit-system';

export function getUnitSystem(): UnitSystem {
  if (typeof window === 'undefined') return 'imperial';
  return (localStorage.getItem(UNIT_SYSTEM_KEY) as UnitSystem) || 'imperial';
}

export function setUnitSystem(system: UnitSystem): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(UNIT_SYSTEM_KEY, system);
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

export interface AggregatedIngredient {
  name: string;
  totalAmount: number;
  type: 'weight' | 'volume' | 'count';
  baseUnit: string;
  displayAmount: string;
  countItems?: { amount: number; unit: string }[];
}

export function aggregateIngredients(
  ingredients: Array<{ name: string; amount: number; unit: string }>
): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>();

  for (const ing of ingredients) {
    const key = ing.name.toLowerCase().trim();
    const converted = toBaseUnit(ing.amount, ing.unit);

    if (!converted) {
      const existing = map.get(`${key}::${normalizeUnit(ing.unit)}::count`);
      if (existing) {
        existing.totalAmount += ing.amount;
        existing.countItems!.push({ amount: ing.amount, unit: ing.unit });
      } else {
        map.set(`${key}::${normalizeUnit(ing.unit)}::count`, {
          name: ing.name,
          totalAmount: ing.amount,
          type: 'count',
          baseUnit: normalizeUnit(ing.unit),
          displayAmount: `${ing.amount} ${ing.unit}`,
          countItems: [{ amount: ing.amount, unit: ing.unit }],
        });
      }
      continue;
    }

    if (converted.type === 'count') {
      const existing = map.get(`${key}::${converted.baseUnit}::count`);
      if (existing) {
        existing.totalAmount += converted.amount;
        existing.countItems!.push({ amount: ing.amount, unit: ing.unit });
      } else {
        map.set(`${key}::${converted.baseUnit}::count`, {
          name: ing.name,
          totalAmount: converted.amount,
          type: 'count',
          baseUnit: converted.baseUnit,
          displayAmount: '',
          countItems: [{ amount: ing.amount, unit: ing.unit }],
        });
      }
    } else {
      const aggKey = `${key}::${converted.type}`;
      const existing = map.get(aggKey);
      if (existing) {
        existing.totalAmount += converted.amount;
      } else {
        map.set(aggKey, {
          name: ing.name,
          totalAmount: converted.amount,
          type: converted.type,
          baseUnit: converted.baseUnit,
          displayAmount: '',
        });
      }
    }
  }

  const system = getUnitSystem();
  const results: AggregatedIngredient[] = [];
  for (const agg of map.values()) {
    if (agg.type === 'count' && agg.countItems && agg.countItems.length === 1) {
      const item = agg.countItems[0];
      agg.displayAmount = `${roundAmount(item.amount)} ${item.unit}`;
    } else {
      agg.displayAmount = formatAmount(agg.totalAmount, agg.type, system, agg.baseUnit);
    }
    results.push(agg);
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

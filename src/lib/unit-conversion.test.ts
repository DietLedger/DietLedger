import { describe, it, expect } from 'vitest';
import {
  toBaseUnit,
  isCountUnit,
  isWeightUnit,
  isVolumeUnit,
  gramsToUnit,
  unitToGrams,
} from './unit-conversion';

describe('toBaseUnit', () => {
  it('converts grams', () => {
    expect(toBaseUnit(100, 'g')).toEqual({ amount: 100, type: 'weight', baseUnit: 'g' });
  });

  it('converts ounces to grams', () => {
    const result = toBaseUnit(1, 'oz');
    expect(result).not.toBeNull();
    expect(result!.amount).toBeCloseTo(28.3495, 3);
    expect(result!.type).toBe('weight');
  });

  it('converts cups to ml', () => {
    const result = toBaseUnit(1, 'cup');
    expect(result).not.toBeNull();
    expect(result!.amount).toBeCloseTo(236.588, 2);
    expect(result!.type).toBe('volume');
  });

  it('handles count units', () => {
    expect(toBaseUnit(2, 'whole')).toEqual({ amount: 2, type: 'count', baseUnit: 'whole' });
  });

  it('returns null for unknown unit', () => {
    expect(toBaseUnit(1, 'splash')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(toBaseUnit(100, 'G')).toEqual({ amount: 100, type: 'weight', baseUnit: 'g' });
    expect(toBaseUnit(1, 'Cup')!.type).toBe('volume');
  });
});

describe('isCountUnit', () => {
  it('recognizes count units', () => {
    expect(isCountUnit('whole')).toBe(true);
    expect(isCountUnit('slice')).toBe(true);
    expect(isCountUnit('clove')).toBe(true);
    expect(isCountUnit('pinch')).toBe(true);
  });

  it('rejects weight units', () => {
    expect(isCountUnit('g')).toBe(false);
  });

  it('rejects volume units', () => {
    expect(isCountUnit('cup')).toBe(false);
  });
});

describe('isWeightUnit', () => {
  it('recognizes weight units', () => {
    expect(isWeightUnit('g')).toBe(true);
    expect(isWeightUnit('oz')).toBe(true);
    expect(isWeightUnit('lb')).toBe(true);
    expect(isWeightUnit('kg')).toBe(true);
  });

  it('rejects volume units', () => {
    expect(isWeightUnit('cup')).toBe(false);
  });
});

describe('isVolumeUnit', () => {
  it('recognizes volume units', () => {
    expect(isVolumeUnit('cup')).toBe(true);
    expect(isVolumeUnit('tsp')).toBe(true);
    expect(isVolumeUnit('tbsp')).toBe(true);
    expect(isVolumeUnit('ml')).toBe(true);
  });

  it('rejects weight units', () => {
    expect(isVolumeUnit('g')).toBe(false);
  });
});

describe('gramsToUnit / unitToGrams', () => {
  it('converts grams to ounces', () => {
    expect(gramsToUnit(28.3495, 'oz')).toBeCloseTo(1, 3);
  });

  it('converts ounces to grams', () => {
    expect(unitToGrams(1, 'oz')).toBeCloseTo(28.3495, 3);
  });

  it('converts grams to grams', () => {
    expect(gramsToUnit(100, 'g')).toBe(100);
    expect(unitToGrams(100, 'g')).toBe(100);
  });

  it('handles volume unit approximations', () => {
    expect(unitToGrams(1, 'cup')).toBe(240);
    expect(gramsToUnit(240, 'cup')).toBeCloseTo(1, 3);
  });

  it('returns grams for unknown unit', () => {
    expect(gramsToUnit(100, 'unknown')).toBe(100);
  });

  it('returns 0 for unknown unit to grams', () => {
    expect(unitToGrams(100, 'unknown')).toBe(0);
  });
});

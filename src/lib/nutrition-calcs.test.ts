import { describe, it, expect } from 'vitest';
import {
  calculateBMI,
  getBmiCategory,
  getBmiCategoryLabel,
  calculateMifflinStJeor,
  calculateHarrisBenedict,
  calculateOwen,
  calculateTDEE,
  calculateGoalCalories,
  getGoalCalorieWarning,
  resolveEquation,
} from './nutrition-calcs';

describe('calculateBMI', () => {
  it('calculates BMI correctly', () => {
    expect(calculateBMI(70, 175)).toBe(22.9);
  });

  it('returns null for missing weight', () => {
    expect(calculateBMI(null, 175)).toBeNull();
  });

  it('returns null for missing height', () => {
    expect(calculateBMI(70, null)).toBeNull();
  });

  it('returns null for zero height', () => {
    expect(calculateBMI(70, 0)).toBeNull();
  });

  it('returns null for undefined inputs', () => {
    expect(calculateBMI(undefined, undefined)).toBeNull();
  });
});

describe('getBmiCategory', () => {
  it('classifies underweight', () => {
    expect(getBmiCategory(17)).toBe('underweight');
  });

  it('classifies healthy', () => {
    expect(getBmiCategory(22)).toBe('healthy');
  });

  it('classifies overweight', () => {
    expect(getBmiCategory(27)).toBe('overweight');
  });

  it('classifies obese1', () => {
    expect(getBmiCategory(32)).toBe('obese1');
  });

  it('classifies obese2', () => {
    expect(getBmiCategory(37)).toBe('obese2');
  });

  it('classifies obese3', () => {
    expect(getBmiCategory(42)).toBe('obese3');
  });

  it('returns null for null', () => {
    expect(getBmiCategory(null)).toBeNull();
  });
});

describe('getBmiCategoryLabel', () => {
  it('returns label for healthy', () => {
    expect(getBmiCategoryLabel('healthy')).toBe('Healthy Weight');
  });

  it('returns empty string for null', () => {
    expect(getBmiCategoryLabel(null)).toBe('');
  });
});

describe('calculateMifflinStJeor', () => {
  it('calculates for male', () => {
    const result = calculateMifflinStJeor(80, 180, 30, 'male');
    expect(result).toBe(Math.round(10 * 80 + 6.25 * 180 - 5 * 30 + 5));
  });

  it('calculates for female', () => {
    const result = calculateMifflinStJeor(65, 165, 25, 'female');
    expect(result).toBe(Math.round(10 * 65 + 6.25 * 165 - 5 * 25 - 161));
  });
});

describe('calculateHarrisBenedict', () => {
  it('calculates for male', () => {
    const result = calculateHarrisBenedict(80, 180, 30, 'male');
    expect(result).toBe(Math.round(88.362 + 13.397 * 80 + 4.799 * 180 - 5.677 * 30));
  });

  it('calculates for female', () => {
    const result = calculateHarrisBenedict(65, 165, 25, 'female');
    expect(result).toBe(Math.round(447.593 + 9.247 * 65 + 3.098 * 165 - 4.330 * 25));
  });
});

describe('calculateOwen', () => {
  it('calculates for male', () => {
    expect(calculateOwen(80, 'male')).toBe(Math.round(879 + 10.2 * 80));
  });

  it('calculates for female', () => {
    expect(calculateOwen(65, 'female')).toBe(Math.round(795 + 7.18 * 65));
  });
});

describe('calculateTDEE', () => {
  it('calculates TDEE for moderate activity', () => {
    const bmr = 1700;
    const tdee = calculateTDEE(bmr, 'moderate');
    expect(tdee).toBe(Math.round(bmr * 1.55));
  });

  it('returns null for null bmr', () => {
    expect(calculateTDEE(null, 'moderate')).toBeNull();
  });

  it('returns null for null activity', () => {
    expect(calculateTDEE(1700, null)).toBeNull();
  });
});

describe('calculateGoalCalories', () => {
  it('returns tdee when weights are equal', () => {
    expect(calculateGoalCalories(2000, 70, 70, '2030-01-01')).toBe(2000);
  });

  it('returns null for missing inputs', () => {
    expect(calculateGoalCalories(null, 70, 65, '2030-01-01')).toBeNull();
    expect(calculateGoalCalories(2000, null, 65, '2030-01-01')).toBeNull();
    expect(calculateGoalCalories(2000, 70, null, '2030-01-01')).toBeNull();
    expect(calculateGoalCalories(2000, 70, 65, null)).toBeNull();
  });
});

describe('getGoalCalorieWarning', () => {
  it('warns for female below 1200', () => {
    const warning = getGoalCalorieWarning(1000, 'female');
    expect(warning).toContain('1000');
    expect(warning).toContain('1200');
  });

  it('warns for male below 1500', () => {
    const warning = getGoalCalorieWarning(1200, 'male');
    expect(warning).toContain('1500');
  });

  it('returns null for safe calories', () => {
    expect(getGoalCalorieWarning(2000, 'female')).toBeNull();
  });

  it('returns null for null inputs', () => {
    expect(getGoalCalorieWarning(null, 'female')).toBeNull();
    expect(getGoalCalorieWarning(2000, null)).toBeNull();
  });
});

describe('resolveEquation', () => {
  it('returns indirectCalorimetry as-is', () => {
    expect(resolveEquation('indirectCalorimetry', 'obese3')).toBe('indirectCalorimetry');
  });

  it('returns mifflin for auto', () => {
    expect(resolveEquation('auto', 'healthy')).toBe('mifflin');
  });

  it('forces mifflin for obese class 2+ with non-mifflin equation', () => {
    expect(resolveEquation('harrisBenedict', 'obese2')).toBe('mifflin');
  });

  it('keeps selected equation for non-obese', () => {
    expect(resolveEquation('harrisBenedict', 'healthy')).toBe('harrisBenedict');
  });
});

// Display units for canonical nutrients and legacy profile aliases.
export function nutrientUnit(nutrient: string): string {
  if (nutrient === 'calories') return 'kcal';
  if (nutrient === 'vitaminD') return 'mcg';
  if (['sodium', 'cholesterol', 'calcium', 'iron', 'potassium'].includes(nutrient)) return 'mg';
  return 'g';
}

export const NUTRIENT_MAP = {
  1008: 'calories',
  1004: 'totalFat',
  1258: 'saturatedFat',
  1257: 'transFat',
  1253: 'cholesterol',
  1093: 'sodium',
  1005: 'totalCarbs',
  1079: 'dietaryFiber',
  2000: 'totalSugars',
  1235: 'addedSugars',
  1003: 'protein',
  1114: 'vitaminD',
  1087: 'calcium',
  1089: 'iron',
  1092: 'potassium',
} as const;

export type NutrientField = (typeof NUTRIENT_MAP)[keyof typeof NUTRIENT_MAP];

export function extractNutrients(
  foodNutrients: Array<{ nutrientId?: number; value?: number }>,
  dataType: string,
  servingSize: number,
  servingSizeUnit: string
): Record<NutrientField, number> {
  const getNutrient = (nutrientId: number) => {
    const n = foodNutrients.find((nt) => nt.nutrientId === nutrientId);
    return n ? n.value || 0 : 0;
  };

  let scale = 1;
  if (dataType === 'Branded' && servingSizeUnit === 'g' && servingSize > 0) {
    scale = 100 / servingSize;
  }

  const scaleVal = (v: number) => Math.round(v * scale * 100) / 100;

  return {
    calories: scaleVal(getNutrient(1008)),
    totalFat: scaleVal(getNutrient(1004)),
    saturatedFat: scaleVal(getNutrient(1258)),
    transFat: scaleVal(getNutrient(1257)),
    cholesterol: scaleVal(getNutrient(1253)),
    sodium: scaleVal(getNutrient(1093)),
    totalCarbs: scaleVal(getNutrient(1005)),
    dietaryFiber: scaleVal(getNutrient(1079)),
    totalSugars: scaleVal(getNutrient(2000)),
    addedSugars: scaleVal(getNutrient(1235)),
    protein: scaleVal(getNutrient(1003)),
    vitaminD: scaleVal(getNutrient(1114)),
    calcium: scaleVal(getNutrient(1087)),
    iron: scaleVal(getNutrient(1089)),
    potassium: scaleVal(getNutrient(1092)),
  };
}

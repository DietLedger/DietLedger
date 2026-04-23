// Built-in fallback food database when FDA API is unavailable
// All nutrient values are per 100g, matching FDA FoodData Central format

export interface FallbackFood {
  fdcId: number;
  description: string;
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

export const FALLBACK_FOODS: FallbackFood[] = [
  {
    fdcId: 900001,
    description: "Chicken, breast, skinless, boneless, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 120, totalFat: 1.5, saturatedFat: 0.4, transFat: 0, cholesterol: 70, sodium: 50, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 25, vitaminD: 0.2, calcium: 6, iron: 0.4, potassium: 256 }
  },
  {
    fdcId: 900002,
    description: "Rice, white, long grain, regular, cooked",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 130, totalFat: 0.3, saturatedFat: 0.1, transFat: 0, cholesterol: 0, sodium: 1, totalCarbs: 28, dietaryFiber: 0.4, totalSugars: 0, addedSugars: 0, protein: 2.7, vitaminD: 0, calcium: 10, iron: 0.2, potassium: 35 }
  },
  {
    fdcId: 900003,
    description: "Broccoli, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 34, totalFat: 0.4, saturatedFat: 0.1, transFat: 0, cholesterol: 0, sodium: 33, totalCarbs: 7, dietaryFiber: 2.6, totalSugars: 1.7, addedSugars: 0, protein: 2.8, vitaminD: 0, calcium: 47, iron: 0.7, potassium: 316 }
  },
  {
    fdcId: 900004,
    description: "Salmon, Atlantic, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 208, totalFat: 13, saturatedFat: 2.1, transFat: 0, cholesterol: 55, sodium: 59, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 20, vitaminD: 12.3, calcium: 9, iron: 0.3, potassium: 363 }
  },
  {
    fdcId: 900005,
    description: "Egg, whole, raw, fresh",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 143, totalFat: 10, saturatedFat: 3.1, transFat: 0, cholesterol: 373, sodium: 142, totalCarbs: 0.7, dietaryFiber: 0, totalSugars: 0.4, addedSugars: 0, protein: 12.6, vitaminD: 2, calcium: 56, iron: 1.8, potassium: 138 }
  },
  {
    fdcId: 900006,
    description: "Banana, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 89, totalFat: 0.3, saturatedFat: 0.1, transFat: 0, cholesterol: 0, sodium: 1, totalCarbs: 23, dietaryFiber: 2.6, totalSugars: 12, addedSugars: 0, protein: 1.1, vitaminD: 0, calcium: 5, iron: 0.3, potassium: 358 }
  },
  {
    fdcId: 900007,
    description: "Apple, raw, with skin",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 52, totalFat: 0.2, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 1, totalCarbs: 14, dietaryFiber: 2.4, totalSugars: 10, addedSugars: 0, protein: 0.3, vitaminD: 0, calcium: 6, iron: 0.1, potassium: 107 }
  },
  {
    fdcId: 900008,
    description: "Beef, ground, 80% lean meat / 20% fat, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 254, totalFat: 17, saturatedFat: 6.4, transFat: 0.8, cholesterol: 78, sodium: 66, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 17.2, vitaminD: 0.3, calcium: 17, iron: 1.7, potassium: 270 }
  },
  {
    fdcId: 900009,
    description: "Potato, raw, skin",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 77, totalFat: 0.1, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 6, totalCarbs: 17, dietaryFiber: 2.2, totalSugars: 0.8, addedSugars: 0, protein: 2, vitaminD: 0, calcium: 12, iron: 0.8, potassium: 421 }
  },
  {
    fdcId: 900010,
    description: "Milk, whole, 3.25% milkfat",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 61, totalFat: 3.3, saturatedFat: 1.9, transFat: 0.1, cholesterol: 10, sodium: 43, totalCarbs: 4.8, dietaryFiber: 0, totalSugars: 5.1, addedSugars: 0, protein: 3.2, vitaminD: 1.3, calcium: 113, iron: 0, potassium: 132 }
  },
  {
    fdcId: 900011,
    description: "Bread, white, commercially prepared",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 265, totalFat: 3.2, saturatedFat: 0.5, transFat: 0, cholesterol: 0, sodium: 491, totalCarbs: 49, dietaryFiber: 2.7, totalSugars: 5, addedSugars: 3, protein: 9, vitaminD: 0, calcium: 151, iron: 3.6, potassium: 126 }
  },
  {
    fdcId: 900012,
    description: "Pasta, spaghetti, cooked, enriched",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 157, totalFat: 0.9, saturatedFat: 0.2, transFat: 0, cholesterol: 0, sodium: 1, totalCarbs: 31, dietaryFiber: 1.8, totalSugars: 0.6, addedSugars: 0, protein: 5.8, vitaminD: 0, calcium: 7, iron: 1.3, potassium: 44 }
  },
  {
    fdcId: 900013,
    description: "Tomato, raw, red, ripe",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 18, totalFat: 0.2, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 5, totalCarbs: 3.9, dietaryFiber: 1.2, totalSugars: 2.6, addedSugars: 0, protein: 0.9, vitaminD: 0, calcium: 10, iron: 0.3, potassium: 237 }
  },
  {
    fdcId: 900014,
    description: "Cheese, cheddar",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 403, totalFat: 33, saturatedFat: 19, transFat: 0.8, cholesterol: 105, sodium: 621, totalCarbs: 1.3, dietaryFiber: 0, totalSugars: 0.5, addedSugars: 0, protein: 25, vitaminD: 0.6, calcium: 721, iron: 0.7, potassium: 98 }
  },
  {
    fdcId: 900015,
    description: "Butter, salted",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 717, totalFat: 81, saturatedFat: 51, transFat: 3.3, cholesterol: 215, sodium: 643, totalCarbs: 0.1, dietaryFiber: 0, totalSugars: 0.1, addedSugars: 0, protein: 0.9, vitaminD: 1.5, calcium: 24, iron: 0, potassium: 24 }
  },
  {
    fdcId: 900016,
    description: "Onion, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 40, totalFat: 0.1, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 4, totalCarbs: 9.3, dietaryFiber: 1.7, totalSugars: 4.2, addedSugars: 0, protein: 1.1, vitaminD: 0, calcium: 23, iron: 0.2, potassium: 146 }
  },
  {
    fdcId: 900017,
    description: "Carrot, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 41, totalFat: 0.2, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 69, totalCarbs: 10, dietaryFiber: 2.8, totalSugars: 4.7, addedSugars: 0, protein: 0.9, vitaminD: 0, calcium: 33, iron: 0.3, potassium: 320 }
  },
  {
    fdcId: 900018,
    description: "Spinach, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 23, totalFat: 0.4, saturatedFat: 0.1, transFat: 0, cholesterol: 0, sodium: 79, totalCarbs: 3.6, dietaryFiber: 2.2, totalSugars: 0.4, addedSugars: 0, protein: 2.9, vitaminD: 0, calcium: 99, iron: 2.7, potassium: 558 }
  },
  {
    fdcId: 900019,
    description: "Olive oil, extra virgin",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 884, totalFat: 100, saturatedFat: 14, transFat: 0, cholesterol: 0, sodium: 2, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0, calcium: 1, iron: 0.6, potassium: 1 }
  },
  {
    fdcId: 900020,
    description: "Garlic, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 149, totalFat: 0.5, saturatedFat: 0.1, transFat: 0, cholesterol: 0, sodium: 17, totalCarbs: 33, dietaryFiber: 2.1, totalSugars: 1, addedSugars: 0, protein: 6.4, vitaminD: 0, calcium: 181, iron: 1.7, potassium: 401 }
  },
  {
    fdcId: 900021,
    description: "Avocado, raw, all commercial varieties",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 160, totalFat: 15, saturatedFat: 2.1, transFat: 0, cholesterol: 0, sodium: 7, totalCarbs: 9, dietaryFiber: 6.7, totalSugars: 0.7, addedSugars: 0, protein: 2, vitaminD: 0, calcium: 12, iron: 0.6, potassium: 485 }
  },
  {
    fdcId: 900022,
    description: "Sweet potato, raw, unprepared",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 86, totalFat: 0.1, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 55, totalCarbs: 20, dietaryFiber: 3, totalSugars: 4.2, addedSugars: 0, protein: 1.6, vitaminD: 0, calcium: 30, iron: 0.6, potassium: 337 }
  },
  {
    fdcId: 900023,
    description: "Almonds, raw, unblanched",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 579, totalFat: 50, saturatedFat: 3.8, transFat: 0, cholesterol: 0, sodium: 1, totalCarbs: 22, dietaryFiber: 12.5, totalSugars: 4.4, addedSugars: 0, protein: 21, vitaminD: 0, calcium: 269, iron: 3.7, potassium: 733 }
  },
  {
    fdcId: 900024,
    description: "Oats, rolled, dry",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 389, totalFat: 6.9, saturatedFat: 1.2, transFat: 0, cholesterol: 0, sodium: 2, totalCarbs: 66, dietaryFiber: 10.6, totalSugars: 0, addedSugars: 0, protein: 16.9, vitaminD: 0, calcium: 54, iron: 4.7, potassium: 429 }
  },
  {
    fdcId: 900025,
    description: "Greek yogurt, plain, nonfat",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 59, totalFat: 0.7, saturatedFat: 0.1, transFat: 0, cholesterol: 3, sodium: 47, totalCarbs: 3.6, dietaryFiber: 0, totalSugars: 3.2, addedSugars: 0, protein: 10.9, vitaminD: 0, calcium: 110, iron: 0.1, potassium: 141 }
  },
  {
    fdcId: 900026,
    description: "Tofu, raw, firm, prepared with calcium sulfate",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 76, totalFat: 4.8, saturatedFat: 0.7, transFat: 0, cholesterol: 0, sodium: 14, totalCarbs: 1.9, dietaryFiber: 0.3, totalSugars: 0.6, addedSugars: 0, protein: 8.1, vitaminD: 0, calcium: 350, iron: 5.4, potassium: 121 }
  },
  {
    fdcId: 900027,
    description: "Shrimp, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 99, totalFat: 0.3, saturatedFat: 0.1, transFat: 0, cholesterol: 189, sodium: 111, totalCarbs: 0.2, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 24, vitaminD: 0, calcium: 52, iron: 0.2, potassium: 259 }
  },
  {
    fdcId: 900028,
    description: "Lemon, raw, without peel",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 29, totalFat: 0.3, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 2, totalCarbs: 9.3, dietaryFiber: 2.8, totalSugars: 2.5, addedSugars: 0, protein: 1.1, vitaminD: 0, calcium: 26, iron: 0.6, potassium: 138 }
  },
  {
    fdcId: 900029,
    description: "Pepper, bell, red, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 31, totalFat: 0.3, saturatedFat: 0.1, transFat: 0, cholesterol: 0, sodium: 4, totalCarbs: 6, dietaryFiber: 2.1, totalSugars: 4.2, addedSugars: 0, protein: 1, vitaminD: 0, calcium: 7, iron: 0.4, potassium: 211 }
  },
  {
    fdcId: 900030,
    description: "Honey, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 304, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 4, totalCarbs: 82, dietaryFiber: 0.2, totalSugars: 82, addedSugars: 82, protein: 0.3, vitaminD: 0, calcium: 6, iron: 0.4, potassium: 52 }
  },
  {
    fdcId: 900031,
    description: "Peanut butter, smooth, with salt",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 588, totalFat: 50, saturatedFat: 10, transFat: 0, cholesterol: 0, sodium: 459, totalCarbs: 20, dietaryFiber: 6, totalSugars: 9, addedSugars: 4, protein: 25, vitaminD: 0, calcium: 43, iron: 1.7, potassium: 649 }
  },
  {
    fdcId: 900032,
    description: "Cucumber, raw, with peel",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 15, totalFat: 0.1, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 2, totalCarbs: 3.6, dietaryFiber: 0.5, totalSugars: 1.7, addedSugars: 0, protein: 0.7, vitaminD: 0, calcium: 16, iron: 0.3, potassium: 147 }
  },
  {
    fdcId: 900033,
    description: "Mushrooms, white, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 22, totalFat: 0.3, saturatedFat: 0.1, transFat: 0, cholesterol: 0, sodium: 5, totalCarbs: 3.3, dietaryFiber: 1, totalSugars: 2, addedSugars: 0, protein: 3.1, vitaminD: 0.2, calcium: 3, iron: 0.5, potassium: 318 }
  },
  {
    fdcId: 900034,
    description: "Tuna, light, canned in water, drained solids",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 86, totalFat: 0.8, saturatedFat: 0.2, transFat: 0, cholesterol: 30, sodium: 338, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 20, vitaminD: 1.7, calcium: 11, iron: 1, potassium: 189 }
  },
  {
    fdcId: 900035,
    description: "Lentils, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 352, totalFat: 1.1, saturatedFat: 0.2, transFat: 0, cholesterol: 0, sodium: 6, totalCarbs: 63, dietaryFiber: 10.7, totalSugars: 2, addedSugars: 0, protein: 25, vitaminD: 0, calcium: 35, iron: 6.5, potassium: 677 }
  },
  {
    fdcId: 900036,
    description: "Black beans, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 341, totalFat: 1.4, saturatedFat: 0.3, transFat: 0, cholesterol: 0, sodium: 5, totalCarbs: 63, dietaryFiber: 15.2, totalSugars: 2.1, addedSugars: 0, protein: 22, vitaminD: 0, calcium: 123, iron: 5, potassium: 955 }
  },
  {
    fdcId: 900037,
    description: "Quinoa, cooked",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 120, totalFat: 1.9, saturatedFat: 0.2, transFat: 0, cholesterol: 0, sodium: 7, totalCarbs: 21, dietaryFiber: 2.8, totalSugars: 0.9, addedSugars: 0, protein: 4.4, vitaminD: 0, calcium: 17, iron: 1.5, potassium: 172 }
  },
  {
    fdcId: 900038,
    description: "Coconut oil, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 892, totalFat: 99, saturatedFat: 82, transFat: 0, cholesterol: 0, sodium: 0, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0, calcium: 1, iron: 0, potassium: 0 }
  },
  {
    fdcId: 900039,
    description: "Chicken thigh, boneless, skinless, raw",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 119, totalFat: 3.9, saturatedFat: 1.1, transFat: 0, cholesterol: 82, sodium: 74, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 20, vitaminD: 0.3, calcium: 11, iron: 0.8, potassium: 232 }
  },
  {
    fdcId: 900040,
    description: "Flour, all-purpose, wheat, enriched",
    dataType: "Foundation",
    servingSize: 100,
    servingSizeUnit: "g",
    nutrients: { calories: 364, totalFat: 1, saturatedFat: 0.2, transFat: 0, cholesterol: 0, sodium: 2, totalCarbs: 76, dietaryFiber: 2.7, totalSugars: 0.3, addedSugars: 0, protein: 10, vitaminD: 0, calcium: 15, iron: 4.6, potassium: 107 }
  },
];

export function searchFallbackFoods(query: string): FallbackFood[] {
  const lowerQuery = query.toLowerCase();
  return FALLBACK_FOODS.filter((food) =>
    food.description.toLowerCase().includes(lowerQuery)
  ).slice(0, 25);
}

export function searchFallbackFoodsAsResult(query: string): Array<FallbackFood & { brandOwner: string | null }> {
  return searchFallbackFoods(query).map((food) => ({ ...food, brandOwner: null as string | null }));
}

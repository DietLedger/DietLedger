import type {
  Allergen,
  DietaryTag,
  AllergenDetection,
  DietaryProfileRecord,
} from '@/lib/types';
import { ALLERGEN_KEYWORDS, ALLERGEN_EXCLUSIONS, DIETARY_RULES } from '@/data/allergen-keywords';

export { ALLERGEN_KEYWORDS, DIETARY_RULES } from '@/data/allergen-keywords';

export function detectAllergens(
  ingredients: Array<{ name: string }>,
): AllergenDetection[] {
  const detections: Map<Allergen, AllergenDetection> = new Map();

  for (const ingredient of ingredients) {
    const lowerName = ingredient.name.toLowerCase().trim();

    const excludedAllergens = new Set<string>();
    for (const [keyword, allergens] of Object.entries(ALLERGEN_EXCLUSIONS)) {
      if (lowerName.includes(keyword.toLowerCase())) {
        for (const a of allergens) excludedAllergens.add(a);
      }
    }

    for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS) as [Allergen, string[]][]) {
      if (excludedAllergens.has(allergen)) continue;

      const matched = keywords.filter((kw) =>
        lowerName.includes(kw.toLowerCase()),
      );

      if (matched.length > 0) {
        const existing = detections.get(allergen);
        if (existing) {
          for (const kw of matched) {
            if (!existing.matchedKeywords.includes(kw)) {
              existing.matchedKeywords.push(kw);
            }
          }
          if (!existing.ingredients.includes(ingredient.name)) {
            existing.ingredients.push(ingredient.name);
          }
        } else {
          detections.set(allergen, {
            allergen,
            matchedKeywords: [...matched],
            ingredients: [ingredient.name],
          });
        }
      }
    }
  }

  return Array.from(detections.values());
}

export function inferDietaryTags(
  ingredients: Array<{ name: string }>,
): DietaryTag[] {
  const lowerNames = ingredients.map((i) => i.name.toLowerCase().trim());
  const tags: DietaryTag[] = [];

  for (const [tag, rule] of Object.entries(DIETARY_RULES) as [DietaryTag, { exclude: Allergen[]; excludeKeywords: string[] }][]) {
    let excluded = false;

    for (const keyword of rule.excludeKeywords) {
      if (lowerNames.some((name) => name.includes(keyword.toLowerCase()))) {
        excluded = true;
        break;
      }
    }

    if (!excluded && rule.exclude.length > 0) {
      const detected = detectAllergens(ingredients);
      const detectedSet = new Set(detected.map((d) => d.allergen));
      for (const allergen of rule.exclude) {
        if (detectedSet.has(allergen)) {
          excluded = true;
          break;
        }
      }
    }

    if (!excluded) {
      tags.push(tag);
    }
  }

  return tags;
}

export function isRecipeCompliant(
  recipe: { ingredients: Array<{ name: string }> },
  profile: DietaryProfileRecord,
): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];

  const detected = detectAllergens(recipe.ingredients);
  const detectedAllergens = new Set(detected.map((d) => d.allergen));

  for (const allergen of profile.allergens) {
    if (detectedAllergens.has(allergen)) {
      const detection = detected.find((d) => d.allergen === allergen);
      violations.push(
        `Contains ${allergen}: found in ${detection?.ingredients.join(', ') ?? 'ingredients'}`,
      );
    }
  }

  if (profile.dietaryTags.length > 0) {
    const recipeTags = inferDietaryTags(recipe.ingredients);
    const recipeTagSet = new Set(recipeTags);

    for (const requiredTag of profile.dietaryTags) {
      if (!recipeTagSet.has(requiredTag)) {
        violations.push(`Does not meet ${requiredTag} dietary requirement`);
      }
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

export function getAllergenNames(allergens: Allergen[]): string[] {
  const names: Record<Allergen, string> = {
    milk: 'Milk/Dairy',
    eggs: 'Eggs',
    fish: 'Fish',
    shellfish: 'Shellfish',
    treeNuts: 'Tree Nuts',
    peanuts: 'Peanuts',
    wheat: 'Wheat/Gluten',
    soybeans: 'Soy',
    sesame: 'Sesame',
  };
  return allergens.map((a) => names[a]);
}

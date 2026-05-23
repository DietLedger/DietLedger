import type { Allergen, DietaryTag } from '@/lib/types';

export const ALLERGEN_KEYWORDS: Record<Allergen, string[]> = {
  milk: [
    'milk', 'butter', 'cream', 'cheese', 'yogurt', 'whey', 'casein',
    'lactose', 'curd', 'ghee', 'buttermilk', 'half-and-half', 'custard',
    'pudding', 'ice cream', 'sour cream', 'mascarpone', 'ricotta',
    'mozzarella', 'parmesan', 'cheddar', 'brie', 'camembert',
  ],
  eggs: [
    'egg', 'eggs', 'yolk', 'whites', 'albumin', 'mayonnaise',
    'meringue', 'hollandaise', 'eggnog', 'tempura',
  ],
  fish: [
    'fish', 'salmon', 'tuna', 'cod', 'bass', 'trout', 'halibut',
    'sardine', 'anchovy', 'tilapia', 'catfish', 'swordfish', 'mahimahi',
    'pollock', 'haddock', 'flounder', 'sole', 'perch', 'pike',
    'worcesteshire', 'caesar dressing', 'fish sauce',
  ],
  shellfish: [
    'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster',
    'scallop', 'crawfish', 'crayfish', 'langoustine', 'squid', 'octopus',
    'cuttlefish', 'shellfish',
  ],
  treeNuts: [
    'almond', 'brazil nut', 'cashew', 'chestnut', 'filbert', 'hazelnut',
    'macadamia', 'pecan', 'pistachio', 'walnut', 'nutmeg', 'pine nut',
    'shea nut', 'praline', 'nougat', 'marzipan', 'pesto',
  ],
  peanuts: [
    'peanut', 'peanuts', 'groundnut', 'arachis', 'peanut butter',
    'peanut oil', 'mandelona', 'goober', 'beer nut',
  ],
  wheat: [
    'wheat', 'flour', 'bread', 'pasta', 'noodle', 'spaghetti',
    'macaroni', 'breadcrumb', 'breadcrumbs', 'couscous', 'barley',
    'bulgur', 'semolina', 'seitan', 'bran', 'farro', 'kamut',
    'matzah', 'tabbouleh', 'teriyaki', 'soy sauce', 'starch',
    'modified food starch', 'vegetable gum',
  ],
  soybeans: [
    'soy', 'soybean', 'soybeans', 'tofu', 'tempeh', 'edamame',
    'miso', 'natto', 'soy sauce', 'tamari', 'textured vegetable protein',
    'tvb', 'hydrolyzed soy protein', 'soy milk', 'soy protein',
    'soy lecithin', 'shoyu',
  ],
  sesame: [
    'sesame', 'sesame seed', 'tahini', 'tahina', 'halvah', 'halva',
    'gomashio', 'sesamol', 'sesamum', 'til', 'benne', 'gingelly',
    'ajonjoli',
  ],
};

export const ALLERGEN_EXCLUSIONS: Record<string, string[]> = {
  coconut: ['treeNuts'],
  nutmeg: ['treeNuts'],
  shea: ['treeNuts'],
  waterchestnut: ['treeNuts'],
  chestnut: ['treeNuts'],
  butternut: ['treeNuts'],
  heartnut: ['treeNuts'],
};

export const DIETARY_RULES: Record<DietaryTag, { exclude: Allergen[]; excludeKeywords: string[] }> = {
  vegetarian: {
    exclude: [],
    excludeKeywords: [
      'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'bacon',
      'sausage', 'ham', 'veal', 'venison', 'meat', 'ground beef',
      'steak', 'roast', 'prosciutto', 'salami', 'pepperoni', 'chorizo',
    ],
  },
  vegan: {
    exclude: ['milk', 'eggs'],
    excludeKeywords: [
      'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'bacon',
      'sausage', 'ham', 'veal', 'venison', 'meat', 'ground beef',
      'steak', 'roast', 'prosciutto', 'salami', 'pepperoni', 'chorizo',
      'honey', 'gelatin', 'lard', 'rennet', 'isinglass', 'carmine',
      'cochineal', 'shellac',
    ],
  },
  glutenFree: {
    exclude: ['wheat'],
    excludeKeywords: [
      'barley', 'rye', 'triticale', 'malt', 'brewer\'s yeast',
      'farro', 'spelt', 'durum', 'graham flour',
    ],
  },
  dairyFree: {
    exclude: ['milk'],
    excludeKeywords: [],
  },
  nutFree: {
    exclude: ['treeNuts', 'peanuts'],
    excludeKeywords: [],
  },
  soyFree: {
    exclude: ['soybeans'],
    excludeKeywords: [],
  },
  eggFree: {
    exclude: ['eggs'],
    excludeKeywords: [],
  },
  keto: {
    exclude: [],
    excludeKeywords: [
      'sugar', 'flour', 'bread', 'pasta', 'rice', 'potato', 'potatoes',
      'oat', 'oats', 'corn', 'cornstarch', 'cracker', 'crackers',
      'noodle', 'noodles', 'tortilla', 'cereal', 'granola', 'honey',
      'maple syrup', 'agave', 'molasses',
    ],
  },
  paleo: {
    exclude: ['milk'],
    excludeKeywords: [
      'flour', 'bread', 'pasta', 'rice', 'potato', 'oat', 'corn',
      'soy', 'tofu', 'lentil', 'lentils', 'bean', 'beans', 'peanut',
      'peanuts', 'sugar', 'vegetable oil', 'canola oil', 'margarine',
    ],
  },
  lowFodmap: {
    exclude: [],
    excludeKeywords: [
      'garlic', 'onion', 'onion powder', 'garlic powder',
      'wheat', 'rye', 'artichoke', 'artichokes', 'asparagus',
      'beet', 'beets', 'brussels sprout', 'cauliflower',
      'mushroom', 'mushrooms', 'apple', 'apples', 'pear', 'pears',
      'watermelon', 'mango', 'peach', 'peaches', 'plum', 'plums',
      'cherry', 'cherries', 'blackberry', 'blackberries',
      'cashew', 'pistachio', 'honey', 'agave', 'high fructose corn syrup',
      'chickpea', 'chickpeas', 'kidney bean', 'kidney beans',
      'black bean', 'black beans', 'lentil', 'lentils',
    ],
  },
  dASH: {
    exclude: [],
    excludeKeywords: [],
  },
  mediterranean: {
    exclude: [],
    excludeKeywords: [
      'processed meat', 'refined sugar', 'candy', 'soda',
    ],
  },
};

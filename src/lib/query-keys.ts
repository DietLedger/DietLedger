export const queryKeys = {
  recipeImports: { all: ['recipe-imports'] as const },
  instance: {
    all: ['instance'] as const,
    state: () => [...queryKeys.instance.all, 'state'] as const,
  },
  templates: {
    all: ['templates'] as const,
    lists: () => [...queryKeys.templates.all, 'list'] as const,
    byType: (type: string) => [...queryKeys.templates.all, 'type', type] as const,
    detail: (id: string) => [...queryKeys.templates.all, 'detail', id] as const,
  },
  dietary: {
    all: ['dietary-profiles'] as const,
    lists: () => [...queryKeys.dietary.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.dietary.all, 'detail', id] as const,
    // Recipe mutations already invalidate this prefix, even if list refetch fails.
    recipeAssessments: () => [...queryKeys.recipes.lists(), 'dietary-assessments'] as const,
    allergenRules: (profileId: string) => [...queryKeys.dietary.all, 'allergen-rules', profileId] as const,
  },
  nutrition: {
    all: ['nutrition'] as const,
    profiles: {
      all: () => [...queryKeys.nutrition.all, 'profiles'] as const,
    },
    foodLog: {
      byDate: (profileId: string, date: string) => [...queryKeys.nutrition.all, 'food-log', profileId, date] as const,
      byRange: (profileId: string, start: string, end: string) => [...queryKeys.nutrition.all, 'food-log', profileId, start, end] as const,
    },
    weights: {
      byProfile: (profileId: string) => [...queryKeys.nutrition.all, 'weights', profileId] as const,
    },
  },
  mealPlans: {
    all: ['meal-plans'] as const,
    lists: () => [...queryKeys.mealPlans.all, 'list'] as const,
    byWeek: (weekStart: string) => [...queryKeys.mealPlans.all, 'week', weekStart] as const,
    entries: (planId: string) => [...queryKeys.mealPlans.all, 'entries', planId] as const,
    groups: (planId: string) => [...queryKeys.mealPlans.all, 'groups', planId] as const,
    grocery: (weekStart: string) => [...queryKeys.mealPlans.all, 'grocery', weekStart] as const,
  },
  books: {
    all: ['books'] as const,
    lists: () => [...queryKeys.books.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.books.all, 'detail', id] as const,
    chapters: (bookId: string) => [...queryKeys.books.all, 'chapters', bookId] as const,
    chapterRecipes: (chapterId: string) => [...queryKeys.books.all, 'chapter-recipes', chapterId] as const,
    chapterPages: (chapterId: string) => [...queryKeys.books.all, 'chapter-pages', chapterId] as const,
    bookPages: (bookId: string) => [...queryKeys.books.all, 'book-pages', bookId] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: () => [...queryKeys.categories.all, 'list'] as const,
    descendants: (id: string) => [...queryKeys.categories.all, 'descendants', id] as const,
    recipesByCategory: (id: string) => [...queryKeys.categories.all, 'recipes', id] as const,
    recipeCategories: (recipeId: string) => [...queryKeys.categories.all, 'recipe', recipeId] as const,
  },
  recipes: {
    all: ['recipes'] as const,
    lists: () => [...queryKeys.recipes.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.recipes.all, 'detail', id] as const,
    search: (query: string) => [...queryKeys.recipes.all, 'search', query] as const,
    completions: () => [...queryKeys.recipes.all, 'completions'] as const,
  },
  customFoods: {
    all: ['custom-foods'] as const,
    lists: () => [...queryKeys.customFoods.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.customFoods.all, 'detail', id] as const,
    community: (page: number) => [...queryKeys.customFoods.all, 'community', page] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
  secrets: {
    all: ['secrets'] as const,
    list: () => [...queryKeys.secrets.all, 'list'] as const,
  },
  brandKits: {
    all: ['brand-kits'] as const,
    list: () => [...queryKeys.brandKits.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.brandKits.all, 'detail', id] as const,
  },
  pantryStaples: {
    all: ['pantry-staples'] as const,
    list: () => [...queryKeys.pantryStaples.all, 'list'] as const,
  },
  location: {
    all: ['location'] as const,
  },
  grocery: {
    all: ['grocery'] as const,
    byWeek: (weekStart: string) => [...queryKeys.grocery.all, weekStart] as const,
  },
  foodSearch: {
    all: ['food-search'] as const,
    query: (q: string) => [...queryKeys.foodSearch.all, q] as const,
  },
} as const;

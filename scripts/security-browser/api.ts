// Synthetic API boundary for the isolated browser verifier, never app data.
import type { BrandKit, RecipeRecord, TemplateTheme } from '../../src/lib/types';
export const fixture = {
  book: { title: '', description: '', coverColor: '#123456' },
  chapter: '',
  recipe: {} as RecipeRecord,
  brand: undefined as BrandKit | undefined,
  theme: undefined as TemplateTheme | undefined,
};
export function getApiClient() {
  return {
    getBook: async () => fixture.book,
    getChaptersByBook: async () => [{ id: 'chapter', title: fixture.chapter, position: 0 }],
    getChapterRecipes: async () => [{ recipeId: 'recipe', position: 0 }],
    getRecipe: async () => fixture.recipe,
    getBrandKit: async () => fixture.brand,
    getTemplate: async () => ({ layout: { theme: fixture.theme } }),
    getFoodByFdcId: async () => ({ portions: [{ amount: 1, measureUnit: 'cup', gramWeight: 244 }] }),
  };
}

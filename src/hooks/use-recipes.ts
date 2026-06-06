'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { toPublicRecipe, type Recipe } from '@/lib/recipe-store';

export type { Recipe };

export function useRecipes() {
  return useQuery({
    queryKey: queryKeys.recipes.lists(),
    queryFn: async () => {
      const api = getApiClient();
      const firstPage = await api.getRecipes(1, 100);
      let allRecipes = firstPage.data;
      for (let p = 2; p <= firstPage.totalPages; p++) {
        const page = await api.getRecipes(p, 100);
        allRecipes = allRecipes.concat(page.data);
      }
      return allRecipes.map(toPublicRecipe);
    },
  });
}

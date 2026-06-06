'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { CategoryRecord } from '@/lib/types';

export interface CategoryNode extends CategoryRecord {
  children: CategoryNode[];
}

function buildCategoryTree(categories: CategoryRecord[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export { buildCategoryTree };
export type { CategoryNode };

export function useCategories() {
  const { data, ...rest } = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => getApiClient().getCategories(),
  });
  const categories = data ?? [];
  const categoryTree = buildCategoryTree(categories);
  return { categories, categoryTree, ...rest };
}

export function useRecipeCategories(recipeId: string) {
  return useQuery({
    queryKey: queryKeys.categories.recipeCategories(recipeId),
    queryFn: () => getApiClient().getRecipeCategories(recipeId),
    enabled: !!recipeId,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) =>
      getApiClient().createCategory(name, parentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; parentId?: string | null } }) =>
      getApiClient().updateCategory(id, data as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApiClient().deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}

export function useAssignCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, categoryId }: { recipeId: string; categoryId: string }) =>
      getApiClient().addCategoryToRecipe(recipeId, categoryId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.categories.recipeCategories(variables.recipeId) });
    },
  });
}

export function useUnassignCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, categoryId }: { recipeId: string; categoryId: string }) =>
      getApiClient().removeCategoryFromRecipe(recipeId, categoryId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.categories.recipeCategories(variables.recipeId) });
    },
  });
}

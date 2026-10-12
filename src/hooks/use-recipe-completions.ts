'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

function toMap(completions: { recipeId: string; completedDate: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of completions) map[c.recipeId] = c.completedDate;
  return map;
}

/**
 * Recipe completion state ("recipe X was cooked on date Y"), persisted
 * server-side (Phase P1). Previously localStorage; the server is now
 * authoritative. Read-shaped as the legacy Record<recipeId, date> map both
 * consumers already used. Writes are optimistic with server confirmation.
 */
export function useRecipeCompletions() {
  const qc = useQueryClient();
  const key = queryKeys.recipes.completions();

  const { data: completionMap, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => toMap(await getApiClient().getRecipeCompletions()),
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: key });
  }, [qc, key]);

  const markCompleted = useMutation({
    mutationFn: ({ recipeId, date }: { recipeId: string; date: string }) =>
      getApiClient().markRecipeCompleted(recipeId, date),
    // Optimistic map update matching the old localStorage semantics
    // (marking overwrites the previous date for that recipe).
    onMutate: async ({ recipeId, date }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Record<string, string>>(key) ?? {};
      qc.setQueryData<Record<string, string>>(key, { ...prev, [recipeId]: date });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (recipeId: string) => getApiClient().deleteRecipeCompletion(recipeId),
    onMutate: async (recipeId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Record<string, string>>(key) ?? {};
      const next = { ...prev };
      delete next[recipeId];
      qc.setQueryData<Record<string, string>>(key, next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidate,
  });

  const isCompletedOn = useCallback(
    (recipeId: string | null | undefined, date: string): boolean =>
      !!recipeId && completionMap?.[recipeId] === date,
    [completionMap],
  );

  return { completionMap, isLoading, markCompleted, remove, isCompletedOn };
}

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { DaySlot, MealSlotTimes } from '@/lib/types';

export function useMealPlans() {
  return useQuery({
    queryKey: queryKeys.mealPlans.lists(),
    queryFn: () => getApiClient().getMealPlans(),
  });
}

export function useWeekPlan(weekStart: string) {
  const api = getApiClient();
  return useQuery({
    queryKey: queryKeys.mealPlans.byWeek(weekStart),
    queryFn: async () => {
      const plan = await api.getMealPlanByWeekStart(weekStart);
      if (!plan) return { plan: null, entries: [], groups: [] };
      const [entries, groups] = await Promise.all([
        api.getDayEntriesByMealPlanId(plan.id),
        api.getMealGroupsByMealPlanId(plan.id),
      ]);
      return { plan, entries, groups };
    },
    enabled: !!weekStart,
  });
}

export function useEnsureMealPlan() {
  const qc = useQueryClient();
  const api = getApiClient();
  return useMutation({
    mutationFn: async (weekStart: string) => {
      let plan = await api.getMealPlanByWeekStart(weekStart);
      if (!plan) {
        plan = await api.createMealPlan(`Week of ${weekStart}`, weekStart);
      }
      return plan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
    },
  });
}

export function useDeleteMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApiClient().deleteMealPlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.all });
    },
  });
}

export function useAddRecipeToSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, date, slot, recipeId }: { planId: string; date: string; slot: DaySlot; recipeId: string; weekStart: string }) => {
      const api = getApiClient();
      const entries = await api.getDayEntriesByMealPlanId(planId);
      const position = entries.filter(e => e.date === date && e.slot === slot).length;
      return api.createDayPlanEntry(planId, date, slot, recipeId, position);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useAddFoodToSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, date, slot, food, weekStart }: { planId: string; date: string; slot: DaySlot; food: any; weekStart: string }) => {
      const api = getApiClient();
      const entries = await api.getDayEntriesByMealPlanId(planId);
      const position = entries.filter(e => e.date === date && e.slot === slot).length;
      return api.createDayPlanEntry(planId, date, slot, null, position, food);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useRemoveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, weekStart }: { entryId: string; weekStart: string }) =>
      getApiClient().deleteDayPlanEntry(entryId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useMoveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, toSlot, toPosition, weekStart }: { entryId: string; toSlot: DaySlot; toPosition: number; weekStart: string }) =>
      getApiClient().updateDayPlanEntry(entryId, { slot: toSlot, position: toPosition } as any),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useUpdateServings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, servings, weekStart }: { entryId: string; servings: number; weekStart: string }) =>
      getApiClient().updateDayPlanEntry(entryId, { servings } as any),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useCreateMealGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, date, slot, name, entryIds, weekStart }: { planId: string; date: string; slot: DaySlot; name: string; entryIds: string[]; weekStart: string }) => {
      const api = getApiClient();
      const groups = await api.getMealGroupsByMealPlanId(planId);
      const group = await api.createMealGroup(planId, date, slot, name, groups.filter(g => g.date === date && g.slot === slot).length);
      await Promise.all(entryIds.map(id => api.updateDayPlanEntry(id, { groupId: group.id } as any)));
      return group;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useAddToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, groupId, weekStart }: { entryId: string; groupId: string; weekStart: string }) =>
      getApiClient().updateDayPlanEntry(entryId, { groupId } as any),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useRemoveFromGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, weekStart }: { entryId: string; weekStart: string }) =>
      getApiClient().updateDayPlanEntry(entryId, { groupId: null } as any),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useDeleteMealGroupAndUngroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, planId, weekStart }: { groupId: string; planId: string; weekStart: string }) => {
      const api = getApiClient();
      const entries = await api.getDayEntriesByMealPlanId(planId);
      await Promise.all(entries.filter(e => e.groupId === groupId).map(e => api.updateDayPlanEntry(e.id, { groupId: null } as any)));
      await api.deleteMealGroup(groupId);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useToggleLeftover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, isLeftover, weekStart }: { entryId: string; isLeftover: boolean; weekStart: string }) =>
      getApiClient().updateDayPlanEntry(entryId, { isLeftover } as any),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useUpdateSlotTimes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, slotTimes, weekStart }: { planId: string; slotTimes: MealSlotTimes; weekStart: string }) =>
      getApiClient().updateMealPlan(planId, { slotTimes } as any),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

export function useReorderEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slot, date, entryIds, planId, weekStart }: { slot: DaySlot; date: string; entryIds: string[]; planId: string; weekStart: string }) => {
      const api = getApiClient();
      const entries = await api.getDayEntriesByMealPlanId(planId);
      const slotEntries = entries.filter(e => e.date === date && e.slot === slot);
      const updates = entryIds.map((id, i) => {
        const entry = slotEntries.find(e => e.id === id);
        if (!entry) return null;
        return api.updateDayPlanEntry(entry.id, { position: i } as any);
      }).filter(Boolean);
      await Promise.all(updates);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.mealPlans.byWeek(variables.weekStart) });
    },
  });
}

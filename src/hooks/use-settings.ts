'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { DEFAULT_MEAL_SLOT_TIMES, type MealSlotTimes, type DaySlot } from '@/lib/types';

export function useAppSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.settings.all,
    enabled: options?.enabled,
    queryFn: async () => {
      const settings = await getApiClient().getSettings();
      return {
        defaultMealSlotTimes: { ...DEFAULT_MEAL_SLOT_TIMES, ...(settings.defaultMealSlotTimes as MealSlotTimes | undefined) },
        unitSystem: (settings.unitSystem as 'imperial' | 'metric') || 'imperial',
        theme: (settings.theme as string) || 'light',
        savedTheme: typeof settings.theme === 'string' ? settings.theme : undefined,
        appearanceMode: settings.appearanceMode as 'light' | 'dark' | undefined,
        onboardingComplete: Boolean(settings.onboardingComplete),
      };
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      await getApiClient().updateSettings(settings);
      return settings;
    },
    // Navigation guards must not observe the old onboarding flag after save.
    // /welcome unmounts the layout observer, so refresh inactive cache too.
    // Returning the promise keeps mutation callbacks pending through refetch.
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.all, refetchType: 'all' }),
  });
}

export function useUpdateMealSlotTimes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (times: MealSlotTimes) => {
      await getApiClient().updateSettings({ defaultMealSlotTimes: times });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useUpdateUnitSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unitSystem: 'imperial' | 'metric') => {
      await getApiClient().updateSettings({ unitSystem });
      localStorage.setItem('dietledger-unit-system', unitSystem);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useUpdateTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (theme: string) => {
      await getApiClient().updateSettings({ theme });
      localStorage.setItem('dietledger-theme', theme);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useUpdateSingleSlotTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slot, time, currentTimes }: { slot: DaySlot; time: string; currentTimes: MealSlotTimes }) => {
      const updated = { ...currentTimes, [slot]: time };
      await getApiClient().updateSettings({ defaultMealSlotTimes: updated });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

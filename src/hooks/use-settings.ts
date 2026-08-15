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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useUpdateMealSlotTimes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ times, unitSystem, theme }: { times: MealSlotTimes; unitSystem: 'imperial' | 'metric'; theme: string }) => {
      await getApiClient().updateSettings({ defaultMealSlotTimes: times, unitSystem, theme });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useUpdateUnitSystem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ unitSystem, defaultMealSlotTimes, theme }: { unitSystem: 'imperial' | 'metric'; defaultMealSlotTimes: MealSlotTimes; theme: string }) => {
      await getApiClient().updateSettings({ defaultMealSlotTimes, unitSystem, theme });
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
    mutationFn: async ({ theme, defaultMealSlotTimes, unitSystem }: { theme: string; defaultMealSlotTimes: MealSlotTimes; unitSystem: 'imperial' | 'metric' }) => {
      await getApiClient().updateSettings({ defaultMealSlotTimes, unitSystem, theme });
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
    mutationFn: async ({ slot, time, currentTimes, unitSystem, theme }: { slot: DaySlot; time: string; currentTimes: MealSlotTimes; unitSystem: 'imperial' | 'metric'; theme: string }) => {
      const updated = { ...currentTimes, [slot]: time };
      await getApiClient().updateSettings({ defaultMealSlotTimes: updated, unitSystem, theme });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useNutritionSelection } from '@/lib/nutrition-selection';
import type { NutritionProfileRecord, FoodLogEntryRecord, WeightEntryRecord } from '@/lib/types';
import { useMemo, useEffect } from 'react';

export function useNutritionProfiles() {
  const { data, ...rest } = useQuery({
    queryKey: queryKeys.nutrition.profiles.all(),
    queryFn: () => getApiClient().getNutritionProfiles(),
  });
  const profiles = data ?? [];
  const { activeProfileId, setActiveProfileId } = useNutritionSelection();

  useEffect(() => {
    if (!data) return;
    const active = activeProfileId && data.some(p => p.id === activeProfileId)
      ? activeProfileId
      : data[0]?.id ?? null;
    if (active !== activeProfileId) {
      setActiveProfileId(active);
    }
  }, [data, activeProfileId, setActiveProfileId]);

  return { profiles, activeProfileId, ...rest };
}

export function useFoodLogByDate(profileId: string, date: string) {
  return useQuery({
    queryKey: queryKeys.nutrition.foodLog.byDate(profileId, date),
    queryFn: () => getApiClient().getFoodLogByProfileAndDate(profileId, date),
    enabled: !!profileId && !!date,
  });
}

export function useFoodLogByRange(profileId: string, startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.nutrition.foodLog.byRange(profileId, startDate, endDate),
    queryFn: () => getApiClient().getFoodLogByProfileAndDateRange(profileId, startDate, endDate),
    enabled: !!profileId && !!startDate && !!endDate,
  });
}

export function useWeights(profileId: string) {
  const { data, ...rest } = useQuery({
    queryKey: queryKeys.nutrition.weights.byProfile(profileId),
    queryFn: async () => {
      const entries = await getApiClient().getWeightByProfile(profileId);
      return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },
    enabled: !!profileId,
  });
  return { weights: data ?? [], ...rest };
}

export function useCreateNutritionProfile() {
  const qc = useQueryClient();
  const { setActiveProfileId } = useNutritionSelection();
  return useMutation({
    mutationFn: (data: any) => getApiClient().createNutritionProfile(data),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.all });
      setActiveProfileId(record.id);
    },
  });
}

export function useUpdateNutritionProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      getApiClient().updateNutritionProfile(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.all });
    },
  });
}

export function useDeleteNutritionProfile() {
  const qc = useQueryClient();
  const { activeProfileId, setActiveProfileId } = useNutritionSelection();
  return useMutation({
    mutationFn: (id: string) => getApiClient().deleteNutritionProfile(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.all });
      if (activeProfileId === id) {
        setActiveProfileId(null);
      }
    },
  });
}

export function useAddFoodLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => getApiClient().createFoodLogEntry(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.foodLog.byDate(variables.profileId, variables.date) });
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.all });
    },
  });
}

export function useUpdateFoodLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any; profileId: string; date: string }) =>
      getApiClient().updateFoodLogEntry(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.foodLog.byDate(variables.profileId, variables.date) });
    },
  });
}

export function useDeleteFoodLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profileId, date }: { id: string; profileId: string; date: string }) =>
      getApiClient().deleteFoodLogEntry(id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.foodLog.byDate(variables.profileId, variables.date) });
    },
  });
}

export function useLogWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => getApiClient().createWeightEntry(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.weights.byProfile(variables.profileId) });
    },
  });
}

export function useDeleteWeightEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profileId }: { id: string; profileId: string }) =>
      getApiClient().deleteWeightEntry(id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.nutrition.weights.byProfile(variables.profileId) });
    },
  });
}

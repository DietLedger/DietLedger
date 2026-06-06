'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useDietarySelection } from '@/lib/dietary-selection';
import type { DietaryProfileRecord, AllergenRuleRecord, Allergen, DietaryTag, NutrientThreshold } from '@/lib/types';
import { useMemo, useEffect } from 'react';

export function useDietaryProfiles() {
  const { data, ...rest } = useQuery({
    queryKey: queryKeys.dietary.lists(),
    queryFn: () => getApiClient().getDietaryProfiles(),
  });
  const profiles = data ?? [];
  const { activeProfileId, setActiveProfileId } = useDietarySelection();

  useEffect(() => {
    if (!data) return;
    const active = activeProfileId && data.some(p => p.id === activeProfileId)
      ? activeProfileId
      : data.find(p => p.isActive)?.id ?? data[0]?.id ?? null;
    if (active !== activeProfileId) {
      setActiveProfileId(active);
    }
  }, [data, activeProfileId, setActiveProfileId]);

  const activeProfile = useMemo(
    () => profiles.find(p => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );

  return { profiles, activeProfileId, activeProfile, ...rest };
}

export function useAllergenRules(profileId: string) {
  return useQuery({
    queryKey: queryKeys.dietary.allergenRules(profileId),
    queryFn: () => getApiClient().getAllergenRulesByProfile(profileId),
    enabled: !!profileId,
  });
}

export function useCreateDietaryProfile() {
  const qc = useQueryClient();
  const { setActiveProfileId } = useDietarySelection();
  return useMutation({
    mutationFn: (data: Omit<DietaryProfileRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
      getApiClient().createDietaryProfile(data),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: queryKeys.dietary.all });
      setActiveProfileId(record.id);
    },
  });
}

export function useUpdateDietaryProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<DietaryProfileRecord, 'id' | 'createdAt'>> }) =>
      getApiClient().updateDietaryProfile(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dietary.all });
    },
  });
}

export function useDeleteDietaryProfile() {
  const qc = useQueryClient();
  const { activeProfileId, setActiveProfileId } = useDietarySelection();
  return useMutation({
    mutationFn: (id: string) => getApiClient().deleteDietaryProfile(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.dietary.all });
      if (activeProfileId === id) {
        setActiveProfileId(null);
      }
    },
  });
}

export function useCreateAllergenRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<AllergenRuleRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
      getApiClient().createAllergenRule(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.dietary.allergenRules(variables.profileId) });
    },
  });
}

export function useUpdateAllergenRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<AllergenRuleRecord, 'id' | 'createdAt'>>, profileId: string }) =>
      getApiClient().updateAllergenRule(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.dietary.allergenRules(variables.profileId) });
    },
  });
}

export function useDeleteAllergenRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profileId }: { id: string; profileId: string }) =>
      getApiClient().deleteAllergenRule(id).then(() => profileId),
    onSuccess: (profileId) => {
      qc.invalidateQueries({ queryKey: queryKeys.dietary.allergenRules(profileId) });
    },
  });
}

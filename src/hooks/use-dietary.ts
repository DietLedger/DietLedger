'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useDietarySelection } from '@/lib/dietary-selection';
import type { DietaryProfileRecord, AllergenRuleRecord } from '@/lib/types';
import type { Recipe } from '@/lib/recipe-types';
import { useMemo, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getAccessToken, sessionGeneration } from '@/lib/auth-session';

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
      : data.find(p => p.isActive)?.id ?? data.find(p => !p.dietaryTags.includes('diabetesAware'))?.id ?? null;
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

export function useDietaryRecipeAssessments(profile: DietaryProfileRecord | null, recipes: readonly Recipe[]) {
  return useQuery({
    // Include stored inputs for freshness, never to evaluate nutrition in the browser.
    // Recipe/ingredient/yield edits and profile edits must not reuse an earlier pass.
    queryKey: [...queryKeys.dietary.recipeAssessments(), profile, recipes],
    queryFn: () => getApiClient().getDietaryRecipeAssessments(profile!.id),
    enabled: !!profile,
  });
}

export function useAllergenRules(profileId: string) {
  return useQuery({
    queryKey: queryKeys.dietary.allergenRules(profileId),
    queryFn: () => getApiClient().getAllergenRulesByProfile(profileId),
    enabled: !!profileId,
  });
}

export function useRestoreDiabetesAwareProfile() {
  const qc = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const userId = isAuthenticated ? user?.id : undefined;
  const hasToken = !!getAccessToken();
  const generation = sessionGeneration();
  // A new login retires prior asynchronous mutations without storing tokens.
  const session = useMemo(() => userId && hasToken ? { userId, generation } : null, [userId, generation, hasToken]);
  const mountedSession = useRef<typeof session>(null);
  useEffect(() => {
    mountedSession.current = session;
    return () => { mountedSession.current = null; };
  }, [session]);
  return useMutation({
    mutationFn: async () => {
      const requireCurrentSession = () => {
        if (!session || mountedSession.current !== session ||
            sessionGeneration() !== session.generation) {
          throw new Error('Dietary restoration session is no longer current');
        }
      };
      requireCurrentSession();
      const record = await getApiClient().restoreDiabetesAwareProfile();
      // Mutation callbacks survive unmount and QueryClient.clear(). Authorize
      // every cache side effect against the originating user/login first.
      requireCurrentSession();
      qc.setQueryData<DietaryProfileRecord[]>(queryKeys.dietary.lists(), (profiles = []) =>
        [...profiles.filter(p => p.id !== record.id), record]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.dietary.all }),
        qc.invalidateQueries({ queryKey: queryKeys.dietary.recipeAssessments() }),
      ]);
      requireCurrentSession();
      return record;
    },
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
      qc.invalidateQueries({ queryKey: queryKeys.dietary.recipeAssessments() });
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
      qc.invalidateQueries({ queryKey: queryKeys.dietary.recipeAssessments() });
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
      qc.invalidateQueries({ queryKey: queryKeys.dietary.recipeAssessments() });
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

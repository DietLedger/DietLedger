'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { InstanceState } from '@/lib/api-client';

export function useInstanceState() {
  return useQuery({
    queryKey: queryKeys.instance.state(),
    queryFn: () => getApiClient().getInstanceState(),
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => getApiClient().completeOnboarding(),
    onSuccess: (state: InstanceState) => {
      qc.setQueryData(queryKeys.instance.state(), state);
    },
  });
}

export function useSetRegistrationEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => getApiClient().setRegistrationEnabled(enabled),
    onSuccess: (state: InstanceState) => {
      qc.setQueryData(queryKeys.instance.state(), state);
    },
  });
}

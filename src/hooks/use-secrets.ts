'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiClient, type UserSecretInfo } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useSecrets() {
  return useQuery<UserSecretInfo[]>({
    queryKey: queryKeys.secrets.list(),
    queryFn: () => getApiClient().getSecrets(),
  });
}

export function useCreateSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ keyName, value }: { keyName: string; value: string }) => getApiClient().createSecret(keyName, value),
    onSuccess: (_secret, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.secrets.all });
      if (variables.keyName === 'fda-api-key') {
        qc.setQueryData([...queryKeys.secrets.all, 'fda-key'] as const, variables.value || 'DEMO_KEY');
      }
    },
  });
}

export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApiClient().deleteSecret(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.secrets.all });
    },
  });
}

export function useFDAKey() {
  return useQuery({
    queryKey: [...queryKeys.secrets.all, 'fda-key'] as const,
    queryFn: async () => {
      try {
        const secrets = await getApiClient().getSecrets();
        const fdaSecret = secrets.find(s => s.keyName === 'fda-api-key');
        if (fdaSecret) {
          const value = await getApiClient().getSecretValue(fdaSecret.id);
          return value || 'DEMO_KEY';
        }
        return 'DEMO_KEY';
      } catch {
        return 'DEMO_KEY';
      }
    },
  });
}

export function useSetFDAKey() {
  const createSecret = useCreateSecret();
  return useMutation({
    mutationFn: async (key: string) => {
      await createSecret.mutateAsync({ keyName: 'fda-api-key', value: key });
      return key || 'DEMO_KEY';
    },
  });
}

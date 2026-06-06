'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      try {
        await getApiClient().createSecret('fda-api-key', key);
      } catch {}
      return key || 'DEMO_KEY';
    },
    onSuccess: (key) => {
      qc.setQueryData([...queryKeys.secrets.all, 'fda-key'] as const, key);
    },
  });
}

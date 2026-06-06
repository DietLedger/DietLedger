'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { TemplateRecord } from '@/lib/api-client';

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates.lists(),
    queryFn: () => getApiClient().getTemplates(),
  });
}

export function useTemplatesByType(type: TemplateRecord['type']) {
  return useQuery({
    queryKey: queryKeys.templates.byType(type),
    queryFn: () => getApiClient().getTemplatesByType(type),
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: queryKeys.templates.detail(id),
    queryFn: () => getApiClient().getTemplate(id),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<TemplateRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
      getApiClient().createTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>> }) =>
      getApiClient().updateTemplate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApiClient().deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

export function useDuplicateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const source = await getApiClient().getTemplate(id);
      if (!source) throw new Error('Template not found');
      return getApiClient().createTemplate({
        name: `${source.name} (Copy)`,
        type: source.type,
        isDefault: false,
        layout: JSON.parse(JSON.stringify(source.layout)),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

import { create } from 'zustand';
import { getApiClient } from '@/lib/api-client';
import type { TemplateRecord } from '@/lib/api-client';

interface TemplateState {
  templates: TemplateRecord[];
  isLoading: boolean;
  error: string | null;

  fetchTemplates: () => Promise<void>;
  createTemplate: (data: Omit<TemplateRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TemplateRecord>;
  updateTemplate: (id: string, data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  duplicateTemplate: (id: string) => Promise<TemplateRecord>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],
  isLoading: false,
  error: null,

  fetchTemplates: async () => {
    set({ isLoading: true, error: null });
    try {
      const templates = await getApiClient().getTemplates();
      set({ templates, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Unknown error',
        isLoading: false,
      });
    }
  },

  createTemplate: async (data) => {
    set({ error: null });
    try {
      const record = await getApiClient().createTemplate(data);
      set((state) => ({ templates: [...state.templates, record] }));
      return record;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  },

  updateTemplate: async (id, data) => {
    set({ error: null });
    try {
      const updated = await getApiClient().updateTemplate(id, data);
      set((state) => ({
        templates: state.templates.map((t) => (t.id === id ? updated : t)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  },

  deleteTemplate: async (id) => {
    set({ error: null });
    try {
      await getApiClient().deleteTemplate(id);
      set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  },

  duplicateTemplate: async (id) => {
    set({ error: null });
    try {
      const source = await getApiClient().getTemplate(id);
      if (!source) throw new Error('Template not found');

      const record = await getApiClient().createTemplate({
        name: `${source.name} (Copy)`,
        type: source.type,
        isDefault: false,
        layout: JSON.parse(JSON.stringify(source.layout)),
      });

      set((state) => ({ templates: [...state.templates, record] }));
      return record;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  },
}));

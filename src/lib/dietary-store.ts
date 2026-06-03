import { create } from 'zustand';
import { getApiClient } from '@/lib/api-client';
import type { DietaryProfileRecord, AllergenRuleRecord, Allergen, DietaryTag, NutrientThreshold } from '@/lib/types';

interface DietaryState {
  profiles: DietaryProfileRecord[];
  activeProfileId: string | null;
  allergenRules: AllergenRuleRecord[];
  isLoading: boolean;
  error: string | null;

  fetchProfiles: () => Promise<void>;
  createProfile: (data: Omit<DietaryProfileRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<DietaryProfileRecord>;
  updateProfile: (id: string, data: Partial<Omit<DietaryProfileRecord, 'id' | 'createdAt'>>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setActiveProfileId: (id: string | null) => void;
  getActiveProfile: () => DietaryProfileRecord | undefined;

  fetchAllergenRules: (profileId: string) => Promise<void>;
  saveAllergenRule: (data: Omit<AllergenRuleRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<AllergenRuleRecord>;
  updateAllergenRule: (id: string, data: Partial<Omit<AllergenRuleRecord, 'id' | 'createdAt'>>) => Promise<void>;
  deleteAllergenRule: (id: string) => Promise<void>;

  setProfileAllergens: (profileId: string, allergens: Allergen[]) => Promise<void>;
  setProfileDietaryTags: (profileId: string, tags: DietaryTag[]) => Promise<void>;
  setProfileThresholds: (profileId: string, thresholds: NutrientThreshold[]) => Promise<void>;
}

export const useDietaryStore = create<DietaryState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  allergenRules: [],
  isLoading: false,
  error: null,

  fetchProfiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const profiles = await getApiClient().getDietaryProfiles();
      const activeId = get().activeProfileId;
      const active = activeId && profiles.some(p => p.id === activeId)
        ? activeId
        : profiles.find(p => p.isActive)?.id ?? profiles[0]?.id ?? null;
      set({ profiles, activeProfileId: active, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  createProfile: async (data) => {
    try {
      const record = await getApiClient().createDietaryProfile(data);
      set((s) => ({
        profiles: [record, ...s.profiles],
        activeProfileId: s.activeProfileId ?? record.id,
      }));
      return record;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  updateProfile: async (id, data) => {
    try {
      const record = await getApiClient().updateDietaryProfile(id, data);
      set((s) => ({
        profiles: s.profiles.map((p) => (p.id === id ? record : p)),
      }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteProfile: async (id) => {
    try {
      await getApiClient().deleteDietaryProfile(id);
      set((s) => {
        const profiles = s.profiles.filter((p) => p.id !== id);
        return {
          profiles,
          activeProfileId: s.activeProfileId === id ? (profiles[0]?.id ?? null) : s.activeProfileId,
          allergenRules: s.activeProfileId === id ? [] : s.allergenRules,
        };
      });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  setActiveProfileId: (id) => {
    set({ activeProfileId: id, allergenRules: [] });
  },

  getActiveProfile: () => {
    const { profiles, activeProfileId } = get();
    return profiles.find((p) => p.id === activeProfileId);
  },

  fetchAllergenRules: async (profileId) => {
    try {
      const rules = await getApiClient().getAllergenRulesByProfile(profileId);
      set({ allergenRules: rules });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveAllergenRule: async (data) => {
    try {
      const record = await getApiClient().createAllergenRule(data);
      set((s) => ({ allergenRules: [...s.allergenRules, record] }));
      return record;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  updateAllergenRule: async (id, data) => {
    try {
      const record = await getApiClient().updateAllergenRule(id, data);
      set((s) => ({
        allergenRules: s.allergenRules.map((r) => (r.id === id ? record : r)),
      }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteAllergenRule: async (id) => {
    try {
      await getApiClient().deleteAllergenRule(id);
      set((s) => ({ allergenRules: s.allergenRules.filter((r) => r.id !== id) }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  setProfileAllergens: async (profileId, allergens) => {
    await get().updateProfile(profileId, { allergens });
  },

  setProfileDietaryTags: async (profileId, dietaryTags) => {
    await get().updateProfile(profileId, { dietaryTags });
  },

  setProfileThresholds: async (profileId, nutrientThresholds) => {
    await get().updateProfile(profileId, { nutrientThresholds });
  },
}));

import { create } from "zustand";
import {
  getAllNutritionProfiles,
  getNutritionProfile,
  createNutritionProfile as dbCreateProfile,
  updateNutritionProfile as dbUpdateProfile,
  deleteNutritionProfile as dbDeleteProfile,
  getFoodLogByProfileAndDate,
  getFoodLogByProfileAndDateRange,
  createFoodLogEntry as dbCreateFoodLog,
  updateFoodLogEntry as dbUpdateFoodLog,
  deleteFoodLogEntry as dbDeleteFoodLog,
  getFoodLogEntry,
  createWeightEntry as dbCreateWeight,
  updateWeightEntry as dbUpdateWeight,
  deleteWeightEntry as dbDeleteWeight,
  getWeightByProfile,
  getLatestWeight,
  getWeightEntry,
  type NutritionProfileRecord,
  type FoodLogEntryRecord,
  type WeightEntryRecord,
  type ActivityLevel,
  type MealSlot,
  type FoodSourceType,
} from "@/lib/storage";

interface NutritionState {
  profiles: NutritionProfileRecord[];
  activeProfileId: string | null;
  foodLog: FoodLogEntryRecord[];
  weights: WeightEntryRecord[];
  isLoading: boolean;
  error: string | null;

  fetchProfiles: () => Promise<void>;
  createProfile: (data: Omit<NutritionProfileRecord, "id" | "createdAt" | "updatedAt">) => Promise<NutritionProfileRecord>;
  updateProfile: (id: string, data: Partial<Omit<NutritionProfileRecord, "id" | "createdAt">>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  setActiveProfile: (id: string | null) => void;

  fetchFoodLog: (profileId: string, startDate: string, endDate: string) => Promise<void>;
  fetchFoodLogForDate: (profileId: string, date: string) => Promise<void>;
  addFoodLogEntry: (data: Omit<FoodLogEntryRecord, "id" | "createdAt" | "updatedAt">) => Promise<FoodLogEntryRecord>;
  updateFoodLogEntry: (id: string, data: Partial<Omit<FoodLogEntryRecord, "id" | "createdAt">>) => Promise<void>;
  deleteFoodLogEntry: (id: string) => Promise<void>;

  fetchWeights: (profileId: string) => Promise<void>;
  logWeight: (data: Omit<WeightEntryRecord, "id" | "createdAt" | "updatedAt">) => Promise<WeightEntryRecord>;
  deleteWeightEntry: (id: string) => Promise<void>;

  syncToServer: () => Promise<void>;
  syncFromServer: () => Promise<void>;
}

export const useNutritionStore = create<NutritionState>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  foodLog: [],
  weights: [],
  isLoading: false,
  error: null,

  fetchProfiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const profiles = await getAllNutritionProfiles();
      const activeId = get().activeProfileId;
      set({
        profiles,
        activeProfileId: activeId && profiles.some(p => p.id === activeId) ? activeId : profiles[0]?.id ?? null,
        isLoading: false,
      });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  createProfile: async (data) => {
    try {
      const record = await dbCreateProfile(data);
      set((s) => ({
        profiles: [record, ...s.profiles],
        activeProfileId: s.activeProfileId ?? record.id,
      }));
      syncSingleProfile(record);
      return record;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  updateProfile: async (id, data) => {
    try {
      const record = await dbUpdateProfile(id, data);
      set((s) => ({
        profiles: s.profiles.map((p) => (p.id === id ? record : p)),
      }));
      syncSingleProfile(record);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteProfile: async (id) => {
    try {
      await dbDeleteProfile(id);
      set((s) => {
        const profiles = s.profiles.filter((p) => p.id !== id);
        return {
          profiles,
          activeProfileId: s.activeProfileId === id ? (profiles[0]?.id ?? null) : s.activeProfileId,
          foodLog: s.activeProfileId === id ? [] : s.foodLog,
          weights: s.activeProfileId === id ? [] : s.weights,
        };
      });
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  setActiveProfile: (id) => {
    set({ activeProfileId: id, foodLog: [], weights: [] });
  },

  fetchFoodLog: async (profileId, startDate, endDate) => {
    try {
      const entries = await getFoodLogByProfileAndDateRange(profileId, startDate, endDate);
      set({ foodLog: entries });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  fetchFoodLogForDate: async (profileId, date) => {
    try {
      const entries = await getFoodLogByProfileAndDate(profileId, date);
      set({ foodLog: entries });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addFoodLogEntry: async (data) => {
    try {
      const record = await dbCreateFoodLog(data);
      set((s) => ({ foodLog: [...s.foodLog, record] }));
      syncSingleFoodLog(record);
      return record;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  updateFoodLogEntry: async (id, data) => {
    try {
      const record = await dbUpdateFoodLog(id, data);
      set((s) => ({
        foodLog: s.foodLog.map((e) => (e.id === id ? record : e)),
      }));
      syncSingleFoodLog(record);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteFoodLogEntry: async (id) => {
    try {
      await dbDeleteFoodLog(id);
      set((s) => ({ foodLog: s.foodLog.filter((e) => e.id !== id) }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  fetchWeights: async (profileId) => {
    try {
      const entries = await getWeightByProfile(profileId);
      set({ weights: entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  logWeight: async (data) => {
    try {
      const record = await dbCreateWeight(data);
      set((s) => {
        const existing = s.weights.findIndex((w) => w.id === record.id);
        const weights = [...s.weights];
        if (existing >= 0) {
          weights[existing] = record;
        } else {
          weights.push(record);
        }
        return { weights: weights.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) };
      });
      syncSingleWeight(record);
      return record;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteWeightEntry: async (id) => {
    try {
      await dbDeleteWeight(id);
      set((s) => ({ weights: s.weights.filter((w) => w.id !== id) }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  syncToServer: async () => {
    try {
      const { profiles, foodLog, weights } = get();
      const res = await fetch("/api/nutrition/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles, foodLogEntries: foodLog, weightEntries: weights }),
      });
      if (!res.ok) {
        const detail = await res.text();
        set({ error: `Sync to server failed (${res.status}): ${detail}` });
      }
    } catch (e) {
      set({ error: `Sync to server failed: ${String(e)}` });
    }
  },

  syncFromServer: async () => {
    try {
      const [profilesRes, foodLogRes, weightsRes] = await Promise.all([
        fetch("/api/nutrition/profiles"),
        fetch("/api/nutrition/log"),
        fetch("/api/nutrition/weight"),
      ]);

      const failures: string[] = [];
      if (!profilesRes.ok) failures.push(`profiles (${profilesRes.status})`);
      if (!foodLogRes.ok) failures.push(`foodLog (${foodLogRes.status})`);
      if (!weightsRes.ok) failures.push(`weights (${weightsRes.status})`);
      if (failures.length > 0) {
        set({ error: `Sync from server failed: ${failures.join(", ")}` });
        return;
      }

      const serverProfiles: NutritionProfileRecord[] = await profilesRes.json();
      const serverFoodLog: FoodLogEntryRecord[] = await foodLogRes.json();
      const serverWeights: WeightEntryRecord[] = await weightsRes.json();

      const activeId = get().activeProfileId;
      set({
        profiles: serverProfiles,
        activeProfileId: activeId && serverProfiles.some(p => p.id === activeId) ? activeId : serverProfiles[0]?.id ?? null,
        foodLog: serverFoodLog,
        weights: serverWeights,
        error: null,
      });
    } catch (e) {
      set({ error: `Sync from server failed: ${String(e)}` });
    }
  },
}));

async function syncSingleProfile(record: NutritionProfileRecord) {
  try {
    const res = await fetch("/api/nutrition/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profiles: [record] }),
    });
    if (!res.ok) console.error(`Failed to sync profile ${record.id}: ${res.status}`);
  } catch (e) {
    console.error(`Failed to sync profile ${record.id}:`, e);
  }
}

async function syncSingleFoodLog(record: FoodLogEntryRecord) {
  try {
    const res = await fetch("/api/nutrition/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foodLogEntries: [record] }),
    });
    if (!res.ok) console.error(`Failed to sync food log ${record.id}: ${res.status}`);
  } catch (e) {
    console.error(`Failed to sync food log ${record.id}:`, e);
  }
}

async function syncSingleWeight(record: WeightEntryRecord) {
  try {
    const res = await fetch("/api/nutrition/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weightEntries: [record] }),
    });
    if (!res.ok) console.error(`Failed to sync weight ${record.id}: ${res.status}`);
  } catch (e) {
    console.error(`Failed to sync weight ${record.id}:`, e);
  }
}

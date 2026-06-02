import { create } from 'zustand';
import { getApiClient } from '@/lib/api-client';
import type {
  MealPlanRecord,
  DayPlanEntryRecord,
  MealGroupRecord,
} from '@/lib/api-client';
import type { DaySlot, MealSlotTimes } from '@/lib/types';

interface MealPlanState {
  mealPlans: MealPlanRecord[];
  activeMealPlan: MealPlanRecord | null;
  dayEntries: DayPlanEntryRecord[];
  mealGroups: MealGroupRecord[];
  isLoading: boolean;
  error: string | null;

  fetchMealPlans: () => Promise<void>;
  fetchWeekPlan: (weekStart: string) => Promise<void>;
  ensureMealPlan: (weekStart: string) => Promise<MealPlanRecord>;
  deleteMealPlan: (id: string) => Promise<void>;
  addRecipeToSlot: (date: string, slot: DaySlot, recipeId: string) => Promise<void>;
  addFoodToSlot: (
    date: string,
    slot: DaySlot,
    food: {
      name: string;
      sourceType: 'food' | 'customFood' | 'manual';
      calories?: number;
      totalFat?: number;
      saturatedFat?: number;
      transFat?: number;
      cholesterol?: number;
      sodium?: number;
      totalCarbs?: number;
      dietaryFiber?: number;
      totalSugars?: number;
      addedSugars?: number;
      protein?: number;
      vitaminD?: number;
      calcium?: number;
      iron?: number;
      potassium?: number;
    }
  ) => Promise<void>;
  removeEntry: (entryId: string) => Promise<void>;
  moveEntry: (entryId: string, toSlot: DaySlot, toPosition: number) => Promise<void>;
  updateServings: (entryId: string, servings: number) => Promise<void>;
  createMealGroup: (date: string, slot: DaySlot, name: string, entryIds: string[]) => Promise<void>;
  addToGroup: (entryId: string, groupId: string) => Promise<void>;
  removeFromGroup: (entryId: string) => Promise<void>;
  deleteMealGroupAndUngroup: (groupId: string) => Promise<void>;
  reorderEntries: (slot: DaySlot, date: string, entryIds: string[]) => Promise<void>;
  toggleLeftover: (entryId: string) => Promise<void>;
  updateSlotTimes: (slotTimes: MealSlotTimes) => Promise<void>;
}

export const useMealPlanStore = create<MealPlanState>((set, get) => ({
  mealPlans: [],
  activeMealPlan: null,
  dayEntries: [],
  mealGroups: [],
  isLoading: false,
  error: null,

  fetchMealPlans: async () => {
    set({ isLoading: true, error: null });
    try {
      const api = getApiClient();
      const mealPlans = await api.getMealPlans();
      set({ mealPlans, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  fetchWeekPlan: async (weekStart: string) => {
    set({ isLoading: true, error: null });
    try {
      const api = getApiClient();
      const plan = await api.getMealPlanByWeekStart(weekStart);
      if (plan) {
        const [entries, groups] = await Promise.all([
          api.getDayEntriesByMealPlanId(plan.id),
          api.getMealGroupsByMealPlanId(plan.id),
        ]);
        set({ activeMealPlan: plan, dayEntries: entries, mealGroups: groups, isLoading: false });
      } else {
        set({ activeMealPlan: null, dayEntries: [], mealGroups: [], isLoading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  ensureMealPlan: async (weekStart: string) => {
    const api = getApiClient();
    let plan = await api.getMealPlanByWeekStart(weekStart);
    if (!plan) {
      plan = await api.createMealPlan(`Week of ${weekStart}`, weekStart);
      set((state) => ({ mealPlans: [plan!, ...state.mealPlans] }));
    }
    if (!get().activeMealPlan || get().activeMealPlan!.id !== plan.id) {
      const [entries, groups] = await Promise.all([
        api.getDayEntriesByMealPlanId(plan.id),
        api.getMealGroupsByMealPlanId(plan.id),
      ]);
      set({ activeMealPlan: plan, dayEntries: entries, mealGroups: groups });
    }
    return plan;
  },

  deleteMealPlan: async (id: string) => {
    const api = getApiClient();
    await api.deleteMealPlan(id);
    set((state) => ({
      mealPlans: state.mealPlans.filter((p) => p.id !== id),
      activeMealPlan: state.activeMealPlan?.id === id ? null : state.activeMealPlan,
      dayEntries: state.activeMealPlan?.id === id ? [] : state.dayEntries,
      mealGroups: state.activeMealPlan?.id === id ? [] : state.mealGroups,
    }));
  },

  addRecipeToSlot: async (date: string, slot: DaySlot, recipeId: string) => {
    const plan = get().activeMealPlan;
    if (!plan) return;
    const existingInSlot = get().dayEntries.filter(
      (e) => e.date === date && e.slot === slot
    );
    const position = existingInSlot.length;
    const api = getApiClient();
    const entry = await api.createDayPlanEntry(plan.id, date, slot, recipeId, position);
    set((state) => ({ dayEntries: [...state.dayEntries, entry as any] }));
  },

  addFoodToSlot: async (date, slot, food) => {
    const plan = get().activeMealPlan;
    if (!plan) return;
    const existingInSlot = get().dayEntries.filter(
      (e) => e.date === date && e.slot === slot
    );
    const position = existingInSlot.length;
    const api = getApiClient();
    const entry = await api.createDayPlanEntry(plan.id, date, slot, null, position, {
      sourceType: food.sourceType,
      foodName: food.name,
      servings: 1,
      calories: food.calories,
      totalFat: food.totalFat,
      saturatedFat: food.saturatedFat,
      transFat: food.transFat,
      cholesterol: food.cholesterol,
      sodium: food.sodium,
      totalCarbs: food.totalCarbs,
      dietaryFiber: food.dietaryFiber,
      totalSugars: food.totalSugars,
      addedSugars: food.addedSugars,
      protein: food.protein,
      vitaminD: food.vitaminD,
      calcium: food.calcium,
      iron: food.iron,
      potassium: food.potassium,
    } as any);
    set((state) => ({ dayEntries: [...state.dayEntries, entry as any] }));
  },

  removeEntry: async (entryId: string) => {
    const api = getApiClient();
    await api.deleteDayPlanEntry(entryId);
    set((state) => ({
      dayEntries: state.dayEntries.filter((e) => e.id !== entryId),
    }));
  },

  moveEntry: async (entryId: string, toSlot: DaySlot, toPosition: number) => {
    const entry = get().dayEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const updated = { ...entry, slot: toSlot, position: toPosition };
    const api = getApiClient();
    await api.updateDayPlanEntry(entryId, { slot: toSlot, position: toPosition } as any);
    set((state) => ({
      dayEntries: state.dayEntries.map((e) => (e.id === entryId ? updated : e)),
    }));
  },

  updateServings: async (entryId: string, servings: number) => {
    const api = getApiClient();
    await api.updateDayPlanEntry(entryId, { servings } as any);
    set((state) => ({
      dayEntries: state.dayEntries.map((e) =>
        e.id === entryId ? { ...e, servings } : e
      ),
    }));
  },

  createMealGroup: async (date: string, slot: DaySlot, name: string, entryIds: string[]) => {
    const plan = get().activeMealPlan;
    if (!plan) return;
    const existingGroups = get().mealGroups.filter(
      (g) => g.date === date && g.slot === slot
    );
    const api = getApiClient();
    const group = await api.createMealGroup(plan.id, date, slot, name, existingGroups.length);
    await Promise.all(entryIds.map((id) => api.updateDayPlanEntry(id, { groupId: group.id } as any)));
    set((state) => ({
      mealGroups: [...state.mealGroups, group as any],
      dayEntries: state.dayEntries.map((e) =>
        entryIds.includes(e.id) ? { ...e, groupId: group.id } : e
      ),
    }));
  },

  addToGroup: async (entryId: string, groupId: string) => {
    const api = getApiClient();
    await api.updateDayPlanEntry(entryId, { groupId } as any);
    set((state) => ({
      dayEntries: state.dayEntries.map((e) =>
        e.id === entryId ? { ...e, groupId } : e
      ),
    }));
  },

  removeFromGroup: async (entryId: string) => {
    const api = getApiClient();
    await api.updateDayPlanEntry(entryId, { groupId: null } as any);
    set((state) => ({
      dayEntries: state.dayEntries.map((e) =>
        e.id === entryId ? { ...e, groupId: null } : e
      ),
    }));
  },

  deleteMealGroupAndUngroup: async (groupId: string) => {
    const entries = get().dayEntries.filter((e) => e.groupId === groupId);
    const api = getApiClient();
    await Promise.all(entries.map((e) => api.updateDayPlanEntry(e.id, { groupId: null } as any)));
    await api.deleteMealGroup(groupId);
    set((state) => ({
      mealGroups: state.mealGroups.filter((g) => g.id !== groupId),
      dayEntries: state.dayEntries.map((e) =>
        e.groupId === groupId ? { ...e, groupId: null } : e
      ),
    }));
  },

  reorderEntries: async (slot: DaySlot, date: string, entryIds: string[]) => {
    const entries = get().dayEntries.filter(
      (e) => e.date === date && e.slot === slot
    );
    const updates = entryIds.map((id, i) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return null;
      return { ...entry, position: i };
    }).filter(Boolean) as DayPlanEntryRecord[];

    const api = getApiClient();
    await Promise.all(updates.map((e) => api.updateDayPlanEntry(e.id, e as any)));
    set((state) => {
      const otherEntries = state.dayEntries.filter(
        (e) => !(e.date === date && e.slot === slot)
      );
      return { dayEntries: [...otherEntries, ...updates] };
    });
  },

  toggleLeftover: async (entryId: string) => {
    const entry = get().dayEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const newValue = !entry.isLeftover;
    const api = getApiClient();
    await api.updateDayPlanEntry(entryId, { isLeftover: newValue } as any);
    set((state) => ({
      dayEntries: state.dayEntries.map((e) =>
        e.id === entryId ? { ...e, isLeftover: newValue } : e
      ),
    }));
  },

  updateSlotTimes: async (slotTimes: MealSlotTimes) => {
    const plan = get().activeMealPlan;
    if (!plan) return;
    const api = getApiClient();
    await api.updateMealPlan(plan.id, { slotTimes } as any);
    set((state) => ({
      activeMealPlan: state.activeMealPlan ? { ...state.activeMealPlan, slotTimes } : null,
    }));
  },
}));

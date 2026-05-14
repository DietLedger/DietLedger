import { create } from 'zustand';
import {
  getAllMealPlans,
  getMealPlanByWeekStart,
  createMealPlan as dbCreateMealPlan,
  deleteMealPlan as dbDeleteMealPlan,
  getDayEntriesByMealPlanId,
  createDayPlanEntry as dbCreateDayPlanEntry,
  updateDayPlanEntry as dbUpdateDayPlanEntry,
  deleteDayPlanEntry as dbDeleteDayPlanEntry,
  putDayPlanEntry as dbPutDayPlanEntry,
  getMealGroupsByMealPlanId,
  createMealGroup as dbCreateMealGroup,
  updateMealGroup as dbUpdateMealGroup,
  deleteMealGroup as dbDeleteMealGroup,
  type MealPlanRecord,
  type DayPlanEntryRecord,
  type MealGroupRecord,
} from '@/lib/storage';
import type { DaySlot } from '@/lib/types';
import { notifyLocalChange } from '@/lib/sync-store';

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
  removeEntry: (entryId: string) => Promise<void>;
  moveEntry: (entryId: string, toSlot: DaySlot, toPosition: number) => Promise<void>;
  updateServings: (entryId: string, servings: number) => Promise<void>;
  createMealGroup: (date: string, slot: DaySlot, name: string, entryIds: string[]) => Promise<void>;
  addToGroup: (entryId: string, groupId: string) => Promise<void>;
  removeFromGroup: (entryId: string) => Promise<void>;
  deleteMealGroupAndUngroup: (groupId: string) => Promise<void>;
  reorderEntries: (slot: DaySlot, date: string, entryIds: string[]) => Promise<void>;
  toggleLeftover: (entryId: string) => Promise<void>;
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
      const mealPlans = await getAllMealPlans();
      set({ mealPlans, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  fetchWeekPlan: async (weekStart: string) => {
    set({ isLoading: true, error: null });
    try {
      const plan = await getMealPlanByWeekStart(weekStart);
      if (plan) {
        const [entries, groups] = await Promise.all([
          getDayEntriesByMealPlanId(plan.id),
          getMealGroupsByMealPlanId(plan.id),
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
    let plan = await getMealPlanByWeekStart(weekStart);
    if (!plan) {
      plan = await dbCreateMealPlan(`Week of ${weekStart}`, weekStart);
      set((state) => ({ mealPlans: [plan!, ...state.mealPlans] }));
      notifyLocalChange();
    }
    if (!get().activeMealPlan || get().activeMealPlan!.id !== plan.id) {
      const [entries, groups] = await Promise.all([
        getDayEntriesByMealPlanId(plan.id),
        getMealGroupsByMealPlanId(plan.id),
      ]);
      set({ activeMealPlan: plan, dayEntries: entries, mealGroups: groups });
    }
    return plan;
  },

  deleteMealPlan: async (id: string) => {
    await dbDeleteMealPlan(id);
    set((state) => ({
      mealPlans: state.mealPlans.filter((p) => p.id !== id),
      activeMealPlan: state.activeMealPlan?.id === id ? null : state.activeMealPlan,
      dayEntries: state.activeMealPlan?.id === id ? [] : state.dayEntries,
      mealGroups: state.activeMealPlan?.id === id ? [] : state.mealGroups,
    }));
    notifyLocalChange();
  },

  addRecipeToSlot: async (date: string, slot: DaySlot, recipeId: string) => {
    const plan = get().activeMealPlan;
    if (!plan) return;
    const existingInSlot = get().dayEntries.filter(
      (e) => e.date === date && e.slot === slot
    );
    const position = existingInSlot.length;
    const entry = await dbCreateDayPlanEntry(plan.id, date, slot, recipeId, position);
    set((state) => ({ dayEntries: [...state.dayEntries, entry] }));
    notifyLocalChange();
  },

  removeEntry: async (entryId: string) => {
    await dbDeleteDayPlanEntry(entryId);
    set((state) => ({
      dayEntries: state.dayEntries.filter((e) => e.id !== entryId),
    }));
    notifyLocalChange();
  },

  moveEntry: async (entryId: string, toSlot: DaySlot, toPosition: number) => {
    const entry = get().dayEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const updated = { ...entry, slot: toSlot, position: toPosition };
    await dbUpdateDayPlanEntry(entryId, { slot: toSlot, position: toPosition });
    set((state) => ({
      dayEntries: state.dayEntries.map((e) => (e.id === entryId ? updated : e)),
    }));
    notifyLocalChange();
  },

  updateServings: async (entryId: string, servings: number) => {
    await dbUpdateDayPlanEntry(entryId, { servings });
    set((state) => ({
      dayEntries: state.dayEntries.map((e) =>
        e.id === entryId ? { ...e, servings } : e
      ),
    }));
    notifyLocalChange();
  },

  createMealGroup: async (date: string, slot: DaySlot, name: string, entryIds: string[]) => {
    const plan = get().activeMealPlan;
    if (!plan) return;
    const existingGroups = get().mealGroups.filter(
      (g) => g.date === date && g.slot === slot
    );
    const group = await dbCreateMealGroup(plan.id, date, slot, name, existingGroups.length);
    await Promise.all(entryIds.map((id) => dbUpdateDayPlanEntry(id, { groupId: group.id })));
    set((state) => ({
      mealGroups: [...state.mealGroups, group],
      dayEntries: state.dayEntries.map((e) =>
        entryIds.includes(e.id) ? { ...e, groupId: group.id } : e
      ),
    }));
    notifyLocalChange();
  },

  addToGroup: async (entryId: string, groupId: string) => {
    await dbUpdateDayPlanEntry(entryId, { groupId });
    set((state) => ({
      dayEntries: state.dayEntries.map((e) =>
        e.id === entryId ? { ...e, groupId } : e
      ),
    }));
    notifyLocalChange();
  },

  removeFromGroup: async (entryId: string) => {
    await dbUpdateDayPlanEntry(entryId, { groupId: null });
    set((state) => ({
      dayEntries: state.dayEntries.map((e) =>
        e.id === entryId ? { ...e, groupId: null } : e
      ),
    }));
    notifyLocalChange();
  },

  deleteMealGroupAndUngroup: async (groupId: string) => {
    const entries = get().dayEntries.filter((e) => e.groupId === groupId);
    await Promise.all(entries.map((e) => dbUpdateDayPlanEntry(e.id, { groupId: null })));
    await dbDeleteMealGroup(groupId);
    set((state) => ({
      mealGroups: state.mealGroups.filter((g) => g.id !== groupId),
      dayEntries: state.dayEntries.map((e) =>
        e.groupId === groupId ? { ...e, groupId: null } : e
      ),
    }));
    notifyLocalChange();
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

    await Promise.all(updates.map((e) => dbPutDayPlanEntry(e)));
    set((state) => {
      const otherEntries = state.dayEntries.filter(
        (e) => !(e.date === date && e.slot === slot)
      );
      return { dayEntries: [...otherEntries, ...updates] };
    });
    notifyLocalChange();
  },

  toggleLeftover: async (entryId: string) => {
    const entry = get().dayEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const newValue = !entry.isLeftover;
    await dbUpdateDayPlanEntry(entryId, { isLeftover: newValue });
    set((state) => ({
      dayEntries: state.dayEntries.map((e) =>
        e.id === entryId ? { ...e, isLeftover: newValue } : e
      ),
    }));
    notifyLocalChange();
  },
}));

import { create } from 'zustand';
import { getAppSettings, putAppSettings } from '@/lib/storage';
import { DEFAULT_MEAL_SLOT_TIMES, type MealSlotTimes, type DaySlot } from '@/lib/types';

interface AppSettingsState {
  defaultMealSlotTimes: MealSlotTimes;
  isLoading: boolean;

  fetchSettings: () => Promise<void>;
  updateDefaultMealSlotTimes: (times: MealSlotTimes) => Promise<void>;
  updateSingleSlotTime: (slot: DaySlot, time: string) => Promise<void>;
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  defaultMealSlotTimes: { ...DEFAULT_MEAL_SLOT_TIMES },
  isLoading: false,

  fetchSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await getAppSettings();
      if (settings?.defaultMealSlotTimes) {
        set({
          defaultMealSlotTimes: { ...DEFAULT_MEAL_SLOT_TIMES, ...settings.defaultMealSlotTimes },
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  updateDefaultMealSlotTimes: async (times: MealSlotTimes) => {
    const now = new Date().toISOString();
    await putAppSettings({ id: 'default', defaultMealSlotTimes: times, updatedAt: now });
    set({ defaultMealSlotTimes: times });
  },

  updateSingleSlotTime: async (slot: DaySlot, time: string) => {
    const current = get().defaultMealSlotTimes;
    const updated = { ...current, [slot]: time };
    const now = new Date().toISOString();
    await putAppSettings({ id: 'default', defaultMealSlotTimes: updated, updatedAt: now });
    set({ defaultMealSlotTimes: updated });
  },
}));

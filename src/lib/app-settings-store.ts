import { create } from 'zustand';
import { getApiClient } from '@/lib/api-client';
import { DEFAULT_MEAL_SLOT_TIMES, type MealSlotTimes, type DaySlot } from '@/lib/types';

interface AppSettingsState {
  defaultMealSlotTimes: MealSlotTimes;
  unitSystem: 'imperial' | 'metric';
  theme: string;
  isLoading: boolean;

  fetchSettings: () => Promise<void>;
  updateDefaultMealSlotTimes: (times: MealSlotTimes) => Promise<void>;
  updateSingleSlotTime: (slot: DaySlot, time: string) => Promise<void>;
  updateUnitSystem: (system: 'imperial' | 'metric') => Promise<void>;
  updateTheme: (theme: string) => Promise<void>;
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  defaultMealSlotTimes: { ...DEFAULT_MEAL_SLOT_TIMES },
  unitSystem: 'imperial',
  theme: 'light',
  isLoading: false,

  fetchSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await getApiClient().getSettings();
      if (settings.defaultMealSlotTimes) {
        set({
          defaultMealSlotTimes: { ...DEFAULT_MEAL_SLOT_TIMES, ...(settings.defaultMealSlotTimes as MealSlotTimes) },
        });
      }
      if (settings.unitSystem) {
        set({ unitSystem: settings.unitSystem as 'imperial' | 'metric' });
        localStorage.setItem('dietledger-unit-system', settings.unitSystem as string);
      }
      if (settings.theme) {
        set({ theme: settings.theme as string });
        localStorage.setItem('dietledger-theme', settings.theme as string);
      }
      set({ isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  updateDefaultMealSlotTimes: async (times: MealSlotTimes) => {
    const current = { defaultMealSlotTimes: times, unitSystem: get().unitSystem, theme: get().theme };
    await getApiClient().updateSettings(current);
    set({ defaultMealSlotTimes: times });
  },

  updateSingleSlotTime: async (slot: DaySlot, time: string) => {
    const current = get().defaultMealSlotTimes;
    const updated = { ...current, [slot]: time };
    const allSettings = { defaultMealSlotTimes: updated, unitSystem: get().unitSystem, theme: get().theme };
    await getApiClient().updateSettings(allSettings);
    set({ defaultMealSlotTimes: updated });
  },

  updateUnitSystem: async (system: 'imperial' | 'metric') => {
    const allSettings = { defaultMealSlotTimes: get().defaultMealSlotTimes, unitSystem: system, theme: get().theme };
    await getApiClient().updateSettings(allSettings);
    set({ unitSystem: system });
  },

  updateTheme: async (theme: string) => {
    const allSettings = { defaultMealSlotTimes: get().defaultMealSlotTimes, unitSystem: get().unitSystem, theme };
    await getApiClient().updateSettings(allSettings);
    set({ theme });
  },
}));

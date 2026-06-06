import { create } from 'zustand';

interface NutritionSelectionState {
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
}

export const useNutritionSelection = create<NutritionSelectionState>((set) => ({
  activeProfileId: null,
  setActiveProfileId: (id) => set({ activeProfileId: id }),
}));

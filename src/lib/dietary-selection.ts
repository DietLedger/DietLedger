import { create } from 'zustand';

interface DietarySelectionState {
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
}

export const useDietarySelection = create<DietarySelectionState>((set) => ({
  activeProfileId: null,
  setActiveProfileId: (id) => set({ activeProfileId: id }),
}));

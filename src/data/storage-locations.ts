export const STORAGE_LOCATIONS = ['Pantry', 'Refrigerator', 'Freezer', 'Countertop'] as const;

export type StorageLocation = (typeof STORAGE_LOCATIONS)[number];

export const STORAGE_LOCATION_META: Record<StorageLocation, { icon: string; color: string }> = {
  Pantry: { icon: '🏠', color: 'amber' },
  Refrigerator: { icon: '🧊', color: 'blue' },
  Freezer: { icon: '❄️', color: 'cyan' },
  Countertop: { icon: '🍽️', color: 'green' },
};

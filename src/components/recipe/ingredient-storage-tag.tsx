'use client';

import { STORAGE_LOCATIONS, STORAGE_LOCATION_META } from '@/data/storage-locations';

export function IngredientStorageTag({ location }: { location?: string | null }) {
  const validLocation = STORAGE_LOCATIONS.find((candidate) => candidate === location);
  if (!validLocation) return null;

  return (
    <span aria-label={`Stored in ${validLocation}`} className="inline-flex shrink-0 items-center text-[9px] px-1 py-0.5 rounded bg-stone-100 text-stone-500">
      {STORAGE_LOCATION_META[validLocation].icon} {validLocation}
    </span>
  );
}

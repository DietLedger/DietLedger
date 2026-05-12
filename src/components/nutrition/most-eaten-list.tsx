'use client';

import { useMemo } from 'react';
import { FoodLogEntryRecord } from '@/lib/storage';

interface MostEatenListProps {
  entries: FoodLogEntryRecord[];
  limit?: number;
}

export function MostEatenList({ entries, limit = 10 }: MostEatenListProps) {
  const ranked = useMemo(() => {
    const counts: Record<string, { name: string; count: number; totalCal: number }> = {};
    for (const e of entries) {
      const key = `${e.sourceType}:${e.sourceId ?? e.name}`;
      if (!counts[key]) {
        counts[key] = { name: e.name, count: 0, totalCal: 0 };
      }
      counts[key].count++;
      counts[key].totalCal += e.calories;
    }
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((item) => ({
        ...item,
        avgCal: Math.round(item.totalCal / item.count),
      }));
  }, [entries, limit]);

  if (ranked.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No food entries yet</p>;
  }

  return (
    <div className="space-y-1">
      {ranked.map((item, i) => (
        <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
            <span className="truncate">{item.name}</span>
          </div>
          <div className="text-xs text-muted-foreground flex gap-3 shrink-0">
            <span>{item.count}x</span>
            <span>{item.avgCal} kcal avg</span>
          </div>
        </div>
      ))}
    </div>
  );
}

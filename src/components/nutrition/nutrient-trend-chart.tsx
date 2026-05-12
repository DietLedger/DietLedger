'use client';

import { useMemo, useState } from 'react';
import { FoodLogEntryRecord } from '@/lib/storage';
import { Period, getPeriodDates, formatDateForDB } from '@/components/nutrition/period-selector';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { eachDayOfInterval, eachMonthOfInterval } from 'date-fns';

interface NutrientTrendChartProps {
  entries: FoodLogEntryRecord[];
  period: Period;
}

const TRACKED = [
  { key: 'calories', label: 'Calories', color: '#3b82f6', unit: 'kcal' },
  { key: 'protein', label: 'Protein', color: '#22c55e', unit: 'g' },
  { key: 'totalFat', label: 'Fat', color: '#ef4444', unit: 'g' },
  { key: 'totalCarbs', label: 'Carbs', color: '#f59e0b', unit: 'g' },
  { key: 'sodium', label: 'Sodium', color: '#8b5cf6', unit: 'mg' },
] as const;

export function NutrientTrendChart({ entries, period }: NutrientTrendChartProps) {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set(['calories', 'protein']));

  const chartData = useMemo(() => {
    const { start, end } = getPeriodDates(period);
    const aggregated: Record<string, Record<string, number>> = {};

    for (const entry of entries) {
      const d = entry.date;
      if (!aggregated[d]) aggregated[d] = {};
      for (const t of TRACKED) {
        aggregated[d][t.key] = (aggregated[d][t.key] || 0) + (entry as Record<string, number>)[t.key];
      }
    }

    let dates: Date[];
    if (period === 'year') {
      dates = eachMonthOfInterval({ start, end });
    } else {
      dates = eachDayOfInterval({ start, end });
    }

    return dates.map((d) => {
      const key = formatDateForDB(d);
      const agg = aggregated[key] || {};
      const point: Record<string, unknown> = {
        date: period === 'year' ? format(d, 'MMM') : format(d, 'MMM d'),
      };
      for (const t of TRACKED) {
        point[t.key] = Math.round(agg[t.key] || 0);
      }
      return point;
    });
  }, [entries, period]);

  const toggleKey = (key: string) => {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No nutrient data
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {TRACKED.map((t) => (
          <button
            key={t.key}
            onClick={() => toggleKey(t.key)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              activeKeys.has(t.key) ? 'opacity-100' : 'opacity-40'
            }`}
            style={{ borderColor: t.color, color: t.color }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          {TRACKED.filter((t) => activeKeys.has(t.key)).map((t) => (
            <Line
              key={t.key}
              type="monotone"
              dataKey={t.key}
              stroke={t.color}
              strokeWidth={2}
              dot={false}
              name={`${t.label} (${t.unit})`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

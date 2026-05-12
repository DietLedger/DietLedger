'use client';

import { useMemo } from 'react';
import { WeightEntryRecord } from '@/lib/storage';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { useUnitSystem, kgToLbs, displayWeight, type UnitSystem } from '@/hooks/use-unit-system';

interface WeightTrendChartProps {
  entries: WeightEntryRecord[];
  goalWeightKg?: number | null;
}

function movingAverage(data: number[], window: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < window - 1) return null;
    const slice = data.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function toDisplayWeight(kg: number, system: UnitSystem): number {
  return system === 'imperial' ? Math.round(kgToLbs(kg) * 10) / 10 : Math.round(kg * 10) / 10;
}

function weightSuffix(system: UnitSystem): string {
  return system === 'imperial' ? ' lbs' : ' kg';
}

export function WeightTrendChart({ entries, goalWeightKg }: WeightTrendChartProps) {
  const { system } = useUnitSystem();

  const chartData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const weights = sorted.map((e) => e.weightKg);
    const trend = movingAverage(weights, 7);

    return sorted.map((entry, i) => ({
      date: format(parseISO(entry.date), 'MMM d'),
      weight: toDisplayWeight(entry.weightKg, system),
      trend: trend[i] !== null ? toDisplayWeight(trend[i]!, system) : null,
    }));
  }, [entries, system]);

  const goalDisplay = goalWeightKg ? toDisplayWeight(goalWeightKg, system) : null;

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No weight entries yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} unit={weightSuffix(system)} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value: number, name: string) => [
            value.toFixed(1) + weightSuffix(system),
            name === 'weight' ? 'Weight' : '7-day avg',
          ]}
        />
        {goalDisplay !== null && (
          <ReferenceLine
            y={goalDisplay}
            stroke="#22c55e"
            strokeDasharray="5 5"
            label={{ value: `Goal: ${goalDisplay}${weightSuffix(system)}`, fontSize: 10, fill: '#22c55e' }}
          />
        )}
        <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="trend" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

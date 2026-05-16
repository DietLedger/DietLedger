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
import { useUnitSystem, kgToLbs, displayWeight } from '@/hooks/use-unit-system';
import type { UnitSystem } from '@/lib/unit-conversion';

interface WeightTrendChartProps {
  entries: WeightEntryRecord[];
  goalWeightKg?: number | null;
  goalDate?: string | null;
  dailyDeficit?: number | null;
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

export function WeightTrendChart({ entries, goalWeightKg, goalDate, dailyDeficit }: WeightTrendChartProps) {
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

  const projectionData = useMemo(() => {
    if (!goalWeightKg || !goalDate || entries.length === 0 || !dailyDeficit || dailyDeficit >= 0) return [];
    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastEntry = sorted[sorted.length - 1];
    const lastWeightKg = lastEntry.weightKg;
    const lastDate = parseISO(lastEntry.date);
    const targetDate = parseISO(goalDate);
    const goalDisplay = toDisplayWeight(goalWeightKg, system);

    const points: Array<{ date: string; projected: number }> = [];
    const startWeightDisplay = toDisplayWeight(lastWeightKg, system);
    points.push({ date: format(lastDate, 'MMM d'), projected: startWeightDisplay });

    const totalDays = Math.ceil((targetDate.getTime() - lastDate.getTime()) / (86400000));
    if (totalDays <= 0) return [];

    const steps = Math.min(totalDays, 10);
    const stepDays = Math.floor(totalDays / steps);

    for (let i = 1; i <= steps; i++) {
      const dayOffset = i * stepDays;
      const projectedKg = lastWeightKg + (dailyDeficit * dayOffset * 0.001) / 7.7;
      const clampedKg = Math.max(projectedKg, goalWeightKg);
      const pointDate = new Date(lastDate.getTime() + dayOffset * 86400000);
      points.push({
        date: format(pointDate, 'MMM d'),
        projected: toDisplayWeight(clampedKg, system),
      });
    }

    if (points[points.length - 1].projected !== goalDisplay) {
      points.push({ date: format(targetDate, 'MMM d'), projected: goalDisplay });
    }

    return points;
  }, [goalWeightKg, goalDate, entries, dailyDeficit, system]);

  const combinedData = useMemo(() => {
    const data = chartData.map((d) => ({ ...d, projected: undefined as number | undefined }));
    if (projectionData.length > 0) {
      for (const p of projectionData) {
        const existing = data.find((d) => d.date === p.date);
        if (existing) {
          existing.projected = p.projected;
        } else {
          data.push({ date: p.date, weight: undefined as unknown as number, trend: undefined as unknown as number, projected: p.projected });
        }
      }
    }
    return data;
  }, [chartData, projectionData]);

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
      <LineChart data={combinedData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} unit={weightSuffix(system)} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value: number, name: string) => [
            value !== null && value !== undefined ? (value as number).toFixed(1) + weightSuffix(system) : '—',
            name === 'weight' ? 'Weight' : name === 'trend' ? '7-day avg' : 'Projected',
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
        <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="trend" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" connectNulls={false} />
        {projectionData.length > 0 && (
          <Line type="monotone" dataKey="projected" stroke="#a855f7" strokeWidth={2} dot={false} strokeDasharray="6 3" connectNulls />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

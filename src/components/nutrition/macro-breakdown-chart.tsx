'use client';

import { useMemo } from 'react';
import type { FoodLogEntryRecord } from '@/lib/types';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';

interface MacroBreakdownChartProps {
  entries: FoodLogEntryRecord[];
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e'];

export function MacroBreakdownChart({ entries }: MacroBreakdownChartProps) {
  const chartData = useMemo(() => {
    const totals = { fat: 0, carbs: 0, protein: 0 };
    for (const e of entries) {
      totals.fat += e.totalFat;
      totals.carbs += e.totalCarbs;
      totals.protein += e.protein;
    }

    const fatCal = totals.fat * 9;
    const carbCal = totals.carbs * 4;
    const protCal = totals.protein * 4;
    const totalCal = fatCal + carbCal + protCal;

    if (totalCal === 0) return [];

    return [
      { name: 'Fat', value: Math.round(fatCal), pct: Math.round((fatCal / totalCal) * 100) },
      { name: 'Carbs', value: Math.round(carbCal), pct: Math.round((carbCal / totalCal) * 100) },
      { name: 'Protein', value: Math.round(protCal), pct: Math.round((protCal / totalCal) * 100) },
    ];
  }, [entries]);

  const totalCalories = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.value, 0);
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No macro data
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            dataKey="value"
            label={({ name, pct }) => `${name} ${pct}%`}
            labelLine={false}
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value: number) => [value + ' kcal', '']}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-lg font-semibold">{totalCalories}</div>
          <div className="text-xs text-muted-foreground">kcal</div>
        </div>
      </div>
    </div>
  );
}

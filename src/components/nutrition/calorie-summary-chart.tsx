'use client';

import { useMemo } from 'react';
import { FoodLogEntryRecord } from '@/lib/storage';
import { Period, getPeriodDates, formatDateForDB } from '@/components/nutrition/period-selector';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { format, parseISO, startOfMonth, eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';

interface CalorieSummaryChartProps {
  entries: FoodLogEntryRecord[];
  period: Period;
  goalCalories: number | null;
}

export function CalorieSummaryChart({ entries, period, goalCalories }: CalorieSummaryChartProps) {
  const chartData = useMemo(() => {
    const { start, end } = getPeriodDates(period);

    if (period === 'today') {
      const total = entries.reduce((sum, e) => sum + e.calories, 0);
      return [{ label: 'Today', calories: Math.round(total) }];
    }

    const caloriesByDate: Record<string, number> = {};
    for (const entry of entries) {
      const d = entry.date;
      caloriesByDate[d] = (caloriesByDate[d] || 0) + entry.calories;
    }

    if (period === 'week') {
      const days = eachDayOfInterval({ start, end });
      return days.map((d) => ({
        label: format(d, 'EEE'),
        calories: Math.round(caloriesByDate[formatDateForDB(d)] || 0),
      }));
    }

    if (period === 'month') {
      const days = eachDayOfInterval({ start, end });
      return days.map((d) => ({
        label: format(d, 'd'),
        calories: Math.round(caloriesByDate[formatDateForDB(d)] || 0),
      }));
    }

    const months = eachMonthOfInterval({ start, end });
    return months.map((m) => {
      const monthKey = format(m, 'yyyy-MM');
      const total = Object.entries(caloriesByDate)
        .filter(([d]) => d.startsWith(monthKey))
        .reduce((sum, [, c]) => sum + c, 0);
      return {
        label: format(m, 'MMM'),
        calories: Math.round(total),
      };
    });
  }, [entries, period]);

  if (entries.length === 0 && period === 'today') {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No food logged today
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value: number) => [Math.round(value) + ' kcal', 'Calories']}
        />
        {goalCalories && (
          <ReferenceLine y={goalCalories} stroke="#ef4444" strokeDasharray="5 5" label={{ value: `${goalCalories}`, fontSize: 10, fill: '#ef4444', position: 'right' }} />
        )}
        <Bar dataKey="calories" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

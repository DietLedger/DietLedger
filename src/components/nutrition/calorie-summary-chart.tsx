'use client';

import { useMemo } from 'react';
import type { FoodLogEntryRecord } from '@/lib/types';
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
  Legend,
} from 'recharts';
import { format, eachDayOfInterval, eachMonthOfInterval } from 'date-fns';

const FAT_COLOR = '#ef4444';
const CARB_COLOR = '#3b82f6';
const PROTEIN_COLOR = '#22c55e';

interface CalorieSummaryChartProps {
  entries: FoodLogEntryRecord[];
  period: Period;
  bmr: number | null;
  rmr: number | null;
  tdee: number | null;
  calorieTarget: number | null;
}

export function CalorieSummaryChart({ entries, period, bmr, rmr, tdee, calorieTarget }: CalorieSummaryChartProps) {
  const chartData = useMemo(() => {
    const { start, end } = getPeriodDates(period);

    const buildEntry = (key: string, dateKey: string) => {
      const dayEntries = entries.filter(e => e.date === dateKey || key === 'Today');
      let fatCal = 0, carbCal = 0, protCal = 0;
      if (key === 'Today') {
        for (const e of entries) {
          fatCal += e.totalFat * 9;
          carbCal += e.totalCarbs * 4;
          protCal += e.protein * 4;
        }
      } else {
        for (const e of dayEntries) {
          fatCal += e.totalFat * 9;
          carbCal += e.totalCarbs * 4;
          protCal += e.protein * 4;
        }
      }
      return {
        label: key,
        fatCal: Math.round(fatCal),
        carbCal: Math.round(carbCal),
        protCal: Math.round(protCal),
        total: Math.round(fatCal + carbCal + protCal),
      };
    };

    if (period === 'today') {
      return [buildEntry('Today', formatDateForDB(new Date()))];
    }

    const macroByDate: Record<string, { fat: number; carbs: number; protein: number }> = {};
    for (const entry of entries) {
      const d = entry.date;
      if (!macroByDate[d]) macroByDate[d] = { fat: 0, carbs: 0, protein: 0 };
      macroByDate[d].fat += entry.totalFat * 9;
      macroByDate[d].carbs += entry.totalCarbs * 4;
      macroByDate[d].protein += entry.protein * 4;
    }

    if (period === 'week' || period === 'month') {
      const days = eachDayOfInterval({ start, end });
      return days.map((d) => {
        const dk = formatDateForDB(d);
        const m = macroByDate[dk];
        return {
          label: period === 'week' ? format(d, 'EEE') : format(d, 'd'),
          fatCal: Math.round(m?.fat ?? 0),
          carbCal: Math.round(m?.carbs ?? 0),
          protCal: Math.round(m?.protein ?? 0),
          total: Math.round((m?.fat ?? 0) + (m?.carbs ?? 0) + (m?.protein ?? 0)),
        };
      });
    }

    const months = eachMonthOfInterval({ start, end });
    return months.map((m) => {
      const monthKey = format(m, 'yyyy-MM');
      let fat = 0, carbs = 0, protein = 0;
      for (const [d, macro] of Object.entries(macroByDate)) {
        if (d.startsWith(monthKey)) {
          fat += macro.fat;
          carbs += macro.carbs;
          protein += macro.protein;
        }
      }
      return {
        label: format(m, 'MMM'),
        fatCal: Math.round(fat),
        carbCal: Math.round(carbs),
        protCal: Math.round(protein),
        total: Math.round(fat + carbs + protein),
      };
    });
  }, [entries, period]);

  const baseMax = useMemo(() => {
    const mmr = Math.max(bmr ?? 0, rmr ?? 0);
    if (mmr === 0) return null;
    return Math.round(mmr * 1.2);
  }, [bmr, rmr]);

  const yMax = useMemo(() => {
    if (!baseMax) return undefined;
    const dataMax = chartData.length > 0 ? Math.max(...chartData.map(d => d.total)) : 0;
    return Math.max(baseMax, dataMax);
  }, [baseMax, chartData]);

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
        <YAxis
          tick={{ fontSize: 11 }}
          domain={yMax ? [0, yMax] : undefined}
          allowDataOverflow
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              fatCal: 'Fat',
              carbCal: 'Carbs',
              protCal: 'Protein',
            };
            return [Math.round(value) + ' kcal', labels[name] ?? name];
          }}
        />
        <Legend
          formatter={(value: string) => {
            const labels: Record<string, string> = {
              fatCal: 'Fat',
              carbCal: 'Carbs',
              protCal: 'Protein',
            };
            return labels[value] ?? value;
          }}
        />
        {bmr != null && (
          <ReferenceLine y={bmr} stroke={FAT_COLOR} strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `BMR ${bmr}`, fontSize: 9, fill: FAT_COLOR, position: 'right' }} />
        )}
        {rmr != null && (
          <ReferenceLine y={rmr} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `RMR ${rmr}`, fontSize: 9, fill: '#f97316', position: 'right' }} />
        )}
        {tdee != null && (
          <ReferenceLine y={tdee} stroke="#8b5cf6" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: `TDEE ${tdee}`, fontSize: 9, fill: '#8b5cf6', position: 'right' }} />
        )}
        {calorieTarget != null && (
          <ReferenceLine y={calorieTarget} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={2} label={{ value: `Target ${calorieTarget}`, fontSize: 9, fill: '#22c55e', position: 'right' }} />
        )}
        <Bar dataKey="fatCal" stackId="a" fill={FAT_COLOR} radius={[0, 0, 0, 0]} />
        <Bar dataKey="carbCal" stackId="a" fill={CARB_COLOR} radius={[0, 0, 0, 0]} />
        <Bar dataKey="protCal" stackId="a" fill={PROTEIN_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

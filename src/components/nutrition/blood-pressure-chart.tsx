'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WeightEntryRecord } from '@/lib/types';

interface BloodPressureChartProps {
  entries: WeightEntryRecord[];
}

export function BloodPressureChart({ entries }: BloodPressureChartProps) {
  const bpData = useMemo(() => {
    return entries
      .filter((e) => e.bloodPressureSystolic != null && e.bloodPressureDiastolic != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({
        date: new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        systolic: Math.round(e.bloodPressureSystolic!),
        diastolic: Math.round(e.bloodPressureDiastolic!),
        context: e.measurementContext ?? '',
      }));
  }, [entries]);

  if (bpData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Blood Pressure</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={bpData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis domain={[40, 200]} tick={{ fontSize: 9 }} />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(value: number, name: string) => {
                const label = name === 'systolic' ? 'Systolic' : 'Diastolic';
                return [`${value} mmHg`, label];
              }}
            />
            <ReferenceLine y={120} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} label={{ value: '120', position: 'right', fontSize: 9, fill: '#d97706' }} />
            <ReferenceLine y={80} stroke="#3b82f6" strokeDasharray="4 3" strokeWidth={1} label={{ value: '80', position: 'right', fontSize: 9, fill: '#2563eb' }} />
            <Line type="monotone" dataKey="systolic" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="diastolic" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-2 flex items-center gap-4 text-[10px] text-stone-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Systolic
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Diastolic
          </span>
          <span className="text-stone-400">Dashed lines: 120/80 mmHg threshold</span>
        </div>
      </CardContent>
    </Card>
  );
}

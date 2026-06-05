'use client';

import { useMemo } from 'react';
import type { WeightEntryRecord } from '@/lib/types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface HealthMetricsChartProps {
  entries: WeightEntryRecord[];
}

export function HealthMetricsChart({ entries }: HealthMetricsChartProps) {
  const chartData = useMemo(() => {
    return entries
      .filter((e) => e.bloodSugar != null || e.bloodPressureSystolic != null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((e) => ({
        date: format(parseISO(e.date), 'MMM d'),
        bloodSugar: e.bloodSugar ?? null,
        systolic: e.bloodPressureSystolic ?? null,
        diastolic: e.bloodPressureDiastolic ?? null,
        context: e.measurementContext ?? '',
      }));
  }, [entries]);

  if (chartData.length === 0) {
    return null;
  }

  const hasBloodSugar = chartData.some((d) => d.bloodSugar !== null);
  const hasBP = chartData.some((d) => d.systolic !== null);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Health Metrics</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {hasBloodSugar && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Blood Sugar (mg/dL)</p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number, name: string) => [
                    `${value} mg/dL`,
                    name === 'bloodSugar' ? 'Blood Sugar' : name,
                  ]}
                />
                <Line type="monotone" dataKey="bloodSugar" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {hasBP && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Blood Pressure (mmHg)</p>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number, name: string) => [
                    `${value} mmHg`,
                    name === 'systolic' ? 'Systolic' : 'Diastolic',
                  ]}
                />
                <Line type="monotone" dataKey="systolic" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="diastolic" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

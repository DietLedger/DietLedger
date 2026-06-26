'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GLCategory } from '@/data/glycemic-index';

interface MealEnergyPoint {
  timestamp: number;
  gl: number;
  category: GLCategory;
  mealName: string;
}

interface GlucoseReading {
  timestamp: number;
  glucose: number;
}

interface EnergySpikeChartProps {
  meals: MealEnergyPoint[];
  glucoseReadings?: GlucoseReading[];
  showMealMarkers?: boolean;
}

interface CurveParams {
  riseStart: number;
  peakStart: number;
  peakEnd: number;
  settleTime: number;
}

const GL_CURVE_PARAMS: Record<GLCategory, CurveParams> = {
  Low: { riseStart: 15, peakStart: 45, peakEnd: 90, settleTime: 150 },
  Medium: { riseStart: 15, peakStart: 30, peakEnd: 75, settleTime: 210 },
  High: { riseStart: 10, peakStart: 30, peakEnd: 60, settleTime: 180 },
};

function computeEnergyCurve(startTs: number, gl: number, category: GLCategory): { ts: number; energy: number }[] {
  const params = GL_CURVE_PARAMS[category];
  const amplitude = Math.min(gl / 20, 1.5);
  const points: { ts: number; energy: number }[] = [];
  const step = 5;

  for (let offset = 0; offset <= params.settleTime + step; offset += step) {
    const ts = startTs + offset * 60000;
    let energy = 0;

    if (offset < params.riseStart) {
      energy = 0;
    } else if (offset < params.peakStart) {
      const progress = (offset - params.riseStart) / (params.peakStart - params.riseStart);
      energy = amplitude * progress;
    } else if (offset < params.peakEnd) {
      energy = amplitude;
    } else if (offset < params.settleTime) {
      const progress = (offset - params.peakEnd) / (params.settleTime - params.peakEnd);
      energy = amplitude * (1 - progress);
    }

    points.push({ ts, energy });
  }

  return points;
}

function formatTs(ts: number, multiDay: boolean): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const timeStr = `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  if (multiDay) {
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${timeStr}`;
  }
  return timeStr;
}

export function EnergySpikeChart({ meals, glucoseReadings, showMealMarkers = true }: EnergySpikeChartProps) {
  const hasGlucose = (glucoseReadings?.length ?? 0) > 0;

  const { chartData, multiDay } = useMemo(() => {
    if (meals.length === 0 && !hasGlucose) return { chartData: [] as typeof chartData, multiDay: false };

    const glucoseMap = new Map<number, number>();
    if (hasGlucose) {
      for (const g of glucoseReadings!) {
        glucoseMap.set(g.timestamp, g.glucose);
      }
    }

    const energyMap = new Map<number, number>();

    for (const meal of meals) {
      const curve = computeEnergyCurve(meal.timestamp, meal.gl, meal.category);
      for (const point of curve) {
        const rounded = Math.round(point.ts / 300000) * 300000;
        energyMap.set(rounded, (energyMap.get(rounded) || 0) + point.energy);
      }
    }

    const allTs = [...energyMap.keys(), ...glucoseMap.keys()];
    if (allTs.length === 0) return { chartData: [], multiDay: false };

    const minTs = Math.min(...allTs);
    const maxTs = Math.max(...allTs);
    const spanMin = (maxTs - minTs) / 60000;
    const step = spanMin > 1440 * 3 ? 3600000 : spanMin > 720 ? 600000 : 300000;
    const isMultiDay = spanMin > 720;

    const raw = Array.from(energyMap.entries()).sort(([a], [b]) => a - b);

    const smoothed = raw.map((point, i) => {
      const window = 4;
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - window); j <= Math.min(raw.length - 1, i + window); j++) {
        const weight = 1 - Math.abs(j - i) / (window + 1);
        sum += raw[j][1] * weight;
        count += weight;
      }
      return {
        ts: point[0],
        energy: Math.round((sum / count) * 100) / 100,
        glucose: glucoseMap.has(point[0]) ? glucoseMap.get(point[0])! : null,
      };
    });

    for (const [ts, glucose] of glucoseMap) {
      if (!smoothed.some((s) => s.ts === ts)) {
        smoothed.push({ ts, energy: 0, glucose });
      }
    }

    smoothed.sort((a, b) => a.ts - b.ts);

    return { chartData: smoothed, multiDay: isMultiDay };
  }, [meals, hasGlucose, glucoseReadings]);

  const mealMarkers = useMemo(() => {
    if (!showMealMarkers) return [];
    return meals.map((m) => ({ ts: m.timestamp, name: m.mealName, category: m.category, gl: m.gl }));
  }, [meals, showMealMarkers]);

  const yMax = useMemo(() => {
    if (chartData.length === 0) return 2;
    const maxVal = Math.max(...chartData.map((d) => d.energy));
    return Math.max(1.5, Math.ceil((maxVal * 1.15) / 0.25) * 0.25);
  }, [chartData]);

  const chartTitle = hasGlucose ? 'Estimated Energy Response vs. Glucose' : 'Estimated Energy Response';

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">{chartTitle}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-stone-400 py-8 text-center">
            Log food with glycemic load data to see estimated energy response throughout the day.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tickFormatter = (ts: number) => formatTs(ts, multiDay);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">{chartTitle}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 10, right: hasGlucose ? 45 : 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={tickFormatter}
              tick={{ fontSize: 9 }}
              minTickGap={50}
            />
            <YAxis
              yAxisId="left"
              domain={[0, yMax]}
              ticks={Array.from({ length: Math.round(yMax / 0.25) + 1 }, (_, i) => i * 0.25).filter(t => t <= yMax)}
              tick={{ fontSize: 9 }}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            {hasGlucose && (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 300]}
                tick={{ fontSize: 9, fill: '#8b5cf6' }}
                tickFormatter={(v: number) => `${v}`}
                label={{ value: 'mg/dL', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#8b5cf6' } }}
              />
            )}
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              labelFormatter={(ts: number) => formatTs(ts, multiDay)}
              formatter={(value: number, name: string) => {
                if (name === 'glucose') return [`${value} mg/dL`, 'Glucose'];
                if (value >= 1.5) return [value.toFixed(2), 'Spike zone'];
                if (value >= 1.0) return [value.toFixed(2), 'Elevated zone'];
                if (value >= 0.5) return [value.toFixed(2), 'Steady zone'];
                if (value > 0) return [value.toFixed(2), 'Low energy zone'];
                return [value.toFixed(2), 'Est. Energy'];
              }}
            />
            {mealMarkers.map((m, i) => (
              <ReferenceLine
                key={i}
                yAxisId="left"
                x={m.ts}
                stroke="#94a3b8"
                strokeDasharray="3 3"
                label={{ value: m.name, position: 'top', fontSize: 9, fill: '#64748b' }}
              />
            ))}
            <ReferenceLine yAxisId="left" y={1.5} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} label={{ value: 'Spike', position: 'right', fontSize: 9, fill: '#dc2626' }} />
            <ReferenceLine yAxisId="left" y={1.0} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1} label={{ value: 'Elevated', position: 'right', fontSize: 9, fill: '#d97706' }} />
            <ReferenceLine yAxisId="left" y={0.5} stroke="#22c55e" strokeDasharray="6 3" strokeWidth={1} label={{ value: 'Steady', position: 'right', fontSize: 9, fill: '#16a34a' }} />
            <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" strokeWidth={1} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="energy"
              stroke="#22c55e"
              fill="url(#energyGradient)"
              fillOpacity={1}
              strokeWidth={2}
              baseValue={0}
              curve="natural"
            />
            {hasGlucose && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="glucose"
                stroke="#8b5cf6"
                strokeWidth={2}
                connectNulls
                dot={{ r: 3, fill: '#8b5cf6' }}
              />
            )}
            <defs>
              <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
              </linearGradient>
            </defs>
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-green-50 border border-green-200 rounded">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
            <div>
              <span className="font-medium text-green-800">Steady</span>
              <span className="text-green-600 ml-1">0.5 - 1.0</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <div>
              <span className="font-medium text-amber-800">Elevated</span>
              <span className="text-amber-600 ml-1">1.0 - 1.5</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-red-50 border border-red-200 rounded">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
            <div>
              <span className="font-medium text-red-800">Spike</span>
              <span className="text-red-600 ml-1">&gt; 1.5</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-stone-50 border border-stone-200 rounded">
            <span className="w-2.5 h-2.5 rounded-full bg-stone-400 shrink-0" />
            <div>
              <span className="font-medium text-stone-700">Low</span>
              <span className="text-stone-500 ml-1">0 - 0.5</span>
            </div>
          </div>
        </div>
        {showMealMarkers && mealMarkers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-stone-500">
            {mealMarkers.map((m, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-stone-400" />
                {m.name} ({m.category}, GL {m.gl})
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  ReferenceDot,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GLCategory } from '@/data/glycemic-index';

interface MealEnergyPoint {
  time: number;
  gl: number;
  category: GLCategory;
  mealName: string;
}

interface GlucoseReading {
  time: number;
  glucose: number;
}

interface EnergySpikeChartProps {
  meals: MealEnergyPoint[];
  glucoseReadings?: GlucoseReading[];
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

function minutesToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function computeEnergyCurve(
  mealTimeMin: number,
  gl: number,
  category: GLCategory
): { time: number; energy: number }[] {
  const params = GL_CURVE_PARAMS[category];
  const amplitude = Math.min(gl / 20, 1.5);
  const points: { time: number; energy: number }[] = [];
  const step = 5;

  for (let offset = 0; offset <= params.settleTime + step; offset += step) {
    const t = mealTimeMin + offset;
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

    points.push({ time: t, energy });
  }

  return points;
}

export function EnergySpikeChart({ meals, glucoseReadings }: EnergySpikeChartProps) {
  const hasGlucose = (glucoseReadings?.length ?? 0) > 0;

  const chartData = useMemo(() => {
    if (meals.length === 0 && !hasGlucose) return [];

    const glucoseMap = new Map<number, number>();
    if (hasGlucose) {
      for (const g of glucoseReadings!) {
        const rounded = Math.round(g.time / 5) * 5;
        glucoseMap.set(rounded, g.glucose);
      }
    }

    const timePoints = new Map<number, number>();
    const startHour = 6 * 60;
    const endHour = 24 * 60;

    for (let t = startHour; t <= endHour; t += 5) {
      timePoints.set(t, 0);
    }

    for (const meal of meals) {
      const curve = computeEnergyCurve(meal.time, meal.gl, meal.category);
      for (const point of curve) {
        const rounded = Math.round(point.time / 5) * 5;
        if (rounded >= startHour && rounded <= endHour) {
          timePoints.set(rounded, (timePoints.get(rounded) || 0) + point.energy);
        }
      }
    }

    const raw = Array.from(timePoints.entries())
      .sort(([a], [b]) => a - b)
      .map(([time, energy]) => ({ time, energy }));

    const smoothed = raw.map((point, i) => {
      const window = 6;
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - window); j <= Math.min(raw.length - 1, i + window); j++) {
        const weight = 1 - Math.abs(j - i) / (window + 1);
        sum += raw[j].energy * weight;
        count += weight;
      }
      return {
        time: point.time,
        label: minutesToTimeStr(point.time),
        energy: Math.round((sum / count) * 100) / 100,
        glucose: glucoseMap.has(point.time) ? glucoseMap.get(point.time)! : null,
      };
    });

    return smoothed;
  }, [meals]);

  const mealMarkers = useMemo(() => {
    return meals.map((m) => ({
      time: m.time,
      label: minutesToTimeStr(m.time),
      name: m.mealName,
      category: m.category,
      gl: m.gl,
    }));
  }, [meals]);

  const yMax = useMemo(() => {
    if (chartData.length === 0) return 2;
    const maxVal = Math.max(...chartData.map((d) => d.energy));
    const step = 0.25;
    return Math.max(1.5, Math.ceil((maxVal * 1.15) / step) * step);
  }, [chartData]);

  const chartTitle = hasGlucose ? 'Estimated Energy Response vs. Glucose' : 'Estimated Energy Response';

  if (meals.length === 0 && !hasGlucose) {
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
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
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
              formatter={(value: number, name: string) => {
                if (name === 'glucose') return [`${value} mg/dL`, 'Glucose'];
                if (value >= 1.5) return [value.toFixed(2), 'Spike zone'];
                if (value >= 1.0) return [value.toFixed(2), 'Elevated zone'];
                if (value >= 0.5) return [value.toFixed(2), 'Steady zone'];
                if (value > 0) return [value.toFixed(2), 'Low energy zone'];
                return [value.toFixed(2), 'Est. Energy'];
              }}
              labelFormatter={(label: string) => `Time: ${label}`}
            />
            {mealMarkers.map((m, i) => (
              <ReferenceLine
                key={i}
                x={m.label}
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
              <br />
              <span className="text-green-600">Sustained energy, ideal</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <div>
              <span className="font-medium text-amber-800">Elevated</span>
              <span className="text-amber-600 ml-1">1.0 - 1.5</span>
              <br />
              <span className="text-amber-600">Rising fast, may dip</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-red-50 border border-red-200 rounded">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
            <div>
              <span className="font-medium text-red-800">Spike</span>
              <span className="text-red-600 ml-1">&gt; 1.5</span>
              <br />
              <span className="text-red-600">Crash likely in 1-3 hrs</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-stone-50 border border-stone-200 rounded">
            <span className="w-2.5 h-2.5 rounded-full bg-stone-400 shrink-0" />
            <div>
              <span className="font-medium text-stone-700">Low</span>
              <span className="text-stone-500 ml-1">0 - 0.5</span>
              <br />
              <span className="text-stone-500">Minimal energy impact</span>
            </div>
          </div>
        </div>
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-[10px] text-amber-700 leading-relaxed">
            <strong>Note:</strong> This is an estimate based on rules of thumb for glycemic load responses.
            Individual responses vary based on metabolism, activity level, food combinations, and other factors.
            Low GL meals give gentle, steady energy over 2-3 hrs. Medium GL meals give moderate rise over 2-4 hrs.
            High GL meals cause a sharp spike with a likely crash 1.5-3 hrs later. Aim for mostly <strong>Steady</strong> zone throughout the day.
            This is not medical advice.
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-stone-500">
          {mealMarkers.map((m, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-stone-400" />
              {m.name} ({m.category}, GL {m.gl}) @ {m.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

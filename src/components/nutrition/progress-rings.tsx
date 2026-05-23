'use client';

import { useMemo } from 'react';

interface ProgressRingProps {
  label: string;
  current: number;
  goal: number;
  unit?: string;
  size?: number;
  strokeWidth?: number;
}

function getRingColor(percent: number): string {
  if (percent > 100) return '#ef4444';
  if (percent >= 80) return '#eab308';
  return '#22c55e';
}

export function ProgressRing({
  label,
  current,
  goal,
  unit = '',
  size = 80,
  strokeWidth = 6,
}: ProgressRingProps) {
  const percent = goal > 0 ? Math.round((current / goal) * 100) : 0;
  const color = getRingColor(percent);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;

  const displayCurrent = current >= 1000 ? `${(current / 1000).toFixed(1)}k` : Math.round(current);

  return (
    <div className="flex flex-col items-center gap-1" role="meter" aria-valuenow={current} aria-valuemin={0} aria-valuemax={goal} aria-label={`${label}: ${current}${unit} of ${goal}${unit}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="text-center -mt-[calc(50%+8px)] mb-[calc(50%-8px)]">
        <span className="text-sm font-semibold" style={{ color }}>{percent}%</span>
      </div>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
      {goal > 0 && (
        <span className="text-xs text-muted-foreground">
          {displayCurrent}{unit} / {Math.round(goal)}{unit}
        </span>
      )}
    </div>
  );
}

interface ProgressRingsGridProps {
  entries: Array<{
    calories: number;
    protein: number;
    totalFat: number;
    totalCarbs: number;
    dietaryFiber: number;
    sodium: number;
    totalSugars: number;
    vitaminD: number;
    calcium: number;
    iron: number;
    potassium: number;
  }>;
  goals?: {
    proteinGoalG?: number;
    carbsGoalG?: number;
    fatGoalG?: number;
    fiberGoalG?: number;
    sodiumMaxMg?: number;
    sugarMaxG?: number;
    vitaminDGoalUg?: number;
    calciumGoalMg?: number;
    ironGoalMg?: number;
    potassiumGoalMg?: number;
  } | null;
}

export function ProgressRingsGrid({ entries, goals }: ProgressRingsGridProps) {
  const totals = useMemo(() => {
    return entries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        protein: acc.protein + e.protein,
        totalFat: acc.totalFat + e.totalFat,
        totalCarbs: acc.totalCarbs + e.totalCarbs,
        dietaryFiber: acc.dietaryFiber + e.dietaryFiber,
        sodium: acc.sodium + e.sodium,
        totalSugars: acc.totalSugars + e.totalSugars,
        vitaminD: acc.vitaminD + e.vitaminD,
        calcium: acc.calcium + e.calcium,
        iron: acc.iron + e.iron,
        potassium: acc.potassium + e.potassium,
      }),
      { calories: 0, protein: 0, totalFat: 0, totalCarbs: 0, dietaryFiber: 0, sodium: 0, totalSugars: 0, vitaminD: 0, calcium: 0, iron: 0, potassium: 0 },
    );
  }, [entries]);

  if (!goals) {
    return (
      <p className="text-sm text-muted-foreground">
        Set nutrient goals in your nutrition profile to see progress rings.
      </p>
    );
  }

  const macros = [
    { label: 'Protein', current: totals.protein, goal: goals.proteinGoalG ?? 0, unit: 'g' },
    { label: 'Carbs', current: totals.totalCarbs, goal: goals.carbsGoalG ?? 0, unit: 'g' },
    { label: 'Fat', current: totals.totalFat, goal: goals.fatGoalG ?? 0, unit: 'g' },
    { label: 'Fiber', current: totals.dietaryFiber, goal: goals.fiberGoalG ?? 0, unit: 'g' },
  ];

  const minerals = [
    { label: 'Sodium', current: totals.sodium, goal: goals.sodiumMaxMg ?? 0, unit: 'mg' },
    { label: 'Calcium', current: totals.calcium, goal: goals.calciumGoalMg ?? 0, unit: 'mg' },
    { label: 'Iron', current: totals.iron, goal: goals.ironGoalMg ?? 0, unit: 'mg' },
    { label: 'Potassium', current: totals.potassium, goal: goals.potassiumGoalMg ?? 0, unit: 'mg' },
  ];

  const vitamins = [
    { label: 'Vitamin D', current: totals.vitaminD, goal: goals.vitaminDGoalUg ?? 0, unit: 'ug' },
    { label: 'Sugar', current: totals.totalSugars, goal: goals.sugarMaxG ?? 0, unit: 'g' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Macros</h4>
        <div className="grid grid-cols-4 gap-2">
          {macros.filter((m) => m.goal > 0).map((m) => (
            <ProgressRing key={m.label} label={m.label} current={m.current} goal={m.goal} unit={m.unit} />
          ))}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Minerals</h4>
        <div className="grid grid-cols-4 gap-2">
          {minerals.filter((m) => m.goal > 0).map((m) => (
            <ProgressRing key={m.label} label={m.label} current={m.current} goal={m.goal} unit={m.unit} />
          ))}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Other</h4>
        <div className="grid grid-cols-4 gap-2">
          {vitamins.filter((v) => v.goal > 0).map((v) => (
            <ProgressRing key={v.label} label={v.label} current={v.current} goal={v.goal} unit={v.unit} />
          ))}
        </div>
      </div>
    </div>
  );
}

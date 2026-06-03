'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Calendar } from 'lucide-react';

export type Period = 'today' | 'week' | 'month' | 'year' | 'day';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
}

export function PeriodSelector({ value, onChange, selectedDate, onDateChange }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg border bg-muted p-1 gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              value === p.value
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <Input
          type="date"
          value={selectedDate ?? formatDateForDB(new Date())}
          onChange={(e) => {
            if (onDateChange) onDateChange(e.target.value);
            onChange('day');
          }}
          className={`h-8 w-[140px] text-sm ${value === 'day' ? 'border-brand-400 ring-1 ring-brand-200' : ''}`}
        />
      </div>
    </div>
  );
}

export function getPeriodDates(period: Period, customDate?: string): { start: Date; end: Date } {
  if (period === 'day' && customDate) {
    const d = new Date(customDate + 'T00:00:00');
    return { start: d, end: d };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case 'today':
    case 'day':
      return { start: today, end: today };
    case 'week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { start: monday, end: sunday };
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start, end };
    }
    case 'year': {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      return { start, end };
    }
  }
}

export function formatDateForDB(date: Date): string {
  return date.toISOString().split('T')[0];
}

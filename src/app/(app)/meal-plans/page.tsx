'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMealPlans } from '@/hooks/use-meal-plans';

function getMonday(date: Date): Date {
  const day = getDay(date);
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(date);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function MealPlansPage() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { data: mealPlans = [], isLoading } = useMealPlans();

  const plannedWeeks = useMemo(() => {
    const set = new Set<string>();
    for (const plan of mealPlans) {
      set.add(plan.weekStart);
    }
    return set;
  }, [mealPlans]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

  function handleDayClick(day: Date) {
    const monday = getMonday(day);
    const weekStart = format(monday, 'yyyy-MM-dd');
    router.push(`/meal-plans/${weekStart}`);
  }

  function hasPlanForDay(day: Date): boolean {
    const monday = getMonday(day);
    return plannedWeeks.has(format(monday, 'yyyy-MM-dd'));
  }

  const today = new Date();

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900">Meal Plans</h1>
            <p className="text-xs text-stone-500">Select a week to plan your meals</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-stone-800 min-w-[140px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 ml-2"
            onClick={() => setCurrentMonth(new Date())}
          >
            Today
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-stone-50 border-b border-stone-200">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-stone-500">
              {d}
            </div>
          ))}
        </div>
        <div className="divide-y divide-stone-100">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day) => {
                const inMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, today);
                const hasPlan = hasPlanForDay(day);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => handleDayClick(day)}
                    className={`relative p-2 min-h-[64px] flex flex-col items-center gap-1 border-r border-stone-100 last:border-r-0 transition-colors ${
                      inMonth ? 'hover:bg-brand-50' : 'bg-stone-50/50'
                    } ${isToday ? 'bg-brand-50' : ''}`}
                  >
                    <span
                      className={`text-sm ${
                        !inMonth
                          ? 'text-stone-300'
                          : isToday
                          ? 'font-bold text-brand-700'
                          : 'text-stone-700'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {hasPlan && inMonth && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="text-center text-sm text-stone-400 mt-4">Loading meal plans...</p>
      )}
    </main>
  );
}

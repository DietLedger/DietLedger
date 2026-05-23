'use client';

import { useEffect } from 'react';
import { useAppSettingsStore } from '@/lib/app-settings-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { DEFAULT_MEAL_SLOT_TIMES, type DaySlot } from '@/lib/types';

const SLOT_LABELS: Record<DaySlot, string> = {
  morning: 'Morning',
  midMorning: 'Mid-Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const SLOT_ORDER: DaySlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night'];

export default function SettingsPage() {
  const { defaultMealSlotTimes, fetchSettings, updateSingleSlotTime } = useAppSettingsStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleResetDefaults = () => {
    const { updateDefaultMealSlotTimes } = useAppSettingsStore.getState();
    updateDefaultMealSlotTimes({ ...DEFAULT_MEAL_SLOT_TIMES });
  };

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-600" />
              Default Meal Times
            </CardTitle>
            <button
              onClick={handleResetDefaults}
              className="text-xs text-stone-500 hover:text-brand-600 transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
          <p className="text-xs text-stone-400">
            These default times are used when creating new meal plans. Individual meal plans can override these.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {SLOT_ORDER.map((slot) => (
              <div key={slot} className="flex items-center justify-between">
                <span className="text-sm text-stone-600">{SLOT_LABELS[slot]}</span>
                <input
                  type="time"
                  value={defaultMealSlotTimes[slot] || DEFAULT_MEAL_SLOT_TIMES[slot]}
                  onChange={(e) => updateSingleSlotTime(slot, e.target.value)}
                  className="h-8 w-32 px-2 text-sm border border-stone-200 rounded-md bg-transparent focus:outline-none focus:border-brand-400"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

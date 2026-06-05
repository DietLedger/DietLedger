'use client';

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Leaf, Search, Plus } from 'lucide-react';
import type { RecipeRecord, DayPlanEntryRecord } from '@/lib/types';
import type { DaySlot } from '@/lib/types';
import { computeSynergies, type SynergyResult } from '@/lib/recipe-synergy';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SLOT_LABELS: Record<DaySlot, string> = {
  morning: 'Morning',
  midMorning: 'Mid-Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const SLOT_ORDER: DaySlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night'];

interface FoodSynergiesPanelProps {
  editingDay: string | null;
  dayEntries: DayPlanEntryRecord[];
  allRecipes: RecipeRecord[];
  pantryStaples: Set<string>;
  seasonalFoods: string[];
  currentMonth: number;
  onSeasonalFoodClick: (foodName: string) => void;
  onAddToSlot: (recipeId: string, slot: DaySlot) => void;
}

export default function FoodSynergiesPanel({
  editingDay,
  dayEntries,
  allRecipes,
  pantryStaples,
  seasonalFoods,
  currentMonth,
  onSeasonalFoodClick,
  onAddToSlot,
}: FoodSynergiesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(20);
  const scrollRef = useRef<HTMLDivElement>(null);

  const mealPlanRecipeIds = useMemo(
    () => [...new Set(dayEntries.map((e) => e.recipeId).filter(Boolean) as string[])],
    [dayEntries]
  );

  const synergies = useMemo(
    () => computeSynergies(mealPlanRecipeIds, allRecipes, pantryStaples),
    [mealPlanRecipeIds, allRecipes, pantryStaples]
  );

  const filteredSynergies = useMemo(() => {
    if (!searchQuery.trim()) return synergies;
    const q = searchQuery.toLowerCase();
    return synergies.filter((s) => s.recipe.name.toLowerCase().includes(q));
  }, [synergies, searchQuery]);

  const displayed = filteredSynergies.slice(0, displayCount);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setDisplayCount((prev) => Math.min(prev + 20, filteredSynergies.length));
    }
  }, [filteredSynergies.length]);

  useEffect(() => {
    setDisplayCount(20);
  }, [searchQuery]);

  const occupiedSlots = useMemo(() => {
    const slots = new Set<DaySlot>();
    for (const entry of dayEntries) {
      if (entry.date === editingDay) {
        slots.add(entry.slot);
      }
    }
    return slots;
  }, [dayEntries, editingDay]);

  const firstEmptySlot = useMemo(
    () => SLOT_ORDER.find((s) => !occupiedSlots.has(s)) || 'morning',
    [occupiedSlots]
  );

  return (
    <div className="flex flex-col h-full border rounded-lg bg-white overflow-hidden">
      <div className="p-3 border-b bg-brand-50">
        <h3 className="text-sm font-semibold text-brand-800 flex items-center gap-2">
          <Leaf className="w-4 h-4 text-brand-600" />Suggestions
        </h3>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-1/2 border-b flex flex-col min-h-0">
          <div className="px-3 pt-2 pb-1 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-stone-600">Synergies</span>
              <Badge variant="outline" className="text-[10px] h-4">
                {synergies.length}
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400" />
              <Input
                placeholder="Search recipes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7"
              />
            </div>
          </div>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-3 pb-2"
          >
            {displayed.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">
                {mealPlanRecipeIds.length === 0
                  ? 'Add meals to see suggestions'
                  : 'No recipes share ingredients'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {displayed.map((result) => (
                  <SynergyRecipeRow
                    key={result.recipe.id}
                    result={result}
                    firstEmptySlot={firstEmptySlot}
                    onAddToSlot={onAddToSlot}
                  />
                ))}
                {displayed.length < filteredSynergies.length && (
                  <p className="text-[10px] text-stone-400 text-center py-1">
                    Scroll for more ({filteredSynergies.length - displayed.length} remaining)
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="h-1/2 flex flex-col min-h-0">
          <div className="px-3 pt-2 pb-1 flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-stone-600">
              In Season – {MONTH_NAMES[currentMonth - 1]}
            </span>
            <Badge variant="outline" className="text-[10px] h-4">
              {seasonalFoods.length}
            </Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {seasonalFoods.length === 0 ? (
                <p className="text-xs text-stone-400 py-2 w-full text-center">
                  No seasonal data. Set your location in Settings.
                </p>
              ) : (
                seasonalFoods.map((food) => (
                  <button
                    key={food}
                    className="px-2 py-1 text-xs rounded-full border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                    onClick={() => onSeasonalFoodClick(food)}
                  >
                    {food}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function SynergyRecipeRow({
  result,
  firstEmptySlot,
  onAddToSlot,
}: {
  result: SynergyResult;
  firstEmptySlot: DaySlot;
  onAddToSlot: (recipeId: string, slot: DaySlot) => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState<DaySlot>(firstEmptySlot);

  return (
    <div className="flex items-center gap-2 p-2 rounded-md border border-stone-200 hover:border-brand-200 bg-white">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-stone-800 truncate">{result.recipe.name}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-brand-100 text-brand-700">
            {result.score} shared
          </Badge>
          {result.sharedIngredients.slice(0, 3).map((ing) => (
            <span key={ing} className="text-[9px] text-stone-400 truncate">
              {ing}
            </span>
          ))}
          {result.sharedIngredients.length > 3 && (
            <span className="text-[9px] text-stone-400">+{result.sharedIngredients.length - 3}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Select value={selectedSlot} onValueChange={(v) => setSelectedSlot(v as DaySlot)}>
          <SelectTrigger className="h-6 w-[90px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SLOT_ORDER.map((slot) => (
              <SelectItem key={slot} value={slot} className="text-xs">
                {SLOT_LABELS[slot]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-brand-600 hover:text-brand-700 hover:bg-brand-50"
          onClick={() => onAddToSlot(result.recipe.id, selectedSlot)}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

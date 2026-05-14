'use client';

import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus } from 'lucide-react';
import type { RecipeRecord, DayPlanEntryRecord } from '@/lib/storage';
import type { DaySlot } from '@/lib/types';
import { findRecipesContainingIngredient } from '@/lib/recipe-synergy';

const SLOT_LABELS: Record<DaySlot, string> = {
  morning: 'Morning',
  midMorning: 'Mid-Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

const SLOT_ORDER: DaySlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening'];

interface InSeasonRecipeDialogProps {
  foodName: string | null;
  editingDay: string | null;
  dayEntries: DayPlanEntryRecord[];
  allRecipes: RecipeRecord[];
  onClose: () => void;
  onAddToSlot: (recipeId: string, slot: DaySlot) => void;
}

export default function InSeasonRecipeDialog({
  foodName,
  editingDay,
  dayEntries,
  allRecipes,
  onClose,
  onAddToSlot,
}: InSeasonRecipeDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const matchingRecipes = useMemo(() => {
    if (!foodName) return [];
    return findRecipesContainingIngredient(allRecipes, foodName);
  }, [foodName, allRecipes]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return matchingRecipes;
    const q = searchQuery.toLowerCase();
    return matchingRecipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [matchingRecipes, searchQuery]);

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
    <Dialog open={!!foodName} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Recipes with &ldquo;{foodName}&rdquo;
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm pl-7"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {filtered.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-4">
              No recipes found with this ingredient
            </p>
          ) : (
            filtered.map((recipe) => (
              <RecipeDialogRow
                key={recipe.id}
                recipe={recipe}
                foodName={foodName!}
                firstEmptySlot={firstEmptySlot}
                onAddToSlot={onAddToSlot}
                onClose={onClose}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecipeDialogRow({
  recipe,
  foodName,
  firstEmptySlot,
  onAddToSlot,
  onClose,
}: {
  recipe: RecipeRecord;
  foodName: string;
  firstEmptySlot: DaySlot;
  onAddToSlot: (recipeId: string, slot: DaySlot) => void;
  onClose: () => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState<DaySlot>(firstEmptySlot);

  return (
    <div className="flex items-center gap-2 p-2 rounded-md border border-stone-200 hover:border-brand-200">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate">{recipe.name}</p>
        <p className="text-[10px] text-stone-400 mt-0.5">
          {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Select value={selectedSlot} onValueChange={(v) => setSelectedSlot(v as DaySlot)}>
          <SelectTrigger className="h-7 w-[100px] text-xs">
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
          className="h-7 bg-brand-600 hover:bg-brand-700 gap-1 text-xs"
          onClick={() => {
            onAddToSlot(recipe.id, selectedSlot);
            onClose();
          }}
        >
          <Plus className="w-3 h-3" />Add
        </Button>
      </div>
    </div>
  );
}

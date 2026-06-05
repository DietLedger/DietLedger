'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, X, Package } from 'lucide-react';
import { getApiClient } from '@/lib/api-client';

const DEFAULT_PANTRY_STAPLES = [
  'All-purpose flour', 'Sugar', 'Salt', 'Pepper', 'Olive oil',
  'Butter', 'Eggs', 'Milk', 'Onions', 'Garlic',
  'Rice', 'Pasta', 'Tomato paste', 'Chicken broth', 'Soy sauce',
];

export default function PantryStaplesPanel() {
  const [staples, setStaples] = useState<string[]>([]);
  const [newStaple, setNewStaple] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadStaples = useCallback(async () => {
    try {
      const all = await getApiClient().getPantryStaples();
      if (all.length === 0) {
        for (const s of DEFAULT_PANTRY_STAPLES) {
          await getApiClient().addPantryStaple(s);
        }
        const seeded = await getApiClient().getPantryStaples();
        setStaples(seeded);
      } else {
        setStaples(all);
      }
    } catch {
      setStaples([]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadStaples();
  }, [loadStaples]);

  const handleAdd = useCallback(async () => {
    const trimmed = newStaple.trim();
    if (!trimmed) return;
    if (staples.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setNewStaple('');
      return;
    }
    await getApiClient().addPantryStaple(trimmed);
    setNewStaple('');
    const all = await getApiClient().getPantryStaples();
    setStaples(all);
  }, [newStaple, staples]);

  const handleRemove = useCallback(async (name: string) => {
    await getApiClient().removePantryStaple(name);
    const all = await getApiClient().getPantryStaples();
    setStaples(all);
  }, []);

  if (isLoading) {
    return <p className="text-xs text-stone-400 text-center py-4">Loading staples...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-stone-700 flex items-center gap-2 mb-2">
          <Package className="w-3.5 h-3.5 text-brand-600" />Pantry Staples
        </label>
        <p className="text-xs text-stone-400 mb-3">
          Ingredients considered &quot;always on hand&quot;. These are excluded from recipe synergy suggestions.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Add a staple (e.g., salt, olive oil)..."
            value={newStaple}
            onChange={(e) => setNewStaple(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            className="flex-1 text-sm h-9"
          />
          <Button
            onClick={handleAdd}
            disabled={!newStaple.trim()}
            size="sm"
            className="bg-brand-600 hover:bg-brand-700 shrink-0"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="max-h-[300px]">
        <div className="flex flex-wrap gap-1.5">
          {staples.map((name) => (
            <Badge
              key={name}
              variant="secondary"
              className="text-xs gap-1 pr-1 bg-stone-100 text-stone-700 hover:bg-stone-200"
            >
              {name}
              <button
                className="ml-0.5 rounded-full p-0.5 hover:bg-stone-300 transition-colors"
                onClick={() => handleRemove(name)}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      </ScrollArea>
      <p className="text-[10px] text-stone-400">{staples.length} staple{staples.length !== 1 ? 's' : ''}</p>
    </div>
  );
}

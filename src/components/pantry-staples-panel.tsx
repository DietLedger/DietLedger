'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, X, Package, Globe } from 'lucide-react';
import { getApiClient } from '@/lib/api-client';
import type { PantryStapleRecord } from '@/lib/types';

export default function PantryStaplesPanel() {
  const [staples, setStaples] = useState<PantryStapleRecord[]>([]);
  const [newStaple, setNewStaple] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadStaples = useCallback(async () => {
    try {
      setStaples(await getApiClient().getPantryStaples());
    } catch {
      setStaples([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaples();
  }, [loadStaples]);

  const handleAdd = useCallback(async () => {
    const trimmed = newStaple.trim();
    if (!trimmed) return;
    if (staples.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewStaple('');
      return;
    }
    await getApiClient().addPantryStaple(trimmed);
    setNewStaple('');
    setStaples(await getApiClient().getPantryStaples());
  }, [newStaple, staples]);

  const handleRemove = useCallback(async (name: string) => {
    await getApiClient().removePantryStaple(name);
    setStaples(await getApiClient().getPantryStaples());
  }, []);

  if (isLoading) {
    return <p className="text-xs text-stone-400 text-center py-4">Loading staples...</p>;
  }

  const globals = staples.filter((s) => s.isGlobal);
  const account = staples.filter((s) => !s.isGlobal);

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

      {globals.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-500 flex items-center gap-1 mb-1.5">
            <Globe className="w-3 h-3" />Global staples (read-only)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {globals.map((s) => (
              <Badge key={s.id} variant="secondary" className="text-xs bg-stone-100 text-stone-500">
                {s.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-medium text-stone-500 mb-1.5">Your staples</p>
        <ScrollArea className="max-h-[300px]">
          <div className="flex flex-wrap gap-1.5">
            {account.map((s) => (
              <Badge
                key={s.id}
                variant="secondary"
                className="text-xs gap-1 pr-1 bg-stone-100 text-stone-700 hover:bg-stone-200"
              >
                {s.name}
                <button
                  className="ml-0.5 rounded-full p-0.5 hover:bg-stone-300 transition-colors"
                  onClick={() => handleRemove(s.name)}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {account.length === 0 && (
              <p className="text-xs text-stone-400">No personal staples yet.</p>
            )}
          </div>
        </ScrollArea>
      </div>
      <p className="text-[10px] text-stone-400">{account.length} personal staple{account.length !== 1 ? 's' : ''}</p>
    </div>
  );
}

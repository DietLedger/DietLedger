'use client';

import { useState, useMemo, useCallback } from 'react';
import type { ScaleOptions, ScaledRecipe, ScaleMode } from '@/lib/types';
import { scaleRecipe, formatScaledAmount, classifyIngredient } from '@/lib/recipe-scaling';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Minus, Plus, RotateCcw, Check } from 'lucide-react';

interface ScalingControlsProps {
  recipe: {
    id: string;
    servings: number;
    ingredients: Array<{ id: string; name: string; amount: number; unit: string }>;
    totalCalories?: number;
  };
  onApplyScale?: (scaled: ScaledRecipe) => void;
}

export function ScalingControls({ recipe, onApplyScale }: ScalingControlsProps) {
  const [mode, setMode] = useState<ScaleMode>('servings');
  const [targetServings, setTargetServings] = useState(recipe.servings);
  const [multiplier, setMultiplier] = useState(1);
  const [calorieTarget, setCalorieTarget] = useState(recipe.totalCalories ?? 0);
  const [applied, setApplied] = useState(false);

  const options: ScaleOptions = useMemo(() => {
    switch (mode) {
      case 'servings':
        return { mode: 'servings', originalServings: recipe.servings, targetServings };
      case 'multiplier':
        return { mode: 'multiplier', originalServings: recipe.servings, multiplier };
      case 'calorieTarget':
        return {
          mode: 'calorieTarget',
          originalServings: recipe.servings,
          calorieTarget,
          originalCalories: recipe.totalCalories,
        };
    }
  }, [mode, recipe.servings, recipe.totalCalories, targetServings, multiplier, calorieTarget]);

  const scaled = useMemo(() => scaleRecipe(recipe, options), [recipe, options]);

  const handleQuickMultiplier = (m: number) => {
    setMode('multiplier');
    setMultiplier(m);
    setApplied(false);
  };

  const handleReset = () => {
    setMode('servings');
    setTargetServings(recipe.servings);
    setMultiplier(1);
    setCalorieTarget(recipe.totalCalories ?? 0);
    setApplied(false);
  };

  const handleApply = () => {
    onApplyScale?.(scaled);
    setApplied(true);
  };

  const hasChanges = scaled.scaleFactor !== 1;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Scale Recipe</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex gap-1">
          <Button
            variant={mode === 'servings' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setMode('servings'); setApplied(false); }}
          >
            Servings
          </Button>
          <Button
            variant={mode === 'multiplier' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setMode('multiplier'); setApplied(false); }}
          >
            Multiplier
          </Button>
          <Button
            variant={mode === 'calorieTarget' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setMode('calorieTarget'); setApplied(false); }}
          >
            Calories
          </Button>
        </div>

        {mode === 'servings' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setTargetServings(Math.max(1, targetServings - 1)); setApplied(false); }}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              className="w-16 h-8 text-center"
              value={targetServings}
              onChange={(e) => { setTargetServings(Math.max(1, Number(e.target.value))); setApplied(false); }}
              min={1}
            />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setTargetServings(targetServings + 1); setApplied(false); }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm text-muted-foreground">
              (was {recipe.servings})
            </span>
          </div>
        )}

        {mode === 'multiplier' && (
          <div className="flex gap-1">
            {[0.5, 2, 3, 4].map((m) => (
              <Button
                key={m}
                variant={multiplier === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickMultiplier(m)}
              >
                {m}x
              </Button>
            ))}
          </div>
        )}

        {mode === 'calorieTarget' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="w-24 h-8"
              value={calorieTarget}
              onChange={(e) => { setCalorieTarget(Number(e.target.value)); setApplied(false); }}
              min={0}
            />
            <span className="text-sm text-muted-foreground">cal</span>
          </div>
        )}

        {hasChanges && (
          <>
            <div className="text-xs text-muted-foreground">
              Scale factor: {scaled.scaleFactor.toFixed(2)}x — Serves {scaled.servings}
            </div>

            {scaled.warnings.length > 0 && (
              <div className="space-y-1">
                {scaled.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              {scaled.ingredients.map((si) => (
                <div key={si.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{si.name}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground line-through text-xs shrink-0">
                          {si.originalAmount} {si.originalUnit}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Original: {si.originalAmount} {si.originalUnit}</p>
                        {si.scaleReason && <p className="text-amber-500">{si.scaleReason}</p>}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="font-medium shrink-0">
                    {si.displayAmount} {si.scaledUnit}
                  </span>
                  {si.scaleReason && (
                    <Badge variant="outline" className="text-xs h-5">{si.classification}</Badge>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleApply} disabled={applied}>
                <Check className="h-3.5 w-3.5 mr-1" />
                {applied ? 'Applied' : 'Apply Scale'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />Reset
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

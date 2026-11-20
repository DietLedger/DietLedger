'use client';

import { useState, useMemo, useCallback } from 'react';
import type { DietaryTag, Allergen, DietaryProfileRecord } from '@/lib/types';
import { detectAllergens, inferDietaryTags } from '@/lib/dietary-rules';
import { useDietaryProfiles } from '@/hooks/use-dietary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, Filter } from 'lucide-react';

const ALL_TAGS: { tag: DietaryTag; label: string }[] = [
  { tag: 'vegetarian', label: 'Vegetarian' },
  { tag: 'vegan', label: 'Vegan' },
  { tag: 'glutenFree', label: 'Gluten-Free' },
  { tag: 'dairyFree', label: 'Dairy-Free' },
  { tag: 'nutFree', label: 'Nut-Free' },
  { tag: 'soyFree', label: 'Soy-Free' },
  { tag: 'eggFree', label: 'Egg-Free' },
  { tag: 'keto', label: 'Keto' },
  { tag: 'paleo', label: 'Paleo' },
  { tag: 'lowFodmap', label: 'Low-FODMAP' },
];

interface DietaryFiltersProps {
  activeTags: DietaryTag[];
  onTagsChange: (tags: DietaryTag[]) => void;
  excludeAllergens: boolean;
  onExcludeAllergensChange: (exclude: boolean) => void;
  diabetesProfileId?: string | null;
  onDiabetesProfileChange?: (id: string | null) => void;
  onRestoreDiabetesProfile?: () => void;
  diabetesProfileRestorePending?: boolean;
  diabetesFilterRequested?: boolean;
}

export function DietaryFilters({
  activeTags,
  onTagsChange,
  excludeAllergens,
  onExcludeAllergensChange,
  diabetesProfileId = null,
  onDiabetesProfileChange,
  onRestoreDiabetesProfile,
  diabetesProfileRestorePending = false,
  diabetesFilterRequested = false,
}: DietaryFiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const { profiles, activeProfileId } = useDietaryProfiles();
  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId),
    [profiles, activeProfileId]
  );

  const toggleTag = (tag: DietaryTag) => {
    onTagsChange(
      activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag]
    );
  };

  const clearAll = () => {
    onTagsChange([]);
    onExcludeAllergensChange(false);
    onDiabetesProfileChange?.(null);
  };

  const diabetesProfiles = profiles.filter(p => p.dietaryTags.includes('diabetesAware'));
  const selectedDiabetesProfile = diabetesProfiles.find(p => p.id === diabetesProfileId);
  const restoreProfileId = diabetesProfiles.find(p => p.id === activeProfileId)?.id ?? diabetesProfiles[0]?.id ?? null;
  const diabetesRequested = diabetesFilterRequested || !!diabetesProfileId || diabetesProfileRestorePending;
  const hasFilters = activeTags.length > 0 || excludeAllergens || diabetesRequested;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant={hasFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Dietary Filters
          {hasFilters && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
              {activeTags.length + (excludeAllergens ? 1 : 0) + (diabetesRequested ? 1 : 0)}
            </Badge>
          )}
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        )}
      </div>

      {expanded && (
        <div className="max-h-72 overflow-y-auto space-y-3 p-3 border rounded-lg bg-card">
          <div className="flex flex-wrap gap-1.5">
            {ALL_TAGS.map(({ tag, label }) => (
              <Button key={tag} type="button" size="sm" className="h-6 px-2 text-xs" variant={activeTags.includes(tag) ? 'default' : 'outline'} aria-pressed={activeTags.includes(tag)} onClick={() => toggleTag(tag)}>
                {label}
              </Button>
            ))}
          </div>

          {onDiabetesProfileChange && (
            <Button type="button" size="sm" className="h-6 px-2 text-xs" variant={diabetesRequested ? 'default' : 'outline'} aria-pressed={diabetesRequested} disabled={diabetesProfileRestorePending} onClick={() => {
              if (selectedDiabetesProfile) onDiabetesProfileChange(null);
              else if (restoreProfileId) onDiabetesProfileChange(restoreProfileId);
              else onRestoreDiabetesProfile?.();
            }}>
              Diabetic
            </Button>
          )}
          {activeProfile && (
            <div className="flex items-center gap-2">
              <Switch
                id="exclude-allergens"
                checked={excludeAllergens}
                onCheckedChange={onExcludeAllergensChange}
              />
              <Label htmlFor="exclude-allergens" className="text-sm cursor-pointer">
                Exclude my allergens ({activeProfile.allergens.join(', ') || 'none set'})
              </Label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function applyDietaryFilters(
  recipes: Array<{
    id: string;
    ingredients: Array<{ name: string }>;
    [key: string]: unknown;
  }>,
  activeTags: DietaryTag[],
  excludeAllergens: boolean,
  profile?: DietaryProfileRecord | null,
): Array<{
  id: string;
  ingredients: Array<{ name: string }>;
  [key: string]: unknown;
}> {
  if (activeTags.length === 0 && !excludeAllergens) return recipes;

  return recipes.filter((recipe) => {
    if (activeTags.length > 0) {
      const recipeTags = inferDietaryTags(recipe.ingredients);
      const recipeTagSet = new Set(recipeTags);
      const matchesAll = activeTags.every((t) => recipeTagSet.has(t));
      if (!matchesAll) return false;
    }

    if (excludeAllergens && profile && profile.allergens.length > 0) {
      const detections = detectAllergens(recipe.ingredients);
      const detectedSet = new Set(detections.map((d) => d.allergen));
      const hasAllergen = profile.allergens.some((a) => detectedSet.has(a));
      if (hasAllergen) return false;
    }

    return true;
  });
}

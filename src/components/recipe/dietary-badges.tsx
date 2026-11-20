'use client';

import { useMemo } from 'react';
import type { DietaryProfileRecord, Allergen } from '@/lib/types';
import { detectAllergens, inferDietaryTags, isRecipeCompliant } from '@/lib/dietary-rules';
import { Badge } from '@/components/ui/badge';
import { Check, AlertTriangle, HelpCircle } from 'lucide-react';

const ALLERGEN_LABELS: Record<string, string> = {
  milk: 'Dairy',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  treeNuts: 'T.Nuts',
  peanuts: 'Peanuts',
  wheat: 'Wheat',
  soybeans: 'Soy',
  sesame: 'Sesame',
};

interface DietaryBadgesProps {
  ingredients: Array<{ name: string }>;
  profile?: DietaryProfileRecord | null;
  compact?: boolean;
}

export function DietaryBadges({ ingredients, profile, compact }: DietaryBadgesProps) {
  const { detections, tags, compliance } = useMemo(() => {
    const detections = detectAllergens(ingredients);
    const tags = inferDietaryTags(ingredients);
    const compliance = profile ? isRecipeCompliant({ ingredients }, profile) : null;
    return { detections, tags, compliance };
  }, [ingredients, profile]);

  if (ingredients.length === 0) return null;

  if (compact && profile) {
    if (profile.dietaryTags.includes('diabetesAware') || profile.nutrientThresholds.some(t => t.perMealMax != null || t.per1000KcalMin != null)) {
      return <Badge variant="outline" className="text-xs gap-0.5"><HelpCircle className="h-3 w-3" />Nutrition not assessed</Badge>;
    }
    if (!compliance) return null;
    if (compliance.compliant) {
      return (
        <Badge variant="outline" className="text-xs gap-0.5 text-green-600 border-green-300 bg-green-50">
          <Check className="h-3 w-3" />Compliant
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs gap-0.5 text-amber-600 border-amber-300 bg-amber-50">
        <AlertTriangle className="h-3 w-3" />{compliance.violations.length} issue{compliance.violations.length !== 1 ? 's' : ''}
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {detections.map((d) => (
        <Badge key={d.allergen} variant="destructive" className="text-xs">
          {ALLERGEN_LABELS[d.allergen] ?? d.allergen}
        </Badge>
      ))}
      {tags.slice(0, 3).map((t) => (
        <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
      ))}
    </div>
  );
}

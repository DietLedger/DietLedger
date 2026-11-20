'use client';

import { useMemo } from 'react';
import type { AllergenDetection, DietaryTag } from '@/lib/types';
import { detectAllergens, inferDietaryTags, getAllergenNames } from '@/lib/dietary-rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

const ALLERGEN_LABELS: Record<string, string> = {
  milk: 'Milk/Dairy',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  treeNuts: 'Tree Nuts',
  peanuts: 'Peanuts',
  wheat: 'Wheat/Gluten',
  soybeans: 'Soy',
  sesame: 'Sesame',
};

const TAG_LABELS: Record<DietaryTag, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  glutenFree: 'Gluten-Free',
  dairyFree: 'Dairy-Free',
  nutFree: 'Nut-Free',
  soyFree: 'Soy-Free',
  eggFree: 'Egg-Free',
  keto: 'Keto',
  paleo: 'Paleo',
  lowFodmap: 'Low-FODMAP',
  dASH: 'DASH',
  mediterranean: 'Mediterranean',
  diabetesAware: 'Diabetes-aware',
};

interface AllergenPanelProps {
  ingredients: Array<{ name: string }>;
}

export function AllergenPanel({ ingredients }: AllergenPanelProps) {
  const detections = useMemo(() => detectAllergens(ingredients), [ingredients]);
  const tags = useMemo(() => inferDietaryTags(ingredients), [ingredients]);

  if (ingredients.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Add ingredients to detect allergens.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Allergen Analysis</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {detections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No common allergens detected.</p>
        ) : (
          <div className="space-y-2">
            {detections.map((d) => (
              <div key={d.allergen} className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{ALLERGEN_LABELS[d.allergen] ?? d.allergen}</p>
                  <p className="text-xs text-muted-foreground">
                    Found in: {d.ingredients.join(', ')}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {d.matchedKeywords.map((kw) => (
                      <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Compatible diets:</p>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">{TAG_LABELS[t]}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Star, Loader2, ChevronDown, ChevronRight, BookOpen, Link2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  serializeInstructions,
  parseInstructions,
  sumNutrition,
  emptyNutrition,
  type Ingredient,
  type InstructionStep,
  type InstructionGroup,
} from '@/lib/recipe-types';
import type { IngredientGroup } from '@/lib/api-client';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import { DietaryBadges } from '@/components/recipe/dietary-badges';
import NutritionLabel, { type NutritionData } from '@/components/nutrition-label';
import { useAuth } from '@/hooks/use-auth';
import { fmt } from '@/lib/format';
import { STORAGE_LOCATION_META, type StorageLocation } from '@/data/storage-locations';
import Link from 'next/link';

interface SharedRecipeData {
  id: string;
  shareToken: string;
  title: string;
  description?: string;
  category?: string;
  tags?: string;
  recipeData: string;
  viewCount: number;
  importCount: number;
  averageRating: number;
  ratingCount: number;
}

interface ParsedRecipe {
  name: string;
  servings: number;
  servingName?: string;
  ingredients: Ingredient[];
  ingredientGroups: IngredientGroup[];
  instructionSteps: InstructionStep[];
  instructionGroups: InstructionGroup[];
}

const NUTRIENT_DETAIL_ROWS: Array<[string, (i: Ingredient) => string]> = [
  ['Calories', (i) => fmt(i.calories)],
  ['Total Fat', (i) => `${fmt(i.totalFat)}g`],
  ['Saturated Fat', (i) => `${fmt(i.saturatedFat)}g`],
  ['Trans Fat', (i) => `${fmt(i.transFat)}g`],
  ['Cholesterol', (i) => `${fmt(i.cholesterol)}mg`],
  ['Sodium', (i) => `${fmt(i.sodium)}mg`],
  ['Total Carbs', (i) => `${fmt(i.totalCarbs)}g`],
  ['Dietary Fiber', (i) => `${fmt(i.dietaryFiber)}g`],
  ['Total Sugars', (i) => `${fmt(i.totalSugars)}g`],
  ['Added Sugars', (i) => `${fmt(i.addedSugars)}g`],
  ['Protein', (i) => `${fmt(i.protein)}g`],
  ['Vitamin D', (i) => `${fmt(i.vitaminD)}mcg`],
  ['Calcium', (i) => `${fmt(i.calcium)}mg`],
  ['Iron', (i) => `${fmt(i.iron)}mg`],
  ['Potassium', (i) => `${fmt(i.potassium)}mg`],
];

function groupBy<T extends { groupId: string | null }>(items: T[]): { grouped: Map<string, T[]>; ungrouped: T[] } {
  const grouped = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const item of items) {
    if (item.groupId) {
      const list = grouped.get(item.groupId) || [];
      list.push(item);
      grouped.set(item.groupId, list);
    } else {
      ungrouped.push(item);
    }
  }
  return { grouped, ungrouped };
}

function SharedRecipePageInner() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const shareId = (params?.shareId as string) || '';

  const [recipe, setRecipe] = useState<SharedRecipeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSetBreadcrumbLabel(`/share/${shareId}`, recipe?.title);

  useEffect(() => {
    if (!shareId) return;
    async function fetchRecipe() {
      try {
        const res = await fetch(`/api/share/${shareId}`);
        if (!res.ok) throw new Error('Recipe not found');
        const data = await res.json();
        setRecipe(data);
      } catch {
        setError('This shared recipe could not be found.');
      } finally {
        setLoading(false);
      }
    }
    fetchRecipe();
  }, [shareId]);

  const handleImport = useCallback(async () => {
    if (!recipe) return;
    setImporting(true);
    try {
      const parsed = JSON.parse(recipe.recipeData);
      const newRecipe = await getApiClient().createRecipe(parsed.name || recipe.title);
      const instructions = serializeInstructions({
        steps: parsed.instructionSteps || [],
        groups: parsed.instructionGroups || [],
      });
      await getApiClient().updateRecipe(newRecipe.id, {
        servings: parsed.servings || 1,
        servingName: parsed.servingName || 'serving',
        instructions: instructions || '',
        leftoverStorage: parsed.leftoverStorage,
        ingredients: parsed.ingredients || [],
        ingredientGroups: parsed.ingredientGroups || [],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.lists() });
      toast.success('Recipe imported to your collection!');
      router.push('/recipes');
    } catch {
      toast.error('Failed to import recipe');
    } finally {
      setImporting(false);
    }
  }, [recipe, router, queryClient]);

  const parsed = useMemo<ParsedRecipe>(() => {
    const fallback: ParsedRecipe = {
      name: recipe?.title || 'Shared Recipe',
      servings: 1,
      ingredients: [],
      ingredientGroups: [],
      instructionSteps: [],
      instructionGroups: [],
    };
    if (!recipe) return fallback;
    try {
      const raw = JSON.parse(recipe.recipeData);
      const instrPayload = parseInstructions(raw.instructions ?? null);
      return {
        name: raw.name || recipe.title,
        servings: raw.servings || 1,
        servingName: raw.servingName,
        ingredients: Array.isArray(raw.ingredients) ? raw.ingredients : [],
        ingredientGroups: Array.isArray(raw.ingredientGroups) ? raw.ingredientGroups : [],
        instructionSteps:
          Array.isArray(raw.instructionSteps) && raw.instructionSteps.length > 0
            ? raw.instructionSteps
            : instrPayload.steps,
        instructionGroups: Array.isArray(raw.instructionGroups) ? raw.instructionGroups : instrPayload.groups,
      };
    } catch {
      return fallback;
    }
  }, [recipe]);

  const totalNutrition = useMemo(
    () => (parsed.ingredients.length > 0 ? sumNutrition(parsed.ingredients) : emptyNutrition()),
    [parsed.ingredients],
  );
  const servings = parsed.servings || 1;

  const perServingNutrition: NutritionData = useMemo(() => {
    const div = (v: number) => Math.round((v / servings) * 10) / 10;
    return {
      servings,
      calories: div(totalNutrition.calories),
      totalFat: div(totalNutrition.totalFat),
      saturatedFat: div(totalNutrition.saturatedFat),
      transFat: div(totalNutrition.transFat),
      cholesterol: div(totalNutrition.cholesterol),
      sodium: div(totalNutrition.sodium),
      totalCarbs: div(totalNutrition.totalCarbs),
      dietaryFiber: div(totalNutrition.dietaryFiber),
      totalSugars: div(totalNutrition.totalSugars),
      addedSugars: div(totalNutrition.addedSugars),
      protein: div(totalNutrition.protein),
      vitaminD: div(totalNutrition.vitaminD),
      calcium: div(totalNutrition.calcium),
      iron: div(totalNutrition.iron),
      potassium: div(totalNutrition.potassium),
    };
  }, [totalNutrition, servings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">{error || 'Recipe not found'}</p>
      </div>
    );
  }

  const { grouped: groupedIngredients, ungrouped: ungroupedIngredients } = groupBy(parsed.ingredients);
  const { grouped: groupedSteps, ungrouped: ungroupedSteps } = groupBy(parsed.instructionSteps);
  const servingName = parsed.servingName || 'serving';

  return (
    <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-xl">{parsed.name}</CardTitle>
              {parsed.servings > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {parsed.servings} {servingName}{parsed.servings !== 1 ? 's' : ''}
                </p>
              )}
              {recipe.description && (
                <p className="text-sm text-muted-foreground mt-1">{recipe.description}</p>
              )}
            </div>
            <Button type="button" onClick={handleImport} disabled={importing} className="shrink-0">
              <Download className="h-4 w-4 mr-1" />
              {importing ? 'Importing...' : 'Import to My Recipes'}
            </Button>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
            <span>{recipe.viewCount} views</span>
            <span>{recipe.importCount} imports</span>
            {recipe.ratingCount > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {recipe.averageRating.toFixed(1)} ({recipe.ratingCount})
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <DietaryBadges ingredients={parsed.ingredients} />

          <Separator className="my-4" />

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left: Ingredients + Instructions */}
            <div className="lg:col-span-8 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-stone-700 flex items-center gap-2 mb-3">
                  <UtensilsCrossed className="w-4 h-4 text-brand-600" />Ingredients
                  <Badge variant="secondary" className="text-[10px] h-5">{parsed.ingredients.length}</Badge>
                </h3>

                {parsed.ingredientGroups.map((group) => {
                  const items = groupedIngredients.get(group.id);
                  if (!items || items.length === 0) return null;
                  return (
                    <div key={group.id} className="border border-brand-200 rounded-lg overflow-hidden bg-brand-50/30 mb-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border-b border-brand-200">
                        <FolderIcon className="w-3.5 h-3.5 text-brand-600" />
                        <span className="text-sm font-medium text-brand-800">{group.title}</span>
                      </div>
                      <div className="p-1.5 space-y-1.5">
                        {items.map((ing) => (
                          <IngredientRow key={ing.id} ingredient={ing} />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {ungroupedIngredients.length > 0 && (
                  <div className="space-y-1.5">
                    {ungroupedIngredients.map((ing) => (
                      <IngredientRow key={ing.id} ingredient={ing} />
                    ))}
                  </div>
                )}

                {parsed.ingredients.length === 0 && (
                  <p className="text-sm text-stone-400 italic">No ingredients</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-stone-700 mb-3">Instructions</h3>

                {parsed.instructionGroups.map((group) => {
                  const steps = groupedSteps.get(group.id);
                  if (!steps || steps.length === 0) return null;
                  return (
                    <div key={group.id} className="border border-brand-200 rounded-lg overflow-hidden bg-brand-50/30 mb-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border-b border-brand-200">
                        <FolderIcon className="w-3.5 h-3.5 text-brand-600" />
                        <span className="text-sm font-medium text-brand-800">{group.title}</span>
                      </div>
                      <div className="p-1.5 space-y-1.5">
                        {steps.map((step, i) => (
                          <InstructionStepView key={step.id} step={step} index={i} />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {ungroupedSteps.length > 0 && (
                  <div className="space-y-1.5">
                    {ungroupedSteps.map((step, i) => (
                      <InstructionStepView key={step.id} step={step} index={i} />
                    ))}
                  </div>
                )}

                {parsed.instructionSteps.length === 0 && (
                  <p className="text-sm text-stone-400 italic">No instructions</p>
                )}
              </div>
            </div>

            {/* Right: Nutrition Label */}
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-6 space-y-4">
                <Card className="border-stone-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-stone-700">Nutrition Facts</CardTitle>
                    <p className="text-xs text-stone-400">Per serving (1 {servingName})</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex justify-center">
                      <NutritionLabel
                        data={perServingNutrition}
                        servingDescription={`1 ${servingName}`}
                        servingsPerContainer={parsed.servings}
                      />
                    </div>
                    {parsed.ingredients.length > 0 && servings > 1 && (
                      <div className="mt-4 p-3 bg-stone-50 rounded-lg border border-stone-200">
                        <p className="text-xs font-medium text-stone-600 mb-2">
                          Full Recipe (all {servings} {servingName}{servings !== 1 ? 's' : ''})
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex justify-between"><span className="text-stone-500">Calories</span><span className="font-medium">{fmt(totalNutrition.calories)}</span></div>
                          <div className="flex justify-between"><span className="text-stone-500">Protein</span><span className="font-medium">{fmt(totalNutrition.protein)}g</span></div>
                          <div className="flex justify-between"><span className="text-stone-500">Total Fat</span><span className="font-medium">{fmt(totalNutrition.totalFat)}g</span></div>
                          <div className="flex justify-between"><span className="text-stone-500">Carbs</span><span className="font-medium">{fmt(totalNutrition.totalCarbs)}g</span></div>
                          <div className="flex justify-between"><span className="text-stone-500">Fiber</span><span className="font-medium">{fmt(totalNutrition.dietaryFiber)}g</span></div>
                          <div className="flex justify-between"><span className="text-stone-500">Sodium</span><span className="font-medium">{fmt(totalNutrition.sodium)}mg</span></div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {!isAuthenticated && (
            <>
              <Separator className="my-6" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Want to organize your own recipes?
                </p>
                <Button variant="outline" asChild>
                  <Link href="/recipes">Get DietLedger</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function IngredientRow({ ingredient }: { ingredient: Ingredient }) {
  const [expanded, setExpanded] = useState(false);
  const isRecipe = !!ingredient.linkedRecipeId;
  const storageLocation = ingredient.storageLocation as StorageLocation | undefined;
  const hasStorage = !!storageLocation && !!STORAGE_LOCATION_META[storageLocation];
  const hasPrep = (ingredient.prepInstructions?.length || 0) > 0;

  return (
    <div>
      <div
        className={`flex items-center justify-between p-3 bg-white border rounded-lg transition-colors cursor-pointer group ${
          isRecipe ? 'border-blue-200 hover:border-blue-300 bg-blue-50/30' : 'border-stone-200 hover:border-brand-300'
        }`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="px-0.5 text-stone-300">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
        <div className="flex-1 min-w-0 ml-2">
          <p className={`text-sm font-medium truncate flex items-center gap-1.5 ${isRecipe ? 'text-blue-800' : 'text-stone-800'}`}>
            {isRecipe && <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            {ingredient.name}
            {isRecipe && <Link2 className="w-3 h-3 text-blue-400 shrink-0" />}
            {hasStorage && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 text-stone-500">
                {STORAGE_LOCATION_META[storageLocation!].icon} {storageLocation}
              </span>
            )}
          </p>
          <p className={`text-xs mt-0.5 ${isRecipe ? 'text-blue-500' : 'text-stone-400'}`}>
            {isRecipe ? (
              <>{fmt(ingredient.amount)}× recipe · {fmt(ingredient.calories)} cal</>
            ) : (
              <>{fmt(ingredient.amount)}{ingredient.unit} · {fmt(ingredient.calories)} cal</>
            )}
            {ingredient.description && <span className="text-stone-500 ml-1">· {ingredient.description}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <div className="hidden sm:flex gap-2 text-[10px] text-stone-400">
            <span>P: {fmt(ingredient.protein)}g</span>
            <span>F: {fmt(ingredient.totalFat)}g</span>
            <span>C: {fmt(ingredient.totalCarbs)}g</span>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="mt-1 p-3 bg-stone-50 border border-stone-200 rounded-lg space-y-3">
          {hasPrep && (
            <div>
              <p className="text-xs font-medium text-stone-600 mb-1">Prep Instructions</p>
              <ul className="text-xs text-stone-600 space-y-0.5 list-disc list-inside">
                {ingredient.prepInstructions!.map((instr, idx) => (
                  <li key={idx}>{instr}</li>
                ))}
              </ul>
            </div>
          )}
          {hasStorage && (
            <div>
              <p className="text-xs font-medium text-stone-600">Store in: <span className="font-normal">{STORAGE_LOCATION_META[storageLocation!].icon} {storageLocation}</span></p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-stone-600 mb-1.5">Nutrition Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              {NUTRIENT_DETAIL_ROWS.map(([label, getVal]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-stone-500">{label}</span>
                  <span className="font-medium">{getVal(ingredient)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InstructionStepView({ step, index }: { step: InstructionStep; index: number }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg border border-stone-200 bg-white">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center mt-0.5">
        {index + 1}
      </span>
      <p className="flex-1 text-sm text-stone-700 whitespace-pre-wrap">{step.text}</p>
    </div>
  );
}

export default function SharedRecipePage() {
  return <SharedRecipePageInner />;
}

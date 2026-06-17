'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { serializeInstructions } from '@/lib/recipe-types';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import { DietaryBadges } from '@/components/recipe/dietary-badges';
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

function SharedRecipePageInner() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
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

  let parsedRecipe: { name: string; servings: number; ingredients: Array<{ name: string; amount: number; unit: string }>; instructions?: string | null } = { name: recipe.title, servings: 1, ingredients: [] };
  try {
    parsedRecipe = JSON.parse(recipe.recipeData);
  } catch {}

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{recipe.title}</CardTitle>
              {recipe.description && (
                <p className="text-sm text-muted-foreground mt-1">{recipe.description}</p>
              )}
            </div>
            <Button type="button" onClick={handleImport} disabled={importing}>
              <Download className="h-4 w-4 mr-1" />
              {importing ? 'Importing...' : 'Import to My Recipes'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{recipe.viewCount} views</span>
            <span>{recipe.importCount} imports</span>
            {recipe.ratingCount > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {recipe.averageRating.toFixed(1)} ({recipe.ratingCount})
              </span>
            )}
          </div>

          <DietaryBadges ingredients={parsedRecipe.ingredients} />

          <Separator />

          <div>
            <h3 className="font-medium mb-2">Ingredients</h3>
            <ul className="space-y-1 text-sm">
              {parsedRecipe.ingredients.map((ing, i) => (
                <li key={i}>
                  {ing.amount} {ing.unit} {ing.name}
                </li>
              ))}
            </ul>
          </div>

          {parsedRecipe.instructions && (
            <div>
              <h3 className="font-medium mb-2">Instructions</h3>
              <div className="text-sm whitespace-pre-wrap">{parsedRecipe.instructions}</div>
            </div>
          )}

          <Separator />

          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Want to organize your own recipes?
            </p>
            <Button variant="outline" asChild>
              <Link href="/recipes">Get DietLedger</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default function SharedRecipePage() {
  return <SharedRecipePageInner />;
}

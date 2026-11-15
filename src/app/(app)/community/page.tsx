'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CommunitySearch, CommunityGallery } from '@/components/community/community-gallery';
import { toast } from 'sonner';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import type { SharedRecipeRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Users, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRecipeImport } from '@/components/recipe/recipe-import-workflow';
import { sharedRecipeToBundle } from '@/lib/recipe-import-bundle';
import { summarizeRecipeBundleImport } from '@/lib/recipe-bundles';
import { RecipeTransferStatus } from '@/components/recipe/recipe-transfer-status';

export default function CommunityPage() {
  const { importBundle, decisionDialog } = useRecipeImport();
  const [importStatus, setImportStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [recipes, setRecipes] = useState<SharedRecipeRecord[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRecipes = useCallback(async () => {
    try {
      const data = await getApiClient().searchCommunity({
        q: query || undefined,
        category: category && category !== 'all' ? category : undefined,
        sort,
      });
      setRecipes(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load community recipes');
    } finally {
      setLoading(false);
    }
  }, [query, category, sort]);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await getApiClient().getCommunityCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const handleImport = useCallback(async (recipe: SharedRecipeRecord) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setImportingId(recipe.id);
    try {
      const result = await importBundle(sharedRecipeToBundle(recipe));
      setImportStatus({ kind: 'ok', msg: summarizeRecipeBundleImport(result) });
    } catch (error) {
      setImportStatus({ kind: 'err', msg: error instanceof Error ? error.message : 'Failed to import recipe' });
    } finally {
      setImportingId(null);
    }
  }, [isAuthenticated, router, importBundle]);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      {decisionDialog}
      <RecipeTransferStatus status={importStatus} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Community</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse and import shared recipes from the community.</p>
        </div>
        {isAuthenticated ? (
          <Button variant="outline" size="sm" asChild>
            <Link href="/recipes"><Users className="h-4 w-4 mr-1" />My Recipes</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href="/login"><LogIn className="h-4 w-4 mr-1" />Sign In</Link>
          </Button>
        )}
      </div>

      <div className="mb-6">
        <CommunitySearch
          query={query}
          onQueryChange={setQuery}
          category={category}
          onCategoryChange={setCategory}
          sort={sort}
          onSortChange={setSort}
          categories={categories}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading recipes...</div>
      ) : (
        <CommunityGallery
          recipes={recipes}
          onImport={handleImport}
          importingId={importingId}
        />
      )}
    </main>
  );
}

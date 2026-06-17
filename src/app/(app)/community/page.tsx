'use client';

import { useEffect, useState, useCallback } from 'react';
import { CommunitySearch, CommunityGallery } from '@/components/community/community-gallery';
import { toast } from 'sonner';
import { getApiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import Link from 'next/link';

interface PublicRecipe {
  id: string;
  shareToken: string;
  title: string;
  description?: string;
  category?: string;
  tags?: string;
  viewCount: number;
  importCount: number;
  averageRating: number;
  ratingCount: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function CommunityPage() {
  const [recipes, setRecipes] = useState<PublicRecipe[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRecipes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (category && category !== 'all') params.set('category', category);
      if (sort) params.set('sort', sort);
      const res = await fetch(`/api/community?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecipes(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error('Failed to load community recipes');
    } finally {
      setLoading(false);
    }
  }, [query, category, sort]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/community/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const handleImport = useCallback(async (recipe: PublicRecipe) => {
    setImportingId(recipe.id);
    try {
      await getApiClient().createRecipe(recipe.title);
      toast.success(`"${recipe.title}" imported to your recipes!`);
    } catch {
      toast.error('Failed to import recipe');
    } finally {
      setImportingId(null);
    }
  }, []);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Community</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse and import shared recipes from the community.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/recipes"><Users className="h-4 w-4 mr-1" />My Recipes</Link>
        </Button>
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

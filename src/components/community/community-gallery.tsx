'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, Star } from 'lucide-react';
import { toast } from 'sonner';
import type { SharedRecipeRecord } from '@/lib/types';

import Link from 'next/link';

interface CommunitySearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  category: string;
  onCategoryChange: (c: string) => void;
  sort: string;
  onSortChange: (s: string) => void;
  categories: Array<{ id: string; name: string; slug: string }>;
}

export function CommunitySearch({
  query,
  onQueryChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  categories,
}: CommunitySearchProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search recipes..."
          className="pl-9"
        />
      </div>
      <Select value={category} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={sort} onValueChange={onSortChange}>
        <SelectTrigger className="w-[130px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="most_imported">Most Imported</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

interface RecipeCardPublicProps {
  recipe: SharedRecipeRecord;
  onImport: (recipe: SharedRecipeRecord) => void;
  importing: boolean;
}

export function RecipeCardPublic({ recipe, onImport, importing }: RecipeCardPublicProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <Link href={`/share/${recipe.shareToken}`} className="font-medium hover:underline">
              {recipe.title}
            </Link>
            {recipe.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{recipe.description}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {recipe.category && (
            <Badge variant="secondary" className="text-xs">{recipe.category}</Badge>
          )}
          {recipe.tags && recipe.tags.split(',').filter(Boolean).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{recipe.viewCount} views</span>
            <span>{recipe.importCount} imports</span>
            {recipe.ratingCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {recipe.averageRating.toFixed(1)}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => onImport(recipe)} disabled={importing}>
            <Download className="h-3.5 w-3.5 mr-1" />
            {importing ? '...' : 'Import'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface CommunityGalleryProps {
  recipes: SharedRecipeRecord[];
  onImport: (recipe: SharedRecipeRecord) => void;
  importingId: string | null;
}

export function CommunityGallery({ recipes, onImport, importingId }: CommunityGalleryProps) {
  if (recipes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No recipes found. Be the first to share!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {recipes.map((recipe) => (
        <RecipeCardPublic
          key={recipe.id}
          recipe={recipe}
          onImport={onImport}
          importing={importingId === recipe.id}
        />
      ))}
    </div>
  );
}

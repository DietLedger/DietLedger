'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useBookStore } from '@/lib/book-store';
import { useRecipeStore } from '@/lib/recipe-store';
import { useTemplateStore } from '@/lib/template-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Pencil,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText,
  Eye,
  List,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarkdownPage from '@/components/markdown-page';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import BookRenderer, { type BookChapterData } from '@/components/book-renderer';
import type { RecipeData } from '@/components/recipe-renderer';
import type { NutritionData } from '@/components/nutrition-label';

type ChapterItem =
  | { type: 'recipe'; id: string; recipeId: string; position: number }
  | { type: 'page'; id: string; title: string; content: string; position: number };

function mergeChapterItems(
  recipes: { id: string; recipeId: string; position: number }[],
  pages: { id: string; title: string; content: string; position: number }[]
): ChapterItem[] {
  const items: ChapterItem[] = [
    ...recipes.map((r) => ({ type: 'recipe' as const, ...r })),
    ...pages.map((p) => ({ type: 'page' as const, ...p })),
  ];
  return items.sort((a, b) => a.position - b.position);
}

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { activeBook, isLoading, selectBook, updateChapter } = useBookStore();
  const { recipes, fetchRecipes } = useRecipeStore();
  const { templates, fetchTemplates } = useTemplateStore();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'detail' | 'preview'>('detail');
  const [selectedPageTemplateId, setSelectedPageTemplateId] = useState<string | null>(null);
  const [selectedRecipeTemplateId, setSelectedRecipeTemplateId] = useState<string | null>(null);
  const router = useRouter();

  useSetBreadcrumbLabel(`/books/${id}`, activeBook?.title);

  useEffect(() => {
    selectBook(id);
  }, [id, selectBook]);

  useEffect(() => {
    fetchRecipes();
    fetchTemplates();
  }, [fetchRecipes, fetchTemplates]);

  const toggleChapter = useCallback((chapterId: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  const handleChapterTemplateOverride = useCallback(async (
    chapterId: string,
    field: 'pageTemplateId' | 'recipeTemplateId',
    value: string | null,
  ) => {
    await updateChapter(chapterId, { [field]: value });
  }, [updateChapter]);

  const getRecipeName = useCallback(
    (recipeId: string) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      return recipe?.name || 'Unknown Recipe';
    },
    [recipes]
  );

  const pageTemplates = useMemo(() => templates.filter((t) => t.type === 'book-page'), [templates]);
  const recipeTemplates = useMemo(() => templates.filter((t) => t.type === 'book-recipe'), [templates]);

  const activePageTemplate = useMemo(() => {
    if (selectedPageTemplateId) {
      return pageTemplates.find((t) => t.id === selectedPageTemplateId) || null;
    }
    return pageTemplates[0] || null;
  }, [selectedPageTemplateId, pageTemplates]);

  const activeRecipeTemplate = useMemo(() => {
    if (selectedRecipeTemplateId) {
      return recipeTemplates.find((t) => t.id === selectedRecipeTemplateId) || null;
    }
    return recipeTemplates[0] || null;
  }, [selectedRecipeTemplateId, recipeTemplates]);

  const templateLookup = useMemo(() => {
    const map = new Map<string, import('@/lib/types').TemplateRecord>();
    for (const t of templates) map.set(t.id, t);
    return map;
  }, [templates]);

  const bookChapters: BookChapterData[] = useMemo(() => {
    if (!activeBook) return [];
    return activeBook.chapters.map((chapter) => {
      const items = mergeChapterItems(chapter.chapterRecipes, chapter.chapterPages);
      return {
        title: chapter.title,
        pageTemplateId: chapter.pageTemplateId,
        recipeTemplateId: chapter.recipeTemplateId,
        items: items.map((item) => {
          if (item.type === 'page') {
            return {
              type: 'page' as const,
              data: { title: item.title, content: item.content },
            };
          }
          const recipe = recipes.find((r) => r.id === item.recipeId);
          if (!recipe) {
            return {
              type: 'recipe' as const,
              data: {
                recipe: {
                  name: getRecipeName(item.recipeId),
                  servings: 1,
                  servingName: 'serving',
                  ingredients: [],
                  ingredientGroups: [],
                  instructionSteps: [],
                  instructionGroups: [],
                },
              },
            };
          }
          return {
            type: 'recipe' as const,
            data: {
              recipe: {
                name: recipe.name,
                servings: recipe.servings,
                servingName: recipe.servingName,
                ingredients: recipe.ingredients.map((i) => ({
                  id: i.id,
                  name: i.name,
                  amount: i.amount,
                  unit: i.unit,
                  description: i.description,
                  groupId: i.groupId,
                })),
                ingredientGroups: recipe.ingredientGroups,
                instructionSteps: recipe.instructionSteps,
                instructionGroups: recipe.instructionGroups,
              } as RecipeData,
            },
          };
        }),
      };
    });
  }, [activeBook, recipes, getRecipeName]);

  if (isLoading && !activeBook) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!activeBook) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-stone-700">Book not found</h2>
          <Link href="/books">
            <Button variant="ghost" className="mt-2 text-emerald-600">Back to Books</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeBook.coverColor }} />
          <h1 className="text-xl font-bold text-stone-900">{activeBook.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-stone-200 rounded-md overflow-hidden">
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'detail' ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
              onClick={() => setViewMode('detail')}
            >
              <List className="w-3.5 h-3.5 inline mr-1" />Detail
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-stone-200 ${viewMode === 'preview' ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
              onClick={() => setViewMode('preview')}
            >
              <Eye className="w-3.5 h-3.5 inline mr-1" />Preview
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => router.push(`/books/${id}/edit`)}
          >
            <Pencil className="w-3.5 h-3.5" />Edit Book
          </Button>
        </div>
      </div>
      {activeBook.description && (
        <p className="text-stone-600 mb-6">{activeBook.description}</p>
      )}

      {viewMode === 'preview' ? (
        <div>
          <div className="flex items-center gap-4 mb-4 p-3 bg-stone-50 rounded-lg border border-stone-200">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs font-medium text-stone-600 shrink-0">Page Template</label>
              <select
                className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-xs"
                value={activePageTemplate?.id || ''}
                onChange={(e) => setSelectedPageTemplateId(e.target.value || null)}
              >
                {pageTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
                {pageTemplates.length === 0 && <option value="">No templates</option>}
              </select>
              {activePageTemplate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 shrink-0"
                  onClick={() => { window.location.href = `/settings/templates/new?from=${activePageTemplate.id}`; }}
                >
                  <Plus className="w-3.5 h-3.5" />Add
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs font-medium text-stone-600 shrink-0">Recipe Template</label>
              <select
                className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-xs"
                value={activeRecipeTemplate?.id || ''}
                onChange={(e) => setSelectedRecipeTemplateId(e.target.value || null)}
              >
                {recipeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
                {recipeTemplates.length === 0 && <option value="">No templates</option>}
              </select>
              {activeRecipeTemplate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 shrink-0"
                  onClick={() => { window.location.href = `/settings/templates/new?from=${activeRecipeTemplate.id}`; }}
                >
                  <Plus className="w-3.5 h-3.5" />Add
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <BookRenderer
              chapters={bookChapters}
              pageTemplate={activePageTemplate}
              recipeTemplate={activeRecipeTemplate}
              templateLookup={templateLookup}
            />
          </div>
        </div>
      ) : (
        <>
          {activeBook.chapters.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-stone-300" />
              </div>
              <h3 className="text-lg font-semibold text-stone-700 mb-2">No Chapters Yet</h3>
              <p className="text-sm text-stone-400 max-w-xs mx-auto">
                Edit this book to add chapters and organize your recipes.
              </p>
              <Button
                className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => router.push(`/books/${id}/edit`)}
              >
                <Pencil className="w-4 h-4 mr-2" />Edit Book
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeBook.chapters.map((chapter) => {
                const isExpanded = expandedChapters.has(chapter.id);
                const items = mergeChapterItems(chapter.chapterRecipes, chapter.chapterPages);
                return (
                  <Card key={chapter.id} className="border-stone-200 shadow-sm">
                    <CardHeader
                      className="pb-2 cursor-pointer hover:bg-stone-50 transition-colors"
                      onClick={() => toggleChapter(chapter.id)}
                    >
                      <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-emerald-600" />
                        )}
                        {chapter.title}
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {chapter.chapterRecipes.length} recipe{chapter.chapterRecipes.length !== 1 ? 's' : ''}
                          {chapter.chapterPages.length > 0 && ` · ${chapter.chapterPages.length} page${chapter.chapterPages.length !== 1 ? 's' : ''}`}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="pt-0">
                        <div className="flex items-center gap-3 mb-3 p-2 bg-stone-50 rounded-md border border-stone-100">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <label className="text-[10px] font-medium text-stone-500 shrink-0">Page</label>
                            <select
                              className="flex-1 h-6 rounded border border-input bg-white px-2 text-[10px] min-w-0"
                              value={chapter.pageTemplateId || ''}
                              onChange={(e) => handleChapterTemplateOverride(chapter.id, 'pageTemplateId', e.target.value || null)}
                            >
                              <option value="">Use book default</option>
                              {pageTemplates.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <label className="text-[10px] font-medium text-stone-500 shrink-0">Recipe</label>
                            <select
                              className="flex-1 h-6 rounded border border-input bg-white px-2 text-[10px] min-w-0"
                              value={chapter.recipeTemplateId || ''}
                              onChange={(e) => handleChapterTemplateOverride(chapter.id, 'recipeTemplateId', e.target.value || null)}
                            >
                              <option value="">Use book default</option>
                              {recipeTemplates.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {items.length === 0 ? (
                          <p className="text-xs text-stone-400 py-2">No content in this chapter</p>
                        ) : (
                          <div className="space-y-2">
                            {items.map((item) =>
                              item.type === 'page' ? (
                                <div key={`page-${item.id}`} className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                                  <div className="flex items-center gap-2 mb-2 text-xs text-stone-400">
                                    <FileText className="w-3.5 h-3.5" />
                                    <span className="font-medium">{item.title}</span>
                                  </div>
                                  <MarkdownPage title="" content={item.content} />
                                </div>
                              ) : (
                                <Link key={`recipe-${item.id}`} href={`/recipes?recipeId=${item.recipeId}`}>
                                  <div className="flex items-center gap-2 p-2 rounded-md hover:bg-stone-50 text-sm text-stone-700 transition-colors">
                                    <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">
                                      <BookOpen className="w-3 h-3" />
                                    </span>
                                    <span>{getRecipeName(item.recipeId)}</span>
                                  </div>
                                </Link>
                              )
                            )}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}

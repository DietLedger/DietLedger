'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useBookStore } from '@/lib/book-store';
import { useRecipeStore } from '@/lib/recipe-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  ArrowLeft,
  Pencil,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarkdownPage from '@/components/markdown-page';

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
  const { activeBook, isLoading, selectBook } = useBookStore();
  const { recipes, fetchRecipes } = useRecipeStore();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    selectBook(id);
  }, [id, selectBook]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const toggleChapter = useCallback((chapterId: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  const getRecipeName = useCallback(
    (recipeId: string) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      return recipe?.name || 'Unknown Recipe';
    },
    [recipes]
  );

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
    <div className="min-h-screen flex flex-col bg-stone-50">
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href="/books">
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-stone-500 hover:text-emerald-700">
              <ArrowLeft className="w-3.5 h-3.5" />Books
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeBook.coverColor }} />
            <h1 className="text-xl font-bold text-stone-900">{activeBook.title}</h1>
          </div>
          <div className="ml-auto">
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
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeBook.description && (
          <p className="text-stone-600 mb-6">{activeBook.description}</p>
        )}

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
                              <Link key={`recipe-${item.id}`} href={`/?recipeId=${item.recipeId}`}>
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
      </main>
    </div>
  );
}

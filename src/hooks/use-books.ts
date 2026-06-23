'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  BookRecord,
  ChapterRecord,
  ChapterRecipeRecord,
  ChapterPageRecord,
  BookPageRecord,
  RecipeRecord,
} from '@/lib/types';

interface BookDetail {
  book: BookRecord;
  chapters: (ChapterRecord & {
    chapterRecipes: (ChapterRecipeRecord & { recipe: RecipeRecord | null })[];
    chapterPages: ChapterPageRecord[];
  })[];
  bookPages: BookPageRecord[];
}

export type { BookDetail };

export function useBooks() {
  return useQuery({
    queryKey: queryKeys.books.lists(),
    queryFn: () => getApiClient().getBooks(),
  });
}

export function useBookDetail(id: string) {
  const api = getApiClient();
  return useQuery({
    queryKey: queryKeys.books.detail(id),
    queryFn: async (): Promise<BookDetail> => {
      const book = await api.getBook(id);
      if (!book) throw new Error('Book not found');
      const chapters = await api.getChaptersByBook(id);
      const chaptersWithRecipes = await Promise.all(
        chapters.map(async (ch) => {
          const chapterRecipes = await api.getChapterRecipes(ch.id);
          const chapterPages = await api.getChapterPages(ch.id);
          const chapterRecipesWithRecipe = await Promise.all(
            chapterRecipes.map(async (cr) => ({
              ...cr,
              recipe: await api.getRecipe(cr.recipeId).catch(() => null),
            })),
          );
          return { ...ch, chapterRecipes: chapterRecipesWithRecipe, chapterPages };
        }),
      );
      const bookPages = await api.getBookPages(id);
      return { book, chapters: chaptersWithRecipes, bookPages };
    },
    enabled: !!id,
  });
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, description, coverColor }: { title: string; description?: string; coverColor?: string }) =>
      getApiClient().createBook(title, description, coverColor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.books.all });
    },
  });
}

export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      getApiClient().updateBook(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.all });
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.id) });
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApiClient().deleteBook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.books.all });
    },
  });
}

export function useAddChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, title }: { bookId: string; title: string }) =>
      getApiClient().createChapter(bookId, title),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useUpdateChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, bookId }: { id: string; data: any; bookId: string }) =>
      getApiClient().updateChapter(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useDeleteChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bookId }: { id: string; bookId: string }) =>
      getApiClient().deleteChapter(id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useReorderChapters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, chapterIds }: { bookId: string; chapterIds: string[] }) =>
      getApiClient().reorderChapters(bookId, chapterIds),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useAddRecipeToChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, recipeId, bookId }: { chapterId: string; recipeId: string; bookId: string }) =>
      getApiClient().addRecipeToChapter(chapterId, recipeId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useRemoveRecipeFromChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, recipeId, bookId }: { chapterId: string; recipeId: string; bookId: string }) =>
      getApiClient().removeRecipeFromChapter(chapterId, recipeId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useCreateChapterPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, title, content, bookId }: { chapterId: string; title: string; content: string; bookId: string }) =>
      getApiClient().createChapterPage(chapterId, title, content),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useUpdateChapterPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, bookId }: { id: string; data: any; bookId: string }) =>
      getApiClient().updateChapterPage(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useDeleteChapterPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bookId }: { id: string; bookId: string }) =>
      getApiClient().deleteChapterPage(id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useCreateBookPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, title, content }: { bookId: string; title: string; content: string }) =>
      getApiClient().createBookPage(bookId, title, content),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useUpdateBookPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, bookId }: { id: string; data: any; bookId: string }) =>
      getApiClient().updateBookPage(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useDeleteBookPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bookId }: { id: string; bookId: string }) =>
      getApiClient().deleteBookPage(id),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useReorderBookLevelItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, items }: { bookId: string; items: Array<{ id: string; type: 'chapter' | 'book-page' }> }) =>
      getApiClient().reorderBookLevelItems(bookId, items),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useReorderChapterItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, items, bookId }: { chapterId: string; items: Array<{ type: 'recipe'; recipeId: string } | { type: 'page'; pageId: string }>; bookId: string }) =>
      getApiClient().reorderChapterItems(chapterId, items),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useMoveRecipeToChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterRecipeId, targetChapterId, position, bookId }: { chapterRecipeId: string; targetChapterId: string; position: number; bookId: string }) =>
      getApiClient().moveRecipeBetweenChapters(chapterRecipeId, targetChapterId, position),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useMovePageToBookLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, bookId, position }: { pageId: string; bookId: string; position: number }) =>
      getApiClient().convertChapterPageToBookPage(pageId, bookId, position),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useMovePageToChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, chapterId, position, bookId }: { pageId: string; chapterId: string; position: number; bookId: string }) =>
      getApiClient().convertBookPageToChapterPage(pageId, chapterId, position),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

export function useMovePageBetweenChapters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, targetChapterId, position, bookId }: { pageId: string; targetChapterId: string; position: number; bookId: string }) =>
      getApiClient().movePageBetweenChapters(pageId, targetChapterId, position),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.books.detail(variables.bookId) });
    },
  });
}

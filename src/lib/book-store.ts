import { create } from 'zustand';
import { getApiClient } from '@/lib/api-client';
import type {
  BookRecord,
  ChapterRecord,
  ChapterRecipeRecord,
  ChapterPageRecord,
  BookPageRecord,
  CategoryRecord,
  RecipeCategoryRecord,
} from '@/lib/api-client';
import type { RecipeRecord } from '@/lib/api-client';

interface BookWithChapters extends BookRecord {
  chapters: (ChapterRecord & {
    chapterRecipes: ChapterRecipeRecord[];
    chapterPages: ChapterPageRecord[];
  })[];
  bookPages: BookPageRecord[];
}

interface CategoryNode extends CategoryRecord {
  children: CategoryNode[];
}

function buildCategoryTree(categories: CategoryRecord[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

interface BookState {
  books: BookRecord[];
  activeBook: BookWithChapters | null;
  categories: CategoryRecord[];
  categoryTree: CategoryNode[];
  recipeCategories: Map<string, RecipeCategoryRecord[]>;
  isLoading: boolean;
  error: string | null;

  fetchBooks: () => Promise<void>;
  selectBook: (id: string) => Promise<void>;
  createBook: (title: string, description?: string, coverColor?: string) => Promise<BookRecord>;
  updateBook: (id: string, data: { title?: string; description?: string; coverColor?: string }) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;

  addChapter: (bookId: string, title: string) => Promise<ChapterRecord>;
  updateChapter: (id: string, data: { title?: string; position?: number; pageTemplateId?: string | null; recipeTemplateId?: string | null }) => Promise<void>;
  deleteChapter: (id: string) => Promise<void>;
  reorderChapters: (bookId: string, chapterIds: string[]) => Promise<void>;

  addRecipeToChapter: (chapterId: string, recipeId: string) => Promise<void>;
  removeRecipeFromChapter: (chapterId: string, recipeId: string) => Promise<void>;
  reorderChapterRecipes: (chapterId: string, recipeIds: string[]) => Promise<void>;

  createChapterPage: (chapterId: string, title: string, content: string) => Promise<ChapterPageRecord>;
  updateChapterPage: (id: string, data: { title?: string; content?: string }) => Promise<void>;
  deleteChapterPage: (id: string) => Promise<void>;

  createBookPage: (bookId: string, title: string, content: string) => Promise<BookPageRecord>;
  updateBookPage: (id: string, data: { title?: string; content?: string }) => Promise<void>;
  deleteBookPage: (id: string) => Promise<void>;

  reorderBookLevelItems: (bookId: string, items: Array<{ id: string; type: 'chapter' | 'book-page' }>) => Promise<void>;
  reorderChapterItems: (chapterId: string, items: Array<{ type: 'recipe'; recipeId: string } | { type: 'page'; pageId: string }>) => Promise<void>;

  moveRecipeToChapter: (chapterRecipeId: string, toChapterId: string, position: number) => Promise<void>;
  movePageToBookLevel: (chapterPageId: string, bookId: string, position: number) => Promise<void>;
  movePageToChapter: (bookPageId: string, chapterId: string, position: number) => Promise<void>;

  fetchCategories: () => Promise<void>;
  createCategory: (name: string, parentId?: string | null) => Promise<CategoryRecord>;
  updateCategory: (id: string, data: { name?: string; parentId?: string | null }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  fetchRecipeCategories: (recipeId: string) => Promise<void>;
  assignCategory: (recipeId: string, categoryId: string) => Promise<void>;
  unassignCategory: (recipeId: string, categoryId: string) => Promise<void>;
}

export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  activeBook: null,
  categories: [],
  categoryTree: [],
  recipeCategories: new Map(),
  isLoading: false,
  error: null,

  fetchBooks: async () => {
    set({ isLoading: true, error: null });
    try {
      const books = await getApiClient().getBooks();
      set({ books, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  selectBook: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const book = await getApiClient().getBook(id);
      if (!book) throw new Error('Book not found');
      const chapters = await getApiClient().getChaptersByBook(id);
      const chaptersWithRecipes = await Promise.all(
        chapters.map(async (ch) => ({
          ...ch,
          chapterRecipes: await getApiClient().getChapterRecipes(ch.id),
          chapterPages: await getApiClient().getChapterPages(ch.id),
        }))
      );
      const bookPages = await getApiClient().getBookPages(id);
      set({ activeBook: { ...book, chapters: chaptersWithRecipes, bookPages }, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  createBook: async (title: string, description?: string, coverColor?: string) => {
    set({ isLoading: true, error: null });
    try {
      const book = await getApiClient().createBook(title, description, coverColor);
      set((state) => ({
        books: [book, ...state.books],
        isLoading: false,
      }));
      return book;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
      throw err;
    }
  },

  updateBook: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await getApiClient().updateBook(id, data as any);
      set((state) => ({
        books: state.books.map((b) => (b.id === id ? updated : b)),
        activeBook: state.activeBook?.id === id
          ? { ...updated, chapters: state.activeBook.chapters, bookPages: state.activeBook.bookPages }
          : state.activeBook,
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  deleteBook: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await getApiClient().deleteBook(id);
      set((state) => ({
        books: state.books.filter((b) => b.id !== id),
        activeBook: state.activeBook?.id === id ? null : state.activeBook,
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  addChapter: async (bookId, title) => {
    set({ isLoading: true, error: null });
    try {
      const chapter = await getApiClient().createChapter(bookId, title);
      const chapterRecipes = await getApiClient().getChapterRecipes(chapter.id);
      const chapterPages = await getApiClient().getChapterPages(chapter.id);
      set((state) => {
        if (!state.activeBook || state.activeBook.id !== bookId) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: [...state.activeBook.chapters, { ...chapter, chapterRecipes, chapterPages }],
          },
          isLoading: false,
        };
      });
      return chapter;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
      throw err;
    }
  },

  updateChapter: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await getApiClient().updateChapter(id, data as any);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) =>
              ch.id === id ? { ...ch, ...updated, chapterRecipes: ch.chapterRecipes, chapterPages: ch.chapterPages } : ch
            ),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  deleteChapter: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await getApiClient().deleteChapter(id);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.filter((ch) => ch.id !== id),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  reorderChapters: async (bookId, chapterIds) => {
    set({ isLoading: true, error: null });
    try {
      await getApiClient().reorderChapters(bookId, chapterIds);
      set((state) => {
        if (!state.activeBook || state.activeBook.id !== bookId) return { isLoading: false };
        const chapterMap = new Map(state.activeBook.chapters.map((ch) => [ch.id, ch]));
        const reordered = chapterIds
          .map((id, i) => {
            const ch = chapterMap.get(id);
            return ch ? { ...ch, position: i } : ch;
          })
          .filter(Boolean) as BookWithChapters['chapters'];
        return { activeBook: { ...state.activeBook, chapters: reordered }, isLoading: false };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  addRecipeToChapter: async (chapterId, recipeId) => {
    set({ isLoading: true, error: null });
    try {
      const record = await getApiClient().addRecipeToChapter(chapterId, recipeId);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) =>
              ch.id === chapterId
                ? { ...ch, chapterRecipes: [...ch.chapterRecipes, record] }
                : ch
            ),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  removeRecipeFromChapter: async (chapterId, recipeId) => {
    set({ isLoading: true, error: null });
    try {
      await getApiClient().removeRecipeFromChapter(chapterId, recipeId);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) =>
              ch.id === chapterId
                ? { ...ch, chapterRecipes: ch.chapterRecipes.filter((cr) => cr.recipeId !== recipeId) }
                : ch
            ),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  reorderChapterRecipes: async (chapterId, recipeIds) => {
    set({ isLoading: true, error: null });
    try {
      await (getApiClient() as any).reorderChapterRecipes(chapterId, recipeIds);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) => {
              if (ch.id !== chapterId) return ch;
              const crMap = new Map(ch.chapterRecipes.map((cr) => [cr.recipeId, cr]));
              const reordered = recipeIds
                .map((rid, i) => {
                  const cr = crMap.get(rid);
                  return cr ? { ...cr, position: i } : cr;
                })
                .filter(Boolean) as ChapterRecipeRecord[];
              return { ...ch, chapterRecipes: reordered };
            }),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  createChapterPage: async (chapterId, title, content) => {
    set({ isLoading: true, error: null });
    try {
      const page = await getApiClient().createChapterPage(chapterId, title, content);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) =>
              ch.id === chapterId
                ? { ...ch, chapterPages: [...ch.chapterPages, page] }
                : ch
            ),
          },
          isLoading: false,
        };
      });
      return page;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
      throw err;
    }
  },

  updateChapterPage: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await getApiClient().updateChapterPage(id, data as any);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) => ({
              ...ch,
              chapterPages: ch.chapterPages.map((p) => (p.id === id ? updated : p)),
            })),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  deleteChapterPage: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await getApiClient().deleteChapterPage(id);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) => ({
              ...ch,
              chapterPages: ch.chapterPages.filter((p) => p.id !== id),
            })),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  createBookPage: async (bookId, title, content) => {
    set({ isLoading: true, error: null });
    try {
      const page = await getApiClient().createBookPage(bookId, title, content);
      set((state) => {
        if (!state.activeBook || state.activeBook.id !== bookId) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            bookPages: [...state.activeBook.bookPages, page],
          },
          isLoading: false,
        };
      });
      return page;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
      throw err;
    }
  },

  updateBookPage: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await getApiClient().updateBookPage(id, data as any);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            bookPages: state.activeBook.bookPages.map((p) => (p.id === id ? updated : p)),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  deleteBookPage: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await getApiClient().deleteBookPage(id);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            bookPages: state.activeBook.bookPages.filter((p) => p.id !== id),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  reorderBookLevelItems: async (bookId, items) => {
    set({ isLoading: true, error: null });
    try {
      await (getApiClient() as any).reorderBookLevelItems(bookId, items);
      set((state) => {
        if (!state.activeBook || state.activeBook.id !== bookId) return { isLoading: false };
        const chapterMap = new Map(state.activeBook.chapters.map((ch) => [ch.id, ch]));
        const pageMap = new Map(state.activeBook.bookPages.map((p) => [p.id, p]));
        const reorderedChapters: BookWithChapters['chapters'] = [];
        const reorderedPages: BookPageRecord[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type === 'chapter') {
            const ch = chapterMap.get(item.id);
            if (ch) reorderedChapters.push({ ...ch, position: i });
          } else {
            const p = pageMap.get(item.id);
            if (p) reorderedPages.push({ ...p, position: i });
          }
        }
        return {
          activeBook: { ...state.activeBook, chapters: reorderedChapters, bookPages: reorderedPages },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  reorderChapterItems: async (chapterId, items) => {
    set({ isLoading: true, error: null });
    try {
      await (getApiClient() as any).reorderChapterItems(chapterId, items);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) => {
              if (ch.id !== chapterId) return ch;
              const crMap = new Map(ch.chapterRecipes.map((cr) => [cr.recipeId, cr]));
              const cpMap = new Map(ch.chapterPages.map((p) => [p.id, p]));
              const reorderedRecipes: ChapterRecipeRecord[] = [];
              const reorderedPages: ChapterPageRecord[] = [];
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type === 'recipe') {
                  const cr = crMap.get(item.recipeId);
                  if (cr) reorderedRecipes.push({ ...cr, position: i });
                } else {
                  const cp = cpMap.get(item.pageId);
                  if (cp) reorderedPages.push({ ...cp, position: i });
                }
              }
              return { ...ch, chapterRecipes: reorderedRecipes, chapterPages: reorderedPages };
            }),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  moveRecipeToChapter: async (chapterRecipeId, toChapterId, position) => {
    set({ isLoading: true, error: null });
    try {
      const newRecord = await (getApiClient() as any).moveRecipeBetweenChapters(chapterRecipeId, toChapterId, position);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) => {
              const filtered = ch.chapterRecipes.filter((cr) => cr.id !== chapterRecipeId);
              if (ch.id === toChapterId) {
                return { ...ch, chapterRecipes: [...filtered, newRecord] };
              }
              return { ...ch, chapterRecipes: filtered };
            }),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  movePageToBookLevel: async (chapterPageId, bookId, position) => {
    set({ isLoading: true, error: null });
    try {
      const bookPage = await (getApiClient() as any).convertChapterPageToBookPage(chapterPageId, bookId, position);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) => ({
              ...ch,
              chapterPages: ch.chapterPages.filter((p) => p.id !== chapterPageId),
            })),
            bookPages: [...state.activeBook.bookPages, bookPage],
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  movePageToChapter: async (bookPageId, chapterId, position) => {
    set({ isLoading: true, error: null });
    try {
      const chapterPage = await (getApiClient() as any).convertBookPageToChapterPage(bookPageId, chapterId, position);
      set((state) => {
        if (!state.activeBook) return { isLoading: false };
        return {
          activeBook: {
            ...state.activeBook,
            chapters: state.activeBook.chapters.map((ch) =>
              ch.id === chapterId
                ? { ...ch, chapterPages: [...ch.chapterPages, chapterPage] }
                : ch
            ),
            bookPages: state.activeBook.bookPages.filter((p) => p.id !== bookPageId),
          },
          isLoading: false,
        };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  fetchCategories: async () => {
    set({ isLoading: true, error: null });
    try {
      const categories = await getApiClient().getCategories();
      const categoryTree = buildCategoryTree(categories);
      set({ categories, categoryTree, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  createCategory: async (name, parentId) => {
    set({ isLoading: true, error: null });
    try {
      const category = await getApiClient().createCategory(name, parentId);
      set((state) => {
        const categories = [...state.categories, category];
        return { categories, categoryTree: buildCategoryTree(categories), isLoading: false };
      });
      return category;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
      throw err;
    }
  },

  updateCategory: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await getApiClient().updateCategory(id, data as any);
      set((state) => {
        const categories = state.categories.map((c) => (c.id === id ? updated : c));
        return { categories, categoryTree: buildCategoryTree(categories), isLoading: false };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  deleteCategory: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await getApiClient().deleteCategory(id);
      set((state) => {
        const categories = state.categories.filter((c) => c.id !== id);
        return { categories, categoryTree: buildCategoryTree(categories), isLoading: false };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unknown error', isLoading: false });
    }
  },

  fetchRecipeCategories: async (recipeId) => {
    try {
      const records = await getApiClient().getRecipeCategories(recipeId);
      set((state) => {
        const next = new Map(state.recipeCategories);
        next.set(recipeId, records);
        return { recipeCategories: next };
      });
    } catch (err) {
      console.error('Failed to fetch recipe categories:', err);
    }
  },

  assignCategory: async (recipeId, categoryId) => {
    try {
      await getApiClient().addCategoryToRecipe(recipeId, categoryId);
      const records = await getApiClient().getRecipeCategories(recipeId);
      set((state) => {
        const next = new Map(state.recipeCategories);
        next.set(recipeId, records);
        return { recipeCategories: next };
      });
    } catch (err) {
      console.error('Failed to assign category:', err);
    }
  },

  unassignCategory: async (recipeId, categoryId) => {
    try {
      await getApiClient().removeCategoryFromRecipe(recipeId, categoryId);
      const records = await getApiClient().getRecipeCategories(recipeId);
      set((state) => {
        const next = new Map(state.recipeCategories);
        next.set(recipeId, records);
        return { recipeCategories: next };
      });
    } catch (err) {
      console.error('Failed to unassign category:', err);
    }
  },
}));

export type { BookWithChapters, CategoryNode, BookState };

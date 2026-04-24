export interface RecipeBook {
  id: string;
  title: string;
  description: string;
  coverColor: string;
  createdAt: string;
  updatedAt: string;
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  chapterRecipes: ChapterRecipe[];
}

export interface ChapterRecipe {
  id: string;
  chapterId: string;
  recipeId: string;
  position: number;
}

export interface ChapterPage {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookPage {
  id: string;
  bookId: string;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  children: Category[];
}

export interface RecipeCategory {
  id: string;
  recipeId: string;
  categoryId: string;
}

export const BOOK_COLORS = [
  '#059669', '#2563eb', '#7c3aed', '#db2777', '#ea580c',
  '#ca8a04', '#0891b2', '#4f46e5', '#dc2626', '#16a34a',
] as const;

export type BookColor = (typeof BOOK_COLORS)[number];

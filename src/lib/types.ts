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
  pageTemplateId?: string;
  recipeTemplateId?: string;
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

export interface TemplateRecord {
  id: string;
  name: string;
  type: 'recipe' | 'book-page' | 'book-recipe';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  layout: TemplateLayout;
}

export interface TemplateLayout {
  pageSize: 'card' | 'a4' | 'letter' | 'custom';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
  sections: TemplateSection[];
  theme: TemplateTheme;
}

export interface TemplateSection {
  id: string;
  type: 'title' | 'ingredients' | 'instructions' | 'nutrition-label' | 'nutrition-summary' | 'servings-info' | 'image' | 'notes' | 'divider' | 'column-divider' | 'chapter-title' | 'page-content' | 'page-number' | 'custom-text';
  visible: boolean;
  order: number;
  column: 1 | 2;
  style: {
    fontSize?: number;
    fontWeight?: string;
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
    showStepNumbers?: boolean;
    groupAsTabs?: boolean;
  };
}

export interface TemplateTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  borderRadius: number;
}

export type DaySlot = 'morning' | 'midMorning' | 'noon' | 'afternoon' | 'evening';

export interface MealPlanRecord {
  id: string;
  name: string;
  weekStart: string;
  createdAt: string;
  updatedAt: string;
}

export interface DayPlanEntryRecord {
  id: string;
  mealPlanId: string;
  date: string;
  slot: DaySlot;
  recipeId: string;
  position: number;
  groupId: string | null;
  servings: number;
}

export interface MealGroupRecord {
  id: string;
  mealPlanId: string;
  date: string;
  slot: DaySlot;
  name: string;
  position: number;
}

export interface GroceryChecklistRecord {
  id: string;
  weekStart: string;
  checkedItems: string[];
  updatedAt: string;
}

export const BOOK_COLORS = [
  '#059669', '#2563eb', '#7c3aed', '#db2777', '#ea580c',
  '#ca8a04', '#0891b2', '#4f46e5', '#dc2626', '#16a34a',
] as const;

export type BookColor = (typeof BOOK_COLORS)[number];

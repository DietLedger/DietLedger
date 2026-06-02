'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBookStore } from '@/lib/book-store';
import { useRecipeStore } from '@/lib/recipe-store';
import { getApiClient } from '@/lib/api-client';
import type { RecipeRecord } from '@/lib/storage';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  BookOpen,
  X,
  Loader2,
  ChevronRight,
  Salad,
  FileText,
  FilePlus,
  GripVertical,
  Download,
} from 'lucide-react';

interface ChapterRecipeInfo {
  chapterRecipeId: string;
  recipeId: string;
  recipe: RecipeRecord | null;
}

interface BookLevelItem {
  type: 'chapter' | 'book-page';
  id: string;
  position: number;
  sortableId: string;
}

interface ChapterItem {
  type: 'recipe' | 'page';
  position: number;
  sortableId: string;
  chapterRecipeId?: string;
  recipeId?: string;
  pageId?: string;
}

interface SortableData {
  containerId: string;
  itemType: string;
  dbId: string;
  chapterRecipeId?: string;
  recipeId?: string;
  pageId?: string;
}

function SortableBookPageItem({ page, onDeleteConfirm, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `bp-${page.id}`,
    data: { containerId: 'book-level', itemType: 'book-page', dbId: page.id, pageId: page.id } satisfies SortableData,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="group flex items-center gap-2 p-2.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-sm">
        <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 p-0.5 touch-none">
          <GripVertical className="w-4 h-4" />
        </button>
        <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-stone-800 truncate">{page.title}</span>
          {page.content && <p className="text-xs text-stone-400 line-clamp-1">{page.content}</p>}
        </div>
        {onDeleteConfirm === page.id ? (
          <div className="flex items-center gap-1">
            <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => onDelete(page.id)}>Remove</Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onDelete(null)}><X className="w-3 h-3" /></Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-destructive" onClick={() => onDeleteConfirm(page.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function SortableChapterPageItem({ page, onDeleteConfirm, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `cp-${page.id}`,
    data: { containerId: page.chapterId, itemType: 'page', dbId: page.id, pageId: page.id } satisfies SortableData,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="group flex items-center gap-2 p-2.5 rounded-lg hover:bg-stone-50 text-sm">
        <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 p-0.5 touch-none">
          <GripVertical className="w-4 h-4" />
        </button>
        <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-stone-800 truncate">{page.title}</span>
          {page.content && <p className="text-xs text-stone-400 line-clamp-1">{page.content}</p>}
        </div>
        {onDeleteConfirm === page.id ? (
          <div className="flex items-center gap-1">
            <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => onDelete(page.id)}>Remove</Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onDelete(null)}><X className="w-3 h-3" /></Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-destructive" onClick={() => onDeleteConfirm(page.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function SortableRecipeItem({ cr, onDeleteConfirm, onDelete, onClick }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `cr-${cr.chapterRecipeId}`,
    data: { containerId: cr.chapterId, itemType: 'recipe', dbId: cr.chapterRecipeId, chapterRecipeId: cr.chapterRecipeId, recipeId: cr.recipeId } satisfies SortableData,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="group flex items-center gap-2 p-2.5 rounded-lg hover:bg-stone-50 text-sm">
        <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 p-0.5 touch-none">
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onClick(cr.recipeId)}>
          <div className="flex items-center gap-2">
            <Salad className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <span className="font-medium text-stone-800 truncate">{cr.recipe?.name || 'Unknown Recipe'}</span>
          </div>
          {cr.recipe && (
            <div className="text-xs text-stone-400 mt-0.5 ml-5.5">
              {cr.recipe.ingredients?.length || 0} ingredient{(cr.recipe.ingredients?.length || 0) !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        {onDeleteConfirm === cr.chapterRecipeId ? (
          <div className="flex items-center gap-1">
            <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => onDelete(cr.chapterRecipeId, cr.recipeId)}>Remove</Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onDelete(null, null)}><X className="w-3 h-3" /></Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-destructive" onClick={() => onDeleteConfirm(cr.chapterRecipeId)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function SortableChapterCard({ chapter, chapterRecipes, children, onAddPage, onAddRecipe, deleteConfirmId, onDeleteChapter, onDeleteChapterCancel }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `ch-${chapter.id}`,
    data: { containerId: 'book-level', itemType: 'chapter', dbId: chapter.id } satisfies SortableData,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const itemCount = (chapterRecipes?.length || 0) + chapter.chapterPages.length;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 p-0.5 touch-none">
                <GripVertical className="w-4 h-4" />
              </button>
              <FileText className="w-4 h-4 text-brand-600" />
              {chapter.title}
              <Badge variant="secondary" className="text-[10px] h-5">
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onAddPage}>
                <FilePlus className="w-3 h-3" />Page
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onAddRecipe}>
                <Plus className="w-3 h-3" />Recipe
              </Button>
              {deleteConfirmId === chapter.id ? (
                <div className="flex items-center gap-1">
                  <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={() => onDeleteChapter(chapter.id)}>Confirm</Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onDeleteChapterCancel}><X className="w-3 h-3" /></Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-destructive" onClick={() => onDeleteChapter(chapter.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const {
    activeBook,
    isLoading: bookLoading,
    selectBook,
    addChapter,
    deleteChapter,
    removeRecipeFromChapter,
    createChapterPage,
    deleteChapterPage,
    createBookPage,
    deleteBookPage,
    reorderBookLevelItems,
    reorderChapterItems,
    moveRecipeToChapter,
    movePageToBookLevel,
    movePageToChapter,
  } = useBookStore();

  useSetBreadcrumbLabel(`/books/${bookId}`, activeBook?.title);

  const { recipes, fetchRecipes } = useRecipeStore();

  const [chapterRecipes, setChapterRecipes] = useState<Map<string, ChapterRecipeInfo[]>>(new Map());
  const [addChapterOpen, setAddChapterOpen] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [addRecipeChapterId, setAddRecipeChapterId] = useState<string | null>(null);
  const [addRecipeSearch, setAddRecipeSearch] = useState('');
  const [addPageChapterId, setAddPageChapterId] = useState<string | null>(null);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageContent, setNewPageContent] = useState('');
  const [addBookPageOpen, setAddBookPageOpen] = useState(false);
  const [newBookPageTitle, setNewBookPageTitle] = useState('');
  const [newBookPageContent, setNewBookPageContent] = useState('');
  const [deleteChapterConfirmId, setDeleteChapterConfirmId] = useState<string | null>(null);
  const [deleteRecipeConfirm, setDeleteRecipeConfirm] = useState<string | null>(null);
  const [deletePageConfirmId, setDeletePageConfirmId] = useState<string | null>(null);
  const [deleteBookPageConfirmId, setDeleteBookPageConfirmId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (bookId) selectBook(bookId);
  }, [bookId, selectBook]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  useEffect(() => {
    if (!activeBook) return;
    const load = async () => {
      const map = new Map<string, ChapterRecipeInfo[]>();
      for (const ch of activeBook.chapters) {
        const infos: ChapterRecipeInfo[] = [];
        for (const cr of ch.chapterRecipes) {
          const recipe = await getApiClient().getRecipe(cr.recipeId).catch(() => undefined);
          infos.push({ chapterRecipeId: cr.id, recipeId: cr.recipeId, recipe: recipe || null });
        }
        map.set(ch.id, infos);
      }
      setChapterRecipes(map);
    };
    load();
  }, [activeBook]);

  const bookLevelItems = useMemo((): BookLevelItem[] => {
    if (!activeBook) return [];
    return [
      ...activeBook.chapters.map(ch => ({ type: 'chapter' as const, id: ch.id, position: ch.position, sortableId: `ch-${ch.id}` })),
      ...activeBook.bookPages.map(p => ({ type: 'book-page' as const, id: p.id, position: p.position, sortableId: `bp-${p.id}` })),
    ].sort((a, b) => a.position - b.position);
  }, [activeBook]);

  const chapterItemsMap = useMemo(() => {
    if (!activeBook) return new Map<string, ChapterItem[]>();
    const map = new Map<string, ChapterItem[]>();
    for (const ch of activeBook.chapters) {
      const items: ChapterItem[] = [
        ...ch.chapterRecipes.map(cr => ({ type: 'recipe' as const, position: cr.position, sortableId: `cr-${cr.id}`, chapterRecipeId: cr.id, recipeId: cr.recipeId })),
        ...ch.chapterPages.map(p => ({ type: 'page' as const, position: p.position, sortableId: `cp-${p.id}`, pageId: p.id })),
      ].sort((a, b) => a.position - b.position);
      map.set(ch.id, items);
    }
    return map;
  }, [activeBook]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeBook) return;

    const aData = active.data.current as SortableData | undefined;
    const oData = over.data.current as SortableData | undefined;
    if (!aData || !oData) return;

    const aContainer = aData.containerId;
    const oContainer = oData.containerId;

    if (aContainer === oContainer) {
      if (aContainer === 'book-level') {
        const oldIdx = bookLevelItems.findIndex(i => i.sortableId === active.id);
        const newIdx = bookLevelItems.findIndex(i => i.sortableId === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(bookLevelItems, oldIdx, newIdx);
        await reorderBookLevelItems(bookId, reordered.map(i => ({ id: i.id, type: i.type })));
      } else {
        const items = chapterItemsMap.get(aContainer);
        if (!items) return;
        const oldIdx = items.findIndex(i => i.sortableId === active.id);
        const newIdx = items.findIndex(i => i.sortableId === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(items, oldIdx, newIdx);
        await reorderChapterItems(aContainer, reordered.map(i =>
          i.type === 'recipe'
            ? { type: 'recipe' as const, recipeId: i.recipeId! }
            : { type: 'page' as const, pageId: i.pageId! }
        ));
      }
      return;
    }

    if (aData.itemType === 'recipe') {
      let targetChapterId: string;
      let targetPos: number;
      if (oData.itemType === 'chapter') {
        targetChapterId = oData.dbId;
        const targetItems = chapterItemsMap.get(targetChapterId);
        targetPos = targetItems ? targetItems.length : 0;
      } else if (oContainer !== 'book-level') {
        targetChapterId = oContainer;
        const targetItems = chapterItemsMap.get(targetChapterId);
        const overIdx = targetItems ? targetItems.findIndex(i => i.sortableId === over.id) : -1;
        targetPos = overIdx >= 0 ? overIdx : (targetItems ? targetItems.length : 0);
      } else {
        return;
      }
      if (aData.chapterRecipeId) {
        await moveRecipeToChapter(aData.chapterRecipeId, targetChapterId, targetPos);
      }
    } else if (aData.itemType === 'page' && oContainer === 'book-level') {
      const overIdx = bookLevelItems.findIndex(i => i.sortableId === over.id);
      const targetPos = overIdx >= 0 ? overIdx : bookLevelItems.length;
      if (aData.pageId) {
        await movePageToBookLevel(aData.pageId, bookId, targetPos);
      }
    } else if (aData.itemType === 'book-page' && oContainer !== 'book-level') {
      const targetItems = chapterItemsMap.get(oContainer);
      const overIdx = targetItems ? targetItems.findIndex(i => i.sortableId === over.id) : -1;
      const targetPos = overIdx >= 0 ? overIdx : (targetItems ? targetItems.length : 0);
      if (aData.pageId) {
        await movePageToChapter(aData.dbId, oContainer, targetPos);
      }
    } else if (aData.itemType === 'page' && oContainer !== 'book-level' && aContainer !== oContainer) {
      const targetChapter = activeBook.chapters.find(ch => ch.id === oContainer);
      const targetItems = chapterItemsMap.get(oContainer);
      const overIdx = targetItems ? targetItems.findIndex(i => i.sortableId === over.id) : -1;
      const targetPos = overIdx >= 0 ? overIdx : (targetItems ? targetItems.length : 0);
      const bookLevelOverIdx = bookLevelItems.findIndex(i => i.sortableId === over.id);
      const finalPos = bookLevelOverIdx >= 0 ? bookLevelOverIdx : bookLevelItems.length;
      if (aData.pageId) {
        await movePageToBookLevel(aData.pageId, bookId, finalPos);
        const newPages = [...activeBook.bookPages, { id: '__temp__', title: '', content: '', bookId, position: 0, createdAt: '', updatedAt: '' }];
        const bookPage = newPages[newPages.length - 1];
        if (bookPage) {
          await movePageToChapter(bookPage.id, oContainer, targetPos);
        }
      }
    }
  }, [activeBook, bookId, bookLevelItems, chapterItemsMap, reorderBookLevelItems, reorderChapterItems, moveRecipeToChapter, movePageToBookLevel, movePageToChapter]);

  const handleAddChapter = useCallback(async () => {
    if (!newChapterTitle.trim() || !bookId) return;
    await addChapter(bookId, newChapterTitle.trim());
    setNewChapterTitle('');
    setAddChapterOpen(false);
  }, [newChapterTitle, bookId, addChapter]);

  const handleDeleteChapter = useCallback(async (chapterId: string) => {
    await deleteChapter(chapterId);
    setDeleteChapterConfirmId(null);
  }, [deleteChapter]);

  const handleRemoveRecipe = useCallback(async (chapterRecipeId: string, recipeId: string) => {
    const chapter = activeBook?.chapters.find(ch => ch.chapterRecipes.some(cr => cr.id === chapterRecipeId));
    if (!chapter) return;
    await removeRecipeFromChapter(chapter.id, recipeId);
    setDeleteRecipeConfirm(null);
  }, [activeBook, removeRecipeFromChapter]);

  const handleAddRecipeToChapter = useCallback(async (recipeId: string) => {
    if (!addRecipeChapterId) return;
    const { addRecipeToChapter: add } = useBookStore.getState();
    await add(addRecipeChapterId, recipeId);
    setAddRecipeChapterId(null);
    setAddRecipeSearch('');
  }, [addRecipeChapterId]);

  const handleAddChapterPage = useCallback(async () => {
    if (!addPageChapterId || !newPageTitle.trim()) return;
    await createChapterPage(addPageChapterId, newPageTitle.trim(), newPageContent.trim());
    setNewPageTitle('');
    setNewPageContent('');
    setAddPageChapterId(null);
  }, [addPageChapterId, newPageTitle, newPageContent, createChapterPage]);

  const handleAddBookPage = useCallback(async () => {
    if (!bookId || !newBookPageTitle.trim()) return;
    await createBookPage(bookId, newBookPageTitle.trim(), newBookPageContent.trim());
    setNewBookPageTitle('');
    setNewBookPageContent('');
    setAddBookPageOpen(false);
  }, [bookId, newBookPageTitle, newBookPageContent, createBookPage]);

  if (bookLoading && !activeBook) {
    return (
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      </main>
    );
  }

  if (!activeBook) {
    return (
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-semibold text-stone-700 mb-2">Book Not Found</h3>
          <p className="text-sm text-stone-400 max-w-xs mx-auto mb-4">
            This book may have been deleted or doesn&apos;t exist.
          </p>
          <Button variant="outline" onClick={() => router.push('/books')}>Back to Books</Button>
        </div>
      </main>
    );
  }

  const filteredRecipes = addRecipeSearch.trim()
    ? recipes.filter(r =>
        r.name.toLowerCase().includes(addRecipeSearch.toLowerCase()) &&
        !activeBook.chapters.some(ch => ch.chapterRecipes.some(cr => cr.recipeId === r.id))
      )
    : recipes.filter(r =>
        !activeBook.chapters.some(ch => ch.chapterRecipes.some(cr => cr.recipeId === r.id))
      );

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button className="text-stone-400 hover:text-stone-600 transition-colors" onClick={() => router.push('/books')}>
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div className="w-3 h-8 rounded-full" style={{ backgroundColor: activeBook.coverColor }} />
          <div>
            <h2 className="text-lg font-semibold text-stone-800">{activeBook.title}</h2>
            {activeBook.description && <p className="text-sm text-stone-500">{activeBook.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => router.push(`/books/${bookId}/export`)}>
            <Download className="w-4 h-4" />Export
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => router.push(`/books/${bookId}/edit`)}>
            Edit Book
          </Button>
          <Dialog open={addBookPageOpen} onOpenChange={setAddBookPageOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <FilePlus className="w-4 h-4" />Add Page
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader><DialogTitle>Add Book Page</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Page Title</label>
                  <Input placeholder="e.g., Introduction, Dedication..." value={newBookPageTitle} onChange={(e) => setNewBookPageTitle(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Content</label>
                  <Textarea placeholder="Page content..." value={newBookPageContent} onChange={(e) => setNewBookPageContent(e.target.value)} className="min-h-[120px]" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAddBookPageOpen(false)}>Cancel</Button>
                  <Button size="sm" className="bg-brand-600 hover:bg-brand-700" onClick={handleAddBookPage} disabled={!newBookPageTitle.trim()}>Add Page</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={addChapterOpen} onOpenChange={setAddChapterOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand-600 hover:bg-brand-700 gap-2" size="sm">
                <Plus className="w-4 h-4" />Add Chapter
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader><DialogTitle>Add Chapter</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Chapter Title</label>
                  <Input placeholder="e.g., Appetizers, Main Courses..." value={newChapterTitle} onChange={(e) => setNewChapterTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddChapter()} autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAddChapterOpen(false)}>Cancel</Button>
                  <Button size="sm" className="bg-brand-600 hover:bg-brand-700" onClick={handleAddChapter} disabled={!newChapterTitle.trim()}>Add Chapter</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {activeBook.chapters.length === 0 && activeBook.bookPages.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-semibold text-stone-700 mb-2">No Chapters Yet</h3>
          <p className="text-sm text-stone-400 max-w-xs mx-auto">
            Add chapters to organize your recipes into sections, or add standalone pages.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={bookLevelItems.map(i => i.sortableId)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {bookLevelItems.map((item) => {
                if (item.type === 'book-page') {
                  const page = activeBook.bookPages.find(p => p.id === item.id);
                  if (!page) return null;
                  return (
                    <SortableBookPageItem
                      key={item.sortableId}
                      page={page}
                      onDeleteConfirm={deleteBookPageConfirmId}
                      onDelete={(id) => { if (id) { deleteBookPage(id); setDeleteBookPageConfirmId(null); } else { setDeleteBookPageConfirmId(null); } }}
                    />
                  );
                }

                const chapter = activeBook.chapters.find(ch => ch.id === item.id);
                if (!chapter) return null;
                const chRecipes = chapterRecipes.get(chapter.id) || [];
                const chItems = chapterItemsMap.get(chapter.id) || [];

                return (
                  <SortableChapterCard
                    key={item.sortableId}
                    chapter={chapter}
                    chapterRecipes={chRecipes}
                    onAddPage={() => { setAddPageChapterId(chapter.id); setNewPageTitle(''); setNewPageContent(''); }}
                    onAddRecipe={() => { setAddRecipeChapterId(chapter.id); setAddRecipeSearch(''); }}
                    deleteConfirmId={deleteChapterConfirmId}
                    onDeleteChapter={(id) => { if (id === chapter.id) handleDeleteChapter(id); }}
                    onDeleteChapterCancel={() => setDeleteChapterConfirmId(null)}
                  >
                    {chItems.length === 0 ? (
                      <p className="text-xs text-stone-400 text-center py-4">Drag items here or add pages and recipes.</p>
                    ) : (
                      <SortableContext items={chItems.map(i => i.sortableId)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1.5">
                          {chItems.map((ci) => {
                            if (ci.type === 'page') {
                              const page = chapter.chapterPages.find(p => p.id === ci.pageId);
                              if (!page) return null;
                              return (
                                <SortableChapterPageItem
                                  key={ci.sortableId}
                                  page={{ ...page, chapterId: chapter.id }}
                                  onDeleteConfirm={deletePageConfirmId}
                                  onDelete={(id) => { if (id) { deleteChapterPage(id); setDeletePageConfirmId(null); } else { setDeletePageConfirmId(null); } }}
                                />
                              );
                            }
                            const cr = chRecipes.find(r => r.chapterRecipeId === ci.chapterRecipeId);
                            if (!cr) return null;
                            return (
                              <SortableRecipeItem
                                key={ci.sortableId}
                                cr={{ ...cr, chapterId: chapter.id }}
                                onDeleteConfirm={deleteRecipeConfirm}
                                onDelete={(crId, recipeId) => { if (crId) handleRemoveRecipe(crId, recipeId); else setDeleteRecipeConfirm(null); }}
                                onClick={(recipeId) => router.push(`/recipes?recipeId=${recipeId}`)}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    )}
                  </SortableChapterCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={addPageChapterId !== null} onOpenChange={(open) => { if (!open) setAddPageChapterId(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Add Page to Chapter</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1 block">Page Title</label>
              <Input placeholder="e.g., Introduction, Tips..." value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1 block">Content</label>
              <Textarea placeholder="Page content..." value={newPageContent} onChange={(e) => setNewPageContent(e.target.value)} className="min-h-[120px]" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddPageChapterId(null)}>Cancel</Button>
              <Button size="sm" className="bg-brand-600 hover:bg-brand-700" onClick={handleAddChapterPage} disabled={!newPageTitle.trim()}>Add Page</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addRecipeChapterId !== null} onOpenChange={(open) => { if (!open) setAddRecipeChapterId(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-600" />Add Recipe to Chapter
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Search recipes..." value={addRecipeSearch} onChange={(e) => setAddRecipeSearch(e.target.value)} autoFocus />
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {filteredRecipes.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-4">
                    {addRecipeSearch.trim() ? 'No matching recipes found' : 'All recipes are already in this book'}
                  </p>
                ) : (
                  filteredRecipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      className="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-brand-300 hover:bg-stone-50 transition-all"
                      onClick={() => handleAddRecipeToChapter(recipe.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Salad className="w-4 h-4 text-brand-500" />
                        <span className="font-medium text-sm text-stone-900">{recipe.name}</span>
                      </div>
                      <div className="text-xs text-stone-400 mt-1 ml-6">
                        {recipe.ingredients?.length || 0} ingredient{(recipe.ingredients?.length || 0) !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useBookStore } from '@/lib/book-store';
import { useRecipeStore } from '@/lib/recipe-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  X,
  GripVertical,
  Loader2,
  Check,
  BookOpen,
  Pencil,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { BOOK_COLORS } from '@/lib/types';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import type { ChapterRecipeRecord, ChapterPageRecord, BookPageRecord } from '@/lib/storage';
import type { BookWithChapters } from '@/lib/book-store';

type ChapterItem =
  | { type: 'recipe'; id: string; recipeId: string; position: number }
  | { type: 'page'; id: string; title: string; content: string; position: number };

type BookLevelItem =
  | { type: 'chapter'; id: string }
  | { type: 'book-page'; id: string };

function mergeItems(
  recipes: ChapterRecipeRecord[],
  pages: ChapterPageRecord[]
): ChapterItem[] {
  return [
    ...recipes.map((r) => ({ type: 'recipe' as const, id: r.id, recipeId: r.recipeId, position: r.position })),
    ...pages.map((p) => ({ type: 'page' as const, id: p.id, title: p.title, content: p.content, position: p.position })),
  ].sort((a, b) => a.position - b.position);
}

const DND_PREFIX_CHAPTER = 'ch-';
const DND_PREFIX_BOOK_PAGE = 'bp-';
const DND_PREFIX_RECIPE = 'cr-';
const DND_PREFIX_CHAPTER_PAGE = 'cp-';
const DND_PREFIX_CHAPTER_DROP = 'drop-';

function dndChapterId(id: string) { return `${DND_PREFIX_CHAPTER}${id}`; }
function dndBookPageId(id: string) { return `${DND_PREFIX_BOOK_PAGE}${id}`; }
function dndRecipeId(id: string) { return `${DND_PREFIX_RECIPE}${id}`; }
function dndChapterPageId(id: string) { return `${DND_PREFIX_CHAPTER_PAGE}${id}`; }
function dndChapterDropId(chapterId: string) { return `${DND_PREFIX_CHAPTER_DROP}${chapterId}`; }

function parseDndId(dndId: string): { type: string; id: string } {
  if (dndId.startsWith(DND_PREFIX_CHAPTER_DROP)) return { type: 'chapter-drop', id: dndId.slice(DND_PREFIX_CHAPTER_DROP.length) };
  if (dndId.startsWith(DND_PREFIX_CHAPTER)) return { type: 'chapter', id: dndId.slice(DND_PREFIX_CHAPTER.length) };
  if (dndId.startsWith(DND_PREFIX_BOOK_PAGE)) return { type: 'book-page', id: dndId.slice(DND_PREFIX_BOOK_PAGE.length) };
  if (dndId.startsWith(DND_PREFIX_RECIPE)) return { type: 'recipe', id: dndId.slice(DND_PREFIX_RECIPE.length) };
  if (dndId.startsWith(DND_PREFIX_CHAPTER_PAGE)) return { type: 'chapter-page', id: dndId.slice(DND_PREFIX_CHAPTER_PAGE.length) };
  return { type: 'unknown', id: dndId };
}

export default function BookEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const {
    activeBook,
    isLoading,
    selectBook,
    updateBook,
    addChapter,
    updateChapter,
    deleteChapter,
    addRecipeToChapter,
    removeRecipeFromChapter,
    createChapterPage,
    updateChapterPage,
    deleteChapterPage,
    createBookPage,
    updateBookPage,
    deleteBookPage,
    reorderBookLevelItems,
    reorderChapterItems,
    moveRecipeToChapter,
    movePageToBookLevel,
    movePageToChapter,
  } = useBookStore();
  const { recipes, fetchRecipes } = useRecipeStore();

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('');
  const [isEditingMeta, setIsEditingMeta] = useState(false);

  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingChapterValue, setEditingChapterValue] = useState('');

  const [addRecipeDialogChapterId, setAddRecipeDialogChapterId] = useState<string | null>(null);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');

  const [pageDialogChapterId, setPageDialogChapterId] = useState<string | null>(null);
  const [pageDialogEditId, setPageDialogEditId] = useState<string | null>(null);
  const [pageDialogIsBookLevel, setPageDialogIsBookLevel] = useState(false);
  const [pageDialogBookPageEditId, setPageDialogBookPageEditId] = useState<string | null>(null);
  const [pageDialogTitle, setPageDialogTitle] = useState('');
  const [pageDialogContent, setPageDialogContent] = useState('');

  const [activeDndId, setActiveDndId] = useState<string | null>(null);

  useSetBreadcrumbLabel(`/books/${id}`, activeBook?.title);
  useSetBreadcrumbLabel(`/books/${id}/edit`, activeBook ? `Edit: ${activeBook.title}` : undefined);

  useEffect(() => {
    selectBook(id);
    fetchRecipes();
  }, [id, selectBook, fetchRecipes]);

  useEffect(() => {
    if (activeBook && !isEditingMeta) {
      setEditTitle(activeBook.title);
      setEditDescription(activeBook.description);
      setEditColor(activeBook.coverColor);
    }
  }, [activeBook, isEditingMeta]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const bookLevelItems = useMemo<BookLevelItem[]>(() => {
    if (!activeBook) return [];
    const items: BookLevelItem[] = [
      ...activeBook.chapters.map((ch) => ({ type: 'chapter' as const, id: ch.id, position: ch.position })),
      ...activeBook.bookPages.map((p) => ({ type: 'book-page' as const, id: p.id, position: p.position })),
    ].sort((a, b) => a.position - b.position);
    return items.map(({ type, id }) => ({ type, id }));
  }, [activeBook]);

  const bookLevelDndIds = useMemo(() => bookLevelItems.map((item) => item.type === 'chapter' ? dndChapterId(item.id) : dndBookPageId(item.id)), [bookLevelItems]);

  const chapterItemsMap = useMemo(() => {
    if (!activeBook) return new Map<string, ChapterItem[]>();
    const map = new Map<string, ChapterItem[]>();
    for (const ch of activeBook.chapters) {
      map.set(ch.id, mergeItems(ch.chapterRecipes, ch.chapterPages));
    }
    return map;
  }, [activeBook]);

  const getRecipeName = useCallback((recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    return recipe?.name || 'Unknown Recipe';
  }, [recipes]);

  const handleSaveMeta = useCallback(async () => {
    if (!editTitle.trim()) return;
    await updateBook(id, {
      title: editTitle.trim(),
      description: editDescription.trim(),
      coverColor: editColor,
    });
    setIsEditingMeta(false);
  }, [id, editTitle, editDescription, editColor, updateBook]);

  const handleAddChapter = useCallback(async () => {
    if (!newChapterTitle.trim()) return;
    await addChapter(id, newChapterTitle.trim());
    setNewChapterTitle('');
  }, [id, newChapterTitle, addChapter]);

  const handleRenameChapter = useCallback(async (chapterId: string) => {
    if (!editingChapterValue.trim()) {
      setEditingChapterId(null);
      return;
    }
    await updateChapter(chapterId, { title: editingChapterValue.trim() });
    setEditingChapterId(null);
  }, [editingChapterValue, updateChapter]);

  const handleOpenPageDialog = useCallback((
    chapterId: string | null,
    existingPage?: { id: string; title: string; content: string },
    isBookLevel?: boolean,
    bookPageEditId?: string
  ) => {
    if (isBookLevel) {
      setPageDialogChapterId(null);
      setPageDialogIsBookLevel(true);
      if (bookPageEditId) {
        setPageDialogBookPageEditId(bookPageEditId);
        setPageDialogTitle(existingPage?.title || '');
        setPageDialogContent(existingPage?.content || '');
      } else {
        setPageDialogBookPageEditId(null);
        setPageDialogTitle('');
        setPageDialogContent('');
      }
    } else {
      setPageDialogChapterId(chapterId);
      setPageDialogIsBookLevel(false);
      setPageDialogBookPageEditId(null);
      if (existingPage) {
        setPageDialogEditId(existingPage.id);
        setPageDialogTitle(existingPage.title);
        setPageDialogContent(existingPage.content);
      } else {
        setPageDialogEditId(null);
        setPageDialogTitle('');
        setPageDialogContent('');
      }
    }
  }, []);

  const handleSavePage = useCallback(async () => {
    if (!pageDialogTitle.trim()) return;
    if (pageDialogIsBookLevel) {
      if (pageDialogBookPageEditId) {
        await updateBookPage(pageDialogBookPageEditId, {
          title: pageDialogTitle.trim(),
          content: pageDialogContent,
        });
      } else {
        await createBookPage(id, pageDialogTitle.trim(), pageDialogContent);
      }
    } else {
      if (!pageDialogChapterId) return;
      if (pageDialogEditId) {
        await updateChapterPage(pageDialogEditId, {
          title: pageDialogTitle.trim(),
          content: pageDialogContent,
        });
      } else {
        await createChapterPage(pageDialogChapterId, pageDialogTitle.trim(), pageDialogContent);
      }
    }
    setPageDialogChapterId(null);
    setPageDialogEditId(null);
    setPageDialogIsBookLevel(false);
    setPageDialogBookPageEditId(null);
    setPageDialogTitle('');
    setPageDialogContent('');
  }, [id, pageDialogChapterId, pageDialogEditId, pageDialogIsBookLevel, pageDialogBookPageEditId, pageDialogTitle, pageDialogContent, createChapterPage, updateChapterPage, createBookPage, updateBookPage]);

  const findItemContainer = useCallback((dndId: string): { containerType: 'book' | 'chapter'; containerId: string } | null => {
    const parsed = parseDndId(dndId);
    if (parsed.type === 'chapter' || parsed.type === 'book-page') {
      return { containerType: 'book', containerId: 'book' };
    }
    if (parsed.type === 'recipe' || parsed.type === 'chapter-page') {
      if (!activeBook) return null;
      for (const ch of activeBook.chapters) {
        const items = chapterItemsMap.get(ch.id) || [];
        if (parsed.type === 'recipe' && items.some(i => i.type === 'recipe' && i.id === parsed.id)) {
          return { containerType: 'chapter', containerId: ch.id };
        }
        if (parsed.type === 'chapter-page' && items.some(i => i.type === 'page' && i.id === parsed.id)) {
          return { containerType: 'chapter', containerId: ch.id };
        }
      }
    }
    if (parsed.type === 'chapter-drop') {
      return { containerType: 'chapter', containerId: parsed.id };
    }
    return null;
  }, [activeBook, chapterItemsMap]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDndId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findItemContainer(String(active.id));
    const overContainer = findItemContainer(String(over.id));

    if (!activeContainer || !overContainer) return;
    if (activeContainer.containerType === overContainer.containerType && activeContainer.containerId === overContainer.containerId) return;

    const activeParsed = parseDndId(String(active.id));

    if (activeParsed.type === 'recipe' && overContainer.containerType === 'book') return;
    if (activeParsed.type === 'chapter' || activeParsed.type === 'book-page') return;
  }, [findItemContainer]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDndId(null);

    if (!over || !activeBook) return;
    if (active.id === over.id) return;

    const activeDnd = String(active.id);
    const overDnd = String(over.id);
    const activeParsed = parseDndId(activeDnd);
    const overParsed = parseDndId(overDnd);
    const activeContainer = findItemContainer(activeDnd);
    const overContainer = findItemContainer(overDnd);

    if (!activeContainer || !overContainer) return;

    const sameContainer = activeContainer.containerType === overContainer.containerType && activeContainer.containerId === overContainer.containerId;

    if ((activeParsed.type === 'chapter' || activeParsed.type === 'book-page') && sameContainer) {
      const currentItems = bookLevelItems;
      const oldIndex = currentItems.findIndex((i) => (i.type === 'chapter' ? dndChapterId(i.id) : dndBookPageId(i.id)) === activeDnd);
      const newIndex = currentItems.findIndex((i) => (i.type === 'chapter' ? dndChapterId(i.id) : dndBookPageId(i.id)) === overDnd);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = [...currentItems];
      reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, currentItems[oldIndex]);
      await reorderBookLevelItems(id, reordered.map((item, i) => ({ id: item.id, type: item.type })));
      return;
    }

    if ((activeParsed.type === 'recipe' || activeParsed.type === 'chapter-page') && sameContainer) {
      const chapterId = activeContainer.containerId;
      const items = chapterItemsMap.get(chapterId) || [];
      const oldIndex = items.findIndex((i) => (i.type === 'recipe' ? dndRecipeId(i.id) : dndChapterPageId(i.id)) === activeDnd);
      const overIndex = items.findIndex((i) => (i.type === 'recipe' ? dndRecipeId(i.id) : dndChapterPageId(i.id)) === overDnd);
      if (oldIndex === -1 || overIndex === -1) return;
      const reordered = [...items];
      reordered.splice(oldIndex, 1);
      reordered.splice(overIndex, 0, items[oldIndex]);
      await reorderChapterItems(chapterId, reordered.map((item) =>
        item.type === 'recipe' ? { type: 'recipe' as const, recipeId: item.recipeId } : { type: 'page' as const, pageId: item.id }
      ));
      return;
    }

    if ((activeParsed.type === 'recipe' || activeParsed.type === 'chapter-page') && !sameContainer) {
      if (activeParsed.type === 'recipe' && overContainer.containerType === 'book') return;

      if (overContainer.containerType === 'chapter') {
        const targetChapterId = overContainer.containerId;
        const targetItems = chapterItemsMap.get(targetChapterId) || [];

        if (activeParsed.type === 'recipe') {
          await moveRecipeToChapter(activeParsed.id, targetChapterId, targetItems.length);
        } else {
          await movePageToChapter(activeParsed.id, targetChapterId, targetItems.length);
        }
      } else if (overContainer.containerType === 'book' && activeParsed.type === 'chapter-page') {
        await movePageToBookLevel(activeParsed.id, id, bookLevelItems.length);
      }
    }
  }, [activeBook, id, bookLevelItems, chapterItemsMap, findItemContainer, reorderBookLevelItems, reorderChapterItems, moveRecipeToChapter, movePageToBookLevel, movePageToChapter]);

  const availableRecipes = addRecipeDialogChapterId && activeBook
    ? recipes.filter((r) => {
        const chapter = activeBook.chapters.find((ch) => ch.id === addRecipeDialogChapterId);
        if (!chapter) return false;
        return !chapter.chapterRecipes.some((cr) => cr.recipeId === r.id);
      })
    : [];

  const filteredRecipes = recipeSearchQuery
    ? availableRecipes.filter((r) =>
        r.name.toLowerCase().includes(recipeSearchQuery.toLowerCase())
      )
    : availableRecipes;

  const activeDragItem = useMemo(() => {
    if (!activeDndId || !activeBook) return null;
    const parsed = parseDndId(activeDndId);
    if (parsed.type === 'chapter') {
      const ch = activeBook.chapters.find(c => c.id === parsed.id);
      return ch ? { label: ch.title, type: 'chapter' } : null;
    }
    if (parsed.type === 'book-page') {
      const p = activeBook.bookPages.find(p => p.id === parsed.id);
      return p ? { label: p.title, type: 'book-page' } : null;
    }
    if (parsed.type === 'recipe') {
      for (const ch of activeBook.chapters) {
        const cr = ch.chapterRecipes.find(cr => cr.id === parsed.id);
        if (cr) return { label: getRecipeName(cr.recipeId), type: 'recipe' };
      }
    }
    if (parsed.type === 'chapter-page') {
      for (const ch of activeBook.chapters) {
        const cp = ch.chapterPages.find(p => p.id === parsed.id);
        if (cp) return { label: cp.title, type: 'page' };
      }
    }
    return null;
  }, [activeDndId, activeBook, getRecipeName]);

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
    <>
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeBook.coverColor }} />
        <h1 className="text-lg font-bold text-stone-900">Edit: {activeBook.title}</h1>
      </div>
        <Card className="border-stone-200 shadow-sm">
          <CardContent className="pt-4 space-y-3">
            {isEditingMeta ? (
              <>
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Title</label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Description</label>
                  <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-1 block">Cover Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {BOOK_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${
                          editColor === color ? 'border-stone-900 scale-110' : 'border-transparent hover:border-stone-300'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditColor(color)}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={handleSaveMeta}>
                    <Check className="w-3.5 h-3.5" />Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingMeta(false)}>Cancel</Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-stone-900">{activeBook.title}</h3>
                  {activeBook.description && <p className="text-sm text-stone-500">{activeBook.description}</p>}
                </div>
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setIsEditingMeta(true)}>
                  <Pencil className="w-3.5 h-3.5" />Edit Details
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold text-stone-700 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" />Book Structure
            <Badge variant="secondary" className="text-xs">
              {activeBook.chapters.length}C {activeBook.bookPages.length}P
            </Badge>
          </h3>

          <div className="flex gap-2 mb-4">
            <Input
              placeholder="New chapter title..."
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddChapter()}
              className="text-sm h-9"
            />
            <Button
              onClick={handleAddChapter}
              disabled={!newChapterTitle.trim()}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => handleOpenPageDialog(null, undefined, true)}
              size="sm"
              variant="outline"
              className="shrink-0 gap-1 text-xs"
              title="Add page between chapters"
            >
              <FileText className="w-3.5 h-3.5" />Page
            </Button>
          </div>

          {bookLevelItems.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No chapters or pages yet. Add one above.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={bookLevelDndIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {bookLevelItems.map((item) =>
                    item.type === 'chapter' ? (
                      <SortableChapterCard
                        key={dndChapterId(item.id)}
                        dndId={dndChapterId(item.id)}
                        chapterId={item.id}
                        activeBook={activeBook}
                        editingChapterId={editingChapterId}
                        editingChapterValue={editingChapterValue}
                        onStartEditTitle={() => {
                          const ch = activeBook.chapters.find(c => c.id === item.id);
                          if (ch) {
                            setEditingChapterId(ch.id);
                            setEditingChapterValue(ch.title);
                          }
                        }}
                        onFinishEditTitle={() => handleRenameChapter(item.id)}
                        onCancelEditTitle={() => setEditingChapterId(null)}
                        onEditingTitleChange={setEditingChapterValue}
                        onDelete={() => deleteChapter(item.id)}
                        onAddRecipe={() => {
                          setAddRecipeDialogChapterId(item.id);
                          setRecipeSearchQuery('');
                        }}
                        onRemoveRecipe={(recipeId) => removeRecipeFromChapter(item.id, recipeId)}
                        onAddPage={() => handleOpenPageDialog(item.id)}
                        onEditPage={(page) => handleOpenPageDialog(item.id, page)}
                        onDeletePage={(pageId) => deleteChapterPage(pageId)}
                        getRecipeName={getRecipeName}
                        chapterItemsMap={chapterItemsMap}
                      />
                    ) : (
                      <SortableBookPageCard
                        key={dndBookPageId(item.id)}
                        dndId={dndBookPageId(item.id)}
                        pageId={item.id}
                        activeBook={activeBook}
                        onEdit={() => {
                          const p = activeBook.bookPages.find(bp => bp.id === item.id);
                          if (p) handleOpenPageDialog(null, { id: p.id, title: p.title, content: p.content }, true, p.id);
                        }}
                        onDelete={() => deleteBookPage(item.id)}
                      />
                    )
                  )}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeDndId && activeDragItem ? (
                  <div className="bg-white border-2 border-emerald-400 rounded-lg shadow-lg px-3 py-2 text-sm font-medium text-stone-800 opacity-90">
                    {activeDragItem.type === 'chapter' && <BookOpen className="w-3.5 h-3.5 inline mr-2 text-emerald-600" />}
                    {activeDragItem.type === 'book-page' && <FileText className="w-3.5 h-3.5 inline mr-2 text-blue-500" />}
                    {activeDragItem.type === 'recipe' && <BookOpen className="w-3.5 h-3.5 inline mr-2 text-emerald-500" />}
                    {activeDragItem.type === 'page' && <FileText className="w-3.5 h-3.5 inline mr-2 text-blue-500" />}
                    {activeDragItem.label}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </main>

      <Dialog
        open={addRecipeDialogChapterId !== null}
        onOpenChange={(open) => {
          if (!open) setAddRecipeDialogChapterId(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />Add Recipe to Chapter
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="Search recipes..."
              value={recipeSearchQuery}
              onChange={(e) => setRecipeSearchQuery(e.target.value)}
              autoFocus
            />
            <ScrollArea className="max-h-[300px]">
              {filteredRecipes.length === 0 ? (
                <p className="text-sm text-stone-400 text-center py-6">
                  {availableRecipes.length === 0 ? 'All recipes already added' : 'No matching recipes'}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredRecipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      className="w-full text-left p-3 rounded-lg border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-sm"
                      onClick={async () => {
                        if (!addRecipeDialogChapterId) return;
                        await addRecipeToChapter(addRecipeDialogChapterId, recipe.id);
                      }}
                    >
                      <div className="font-medium text-stone-900">{recipe.name}</div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pageDialogChapterId !== null || pageDialogIsBookLevel}
        onOpenChange={(open) => {
          if (!open) {
            setPageDialogChapterId(null);
            setPageDialogEditId(null);
            setPageDialogIsBookLevel(false);
            setPageDialogBookPageEditId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[640px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              {pageDialogBookPageEditId ? 'Edit Book Page' : pageDialogEditId ? 'Edit Page' : pageDialogIsBookLevel ? 'Add Book Page' : 'Add Markdown Page'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1 block">Page Title</label>
              <Input
                placeholder="e.g., Introduction, Tips, Notes..."
                value={pageDialogTitle}
                onChange={(e) => setPageDialogTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1 block">Content (Markdown)</label>
              <Textarea
                placeholder="# My Page Title&#10;&#10;Write your content here using **Markdown** syntax...&#10;&#10;- Bullet points&#10;- *Italic text*&#10;- [Links](https://example.com)"
                value={pageDialogContent}
                onChange={(e) => setPageDialogContent(e.target.value)}
                className="min-h-[300px] text-sm font-mono resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => {
                setPageDialogChapterId(null);
                setPageDialogEditId(null);
                setPageDialogIsBookLevel(false);
                setPageDialogBookPageEditId(null);
              }}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                onClick={handleSavePage}
                disabled={!pageDialogTitle.trim()}
              >
                <Check className="w-3.5 h-3.5" />
                {pageDialogBookPageEditId || pageDialogEditId ? 'Update Page' : 'Add Page'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SortableChapterCardProps {
  dndId: string;
  chapterId: string;
  activeBook: BookWithChapters;
  editingChapterId: string | null;
  editingChapterValue: string;
  onStartEditTitle: () => void;
  onFinishEditTitle: () => void;
  onCancelEditTitle: () => void;
  onEditingTitleChange: (v: string) => void;
  onDelete: () => void;
  onAddRecipe: () => void;
  onRemoveRecipe: (recipeId: string) => void;
  onAddPage: () => void;
  onEditPage: (page: { id: string; title: string; content: string }) => void;
  onDeletePage: (pageId: string) => void;
  getRecipeName: (recipeId: string) => string;
  chapterItemsMap: Map<string, ChapterItem[]>;
}

function SortableChapterCard({
  dndId,
  chapterId,
  activeBook,
  editingChapterId,
  editingChapterValue,
  onStartEditTitle,
  onFinishEditTitle,
  onCancelEditTitle,
  onEditingTitleChange,
  onDelete,
  onAddRecipe,
  onRemoveRecipe,
  onAddPage,
  onEditPage,
  onDeletePage,
  getRecipeName,
  chapterItemsMap,
}: SortableChapterCardProps) {
  const chapter = activeBook.chapters.find((ch) => ch.id === chapterId);
  if (!chapter) return null;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dndId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const items = chapterItemsMap.get(chapterId) || [];
  const itemDndIds = items.map((i) => i.type === 'recipe' ? dndRecipeId(i.id) : dndChapterPageId(i.id));

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-stone-200 shadow-sm">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 p-0.5 touch-none"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            {editingChapterId === chapterId ? (
              <Input
                value={editingChapterValue}
                onChange={(e) => onEditingTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onFinishEditTitle();
                  if (e.key === 'Escape') onCancelEditTitle();
                }}
                onBlur={onFinishEditTitle}
                autoFocus
                className="h-7 text-sm flex-1"
              />
            ) : (
              <span
                className="font-medium text-sm text-stone-800 flex-1 cursor-pointer hover:text-emerald-600"
                onClick={onStartEditTitle}
              >
                {chapter.title}
              </span>
            )}
            <Badge variant="secondary" className="text-xs">
              {chapter.chapterRecipes.length}R {chapter.chapterPages.length}P
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-stone-300 hover:text-emerald-500"
              onClick={onAddPage}
              title="Add markdown page"
            >
              <FileText className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-stone-300 hover:text-emerald-500"
              onClick={onAddRecipe}
              title="Add recipe"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-stone-300 hover:text-destructive"
              onClick={onDelete}
              title="Delete chapter"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          <ChapterItemsDroppable
            chapterId={chapterId}
            items={items}
            itemDndIds={itemDndIds}
            getRecipeName={getRecipeName}
            onRemoveRecipe={onRemoveRecipe}
            onEditPage={onEditPage}
            onDeletePage={onDeletePage}
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface ChapterItemsDroppableProps {
  chapterId: string;
  items: ChapterItem[];
  itemDndIds: string[];
  getRecipeName: (recipeId: string) => string;
  onRemoveRecipe: (recipeId: string) => void;
  onEditPage: (page: { id: string; title: string; content: string }) => void;
  onDeletePage: (pageId: string) => void;
}

function ChapterItemsDroppable({
  chapterId,
  items,
  itemDndIds,
  getRecipeName,
  onRemoveRecipe,
  onEditPage,
  onDeletePage,
}: ChapterItemsDroppableProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: dndChapterDropId(chapterId),
    data: { isContainer: true, containerId: chapterId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`space-y-1 ml-6 min-h-[32px] rounded-md transition-colors ${
        isOver ? 'bg-emerald-50 ring-1 ring-emerald-200' : ''
      }`}
    >
      <SortableContext items={itemDndIds} strategy={verticalListSortingStrategy}>
        {items.map((item) =>
          item.type === 'page' ? (
            <SortableChapterPageItem
              key={dndChapterPageId(item.id)}
              dndId={dndChapterPageId(item.id)}
              item={item}
              chapterId={chapterId}
              onEdit={() => onEditPage({ id: item.id, title: item.title, content: item.content })}
              onDelete={() => onDeletePage(item.id)}
            />
          ) : (
            <SortableRecipeItem
              key={dndRecipeId(item.id)}
              dndId={dndRecipeId(item.id)}
              item={item}
              chapterId={chapterId}
              recipeName={getRecipeName(item.recipeId)}
              onRemove={() => onRemoveRecipe(item.recipeId)}
            />
          )
        )}
      </SortableContext>
      {items.length === 0 && !isOver && (
        <p className="text-xs text-stone-300 text-center py-2">Drag items here or add above</p>
      )}
    </div>
  );
}

interface SortableRecipeItemProps {
  dndId: string;
  item: ChapterItem & { type: 'recipe' };
  chapterId: string;
  recipeName: string;
  onRemove: () => void;
}

function SortableRecipeItem({ dndId, item, chapterId, recipeName, onRemove }: SortableRecipeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: dndId,
    data: { containerId: chapterId, type: 'recipe' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 p-2 rounded-md bg-stone-50 border border-stone-100 text-sm group">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="flex-1 text-stone-700 truncate">{recipeName}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-stone-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onRemove}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

interface SortableChapterPageItemProps {
  dndId: string;
  item: ChapterItem & { type: 'page' };
  chapterId: string;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableChapterPageItem({ dndId, item, chapterId, onEdit, onDelete }: SortableChapterPageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: dndId,
    data: { containerId: chapterId, type: 'chapter-page' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 border border-blue-100 text-sm group">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-blue-300 hover:text-blue-500 touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span className="flex-1 text-blue-800 truncate">{item.title}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-blue-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
        >
          <Pencil className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-blue-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

interface SortableBookPageCardProps {
  dndId: string;
  pageId: string;
  activeBook: BookWithChapters;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableBookPageCard({ dndId, pageId, activeBook, onEdit, onDelete }: SortableBookPageCardProps) {
  const page = activeBook.bookPages.find((p) => p.id === pageId);
  if (!page) return null;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dndId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-blue-200 shadow-sm bg-blue-50/50">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2">
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-blue-300 hover:text-blue-500 p-0.5 touch-none"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-sm text-blue-800 flex-1">{page.title}</span>
            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">Page</Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-blue-300 hover:text-blue-500"
              onClick={onEdit}
              title="Edit page"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-blue-300 hover:text-destructive"
              onClick={onDelete}
              title="Delete page"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

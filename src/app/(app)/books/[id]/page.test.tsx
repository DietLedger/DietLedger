import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import BookDetailPage from './page';

const { push, updateBookPage, updateChapterPage, movePageBetweenChapters, movePageToBookLevel, moveBookPageToChapter, dragEnd, bookDescription } = vi.hoisted(() => ({
  push: vi.fn(), updateBookPage: vi.fn().mockResolvedValue({}), updateChapterPage: vi.fn().mockResolvedValue({}),
  movePageBetweenChapters: vi.fn().mockResolvedValue({}), movePageToBookLevel: vi.fn().mockResolvedValue({}), moveBookPageToChapter: vi.fn().mockResolvedValue({}),
  dragEnd: { current: null as null | ((event: DragEndEvent) => void) }, bookDescription: { current: 'Author: Various' },
}));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return { ...actual, DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
    dragEnd.current = props.onDragEnd ?? null;
    return <actual.DndContext {...props} />;
  } };
});
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'book-1' }), useRouter: () => ({ push }) }));
vi.mock('@/components/breadcrumb-context', () => ({ useSetBreadcrumbLabel: () => {} }));
vi.mock('@/hooks/use-recipes', () => ({ useRecipes: () => ({ data: [{ id: 'recipe-2', name: 'Tomato Soup', ingredients: [] }] }) }));
vi.mock('@/hooks/use-books', () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}) });
  return {
    useBookDetail: () => ({ data: {
      book: { id: 'book-1', title: 'Public Domain Recipes', description: bookDescription.current, coverColor: '#526c54' },
      bookPages: [{ id: 'preface', bookId: 'book-1', title: 'Preface', content: 'Source: PublicDomainRecipes.com\n\nUNLICENSE\nhttps://unlicense.org', position: 0 }],
      chapters: [
        { id: 'breakfast', title: 'Breakfast & brunch', position: 0, chapterRecipes: [{ id: 'r1', recipeId: 'recipe-1', position: 1, recipe: { id: 'recipe-1', name: 'Banana Pancakes', ingredients: [] } }], chapterPages: [{ id: 'intro', chapterId: 'breakfast', title: 'Morning notes', content: 'Prepare breakfast ahead.', position: 0 }] },
        { id: 'supper', title: 'Supper', position: 1, chapterRecipes: [], chapterPages: [] },
      ],
    }, isLoading: false }),
    useUpdateBookPage: () => ({ mutateAsync: updateBookPage }), useUpdateChapterPage: () => ({ mutateAsync: updateChapterPage }),
    useMovePageBetweenChapters: () => ({ mutateAsync: movePageBetweenChapters }), useMovePageToBookLevel: () => ({ mutateAsync: movePageToBookLevel }),
    useMovePageToChapter: () => ({ mutateAsync: moveBookPageToChapter }),
    ...Object.fromEntries(['useAddChapter', 'useDeleteChapter', 'useRemoveRecipeFromChapter', 'useCreateChapterPage', 'useDeleteChapterPage', 'useCreateBookPage', 'useDeleteBookPage', 'useReorderBookLevelItems', 'useReorderChapterItems', 'useMoveRecipeToChapter', 'useAddRecipeToChapter'].map(name => [name, mutation])),
  };
});

describe('book detail', () => {
  beforeEach(() => { vi.clearAllMocks(); bookDescription.current = 'Author: Various'; });
  it('shows only the author beneath the title and orders the readable Preface before Breakfast', () => {
    const { container } = render(<BookDetailPage />);
    expect(screen.getByText('Author: Various')).toBeInTheDocument();
    expect(screen.queryByText(/See the Preface for source attribution/)).not.toBeInTheDocument();
    const preface = screen.getByText('Preface');
    expect(preface.compareDocumentPosition(screen.getByText('Breakfast & brunch')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(preface);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Source: PublicDomainRecipes.com/)).toBeInTheDocument();
    expect(within(dialog).getByText(/UNLICENSE/)).toBeInTheDocument();
    expect(container.textContent).toContain('https://unlicense.org');
  });
  it('keeps the add-recipe list inside the dialog and provides its scrollbar', () => {
    render(<BookDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Breakfast & brunch/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Recipe' })[0]);
    const dialog = screen.getByRole('dialog');
    const list = dialog.querySelector('[data-slot="scroll-area"]');
    expect(list).toHaveClass('h-[min(300px,50vh)]');
    expect(list?.querySelector('[data-slot="scroll-area-viewport"]')).toBeInTheDocument();
    expect(within(dialog).getByText('Tomato Soup')).toBeInTheDocument();
  });
  it('does not hide other books’ descriptions when they mention an author', () => {
    bookDescription.current = 'Author: Ada. Organized and compiled by Grace. Collection of family recipes.';
    render(<BookDetailPage />);
    expect(screen.getByText(bookDescription.current)).toBeInTheDocument();
  });
  it('starts chapters collapsed and toggles each chapter without disabling its actions', () => {
    render(<BookDetailPage />);
    const toggle = screen.getByRole('button', { name: /Breakfast & brunch/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Banana Pancakes')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Page' }).length).toBeGreaterThan(0);
    fireEvent.click(toggle);
    expect(screen.queryByText('Banana Pancakes')).not.toBeInTheDocument();
  });
  it('lets a reader update existing book and chapter page content', async () => {
    render(<BookDetailPage />);
    fireEvent.click(screen.getByText('Preface'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Edit Page/i }));
    fireEvent.change(within(dialog).getByLabelText('Content'), { target: { value: 'Revised credit' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Save/i }));
    expect(updateBookPage).toHaveBeenCalledWith({ id: 'preface', bookId: 'book-1', data: { title: 'Preface', content: 'Revised credit' } });
  });
  it('opens and edits chapter pages too', async () => {
    render(<BookDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Breakfast & brunch/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Morning notes' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Prepare breakfast ahead.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit Page' }));
    fireEvent.change(within(dialog).getByLabelText('Content'), { target: { value: 'Revised morning notes' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Page' }));
    expect(updateChapterPage).toHaveBeenCalledWith({ id: 'intro', bookId: 'book-1', data: { title: 'Morning notes', content: 'Revised morning notes' } });
  });
  it('discards a cancelled page draft before editing again', () => {
    render(<BookDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Preface' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit Page' }));
    fireEvent.change(within(dialog).getByLabelText('Content'), { target: { value: 'Unsaved draft' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit Page' }));
    expect(within(dialog).getByLabelText('Content')).toHaveValue('Source: PublicDomainRecipes.com\n\nUNLICENSE\nhttps://unlicense.org');
  });
  it('drops a chapter page on a collapsed chapter header without converting it to a book page', async () => {
    render(<BookDetailPage />);
    dragEnd.current!({ active: { id: 'cp-intro', data: { current: { containerId: 'breakfast', itemType: 'page', dbId: 'intro', pageId: 'intro' } } }, over: { id: 'ch-supper', data: { current: { containerId: 'book-level', itemType: 'chapter', dbId: 'supper' } } } } as unknown as DragEndEvent);
    expect(movePageBetweenChapters).toHaveBeenCalledWith({ pageId: 'intro', targetChapterId: 'supper', position: 0, bookId: 'book-1' });
    expect(movePageToBookLevel).not.toHaveBeenCalled();
  });
  it('drops a book page on a collapsed chapter header into that chapter', async () => {
    render(<BookDetailPage />);
    dragEnd.current!({ active: { id: 'bp-preface', data: { current: { containerId: 'book-level', itemType: 'book-page', dbId: 'preface', pageId: 'preface' } } }, over: { id: 'ch-supper', data: { current: { containerId: 'book-level', itemType: 'chapter', dbId: 'supper' } } } } as unknown as DragEndEvent);
    expect(moveBookPageToChapter).toHaveBeenCalledWith({ pageId: 'preface', chapterId: 'supper', position: 0, bookId: 'book-1' });
  });
  it('opens a book page from its tile background or preview, but not its removal controls', () => {
    render(<BookDetailPage />);
    const tile = screen.getByRole('button', { name: 'Open Preface' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Preface' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel removing Preface' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(within(tile).getByRole('button', { name: 'Reorder Preface' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Preface' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(tile);
    expect(screen.getByRole('dialog')).toHaveTextContent('UNLICENSE');
  });
  it('opens book pages with keyboard without treating the drag handle as an open action', () => {
    render(<BookDetailPage />);
    const tile = screen.getByRole('button', { name: 'Open Preface' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Preface' }), { key: 'Enter' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(tile, { key: ' ' });
    expect(screen.getByRole('dialog')).toHaveTextContent('UNLICENSE');
  });
  it('opens a chapter page from its tile and leaves trash/drag controls separate', () => {
    render(<BookDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Breakfast & brunch/ }));
    const tile = screen.getByRole('button', { name: 'Open Morning notes' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Morning notes' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel removing Morning notes' }));
    fireEvent.click(tile);
    expect(screen.getByRole('dialog')).toHaveTextContent('Prepare breakfast ahead.');
  });
  it('opens a chapter recipe from its whole tile and keyboard, not trash or drag', () => {
    render(<BookDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: /Breakfast & brunch/ }));
    const tile = screen.getByRole('button', { name: 'Open Banana Pancakes' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Banana Pancakes' }));
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel removing Banana Pancakes' }));
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Banana Pancakes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(tile, { key: 'Enter' });
    fireEvent.keyDown(tile, { key: ' ' });
    expect(push).toHaveBeenCalledWith('/recipes?recipeId=recipe-1');
    push.mockClear();
    fireEvent.click(tile);
    expect(push).toHaveBeenCalledWith('/recipes?recipeId=recipe-1');
  });
  it('routes Edit Book to the book metadata editor', () => {
    render(<BookDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Book' }));
    expect(push).toHaveBeenCalledWith('/books/book-1/edit');
  });
});

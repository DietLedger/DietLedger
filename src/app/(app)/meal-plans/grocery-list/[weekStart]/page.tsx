'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useBookStore } from '@/lib/book-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  BookOpen,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BOOK_COLORS } from '@/lib/types';

export default function BooksPage() {
  const { books, isLoading, fetchBooks, createBook, deleteBook } = useBookStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(BOOK_COLORS[0]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    await createBook(newTitle.trim(), newDescription.trim(), selectedColor);
    setNewTitle('');
    setNewDescription('');
    setSelectedColor(BOOK_COLORS[0]);
    setCreateOpen(false);
  }, [newTitle, newDescription, selectedColor, createBook]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteBook(id);
    setDeleteConfirmId(null);
  }, [deleteBook]);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">My Books</h2>
          <p className="text-sm text-stone-500">{books.length} book{books.length !== 1 ? 's' : ''}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-brand-600 hover:bg-brand-700 gap-2">
              <Plus className="w-4 h-4" />Create Book
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Create Recipe Book</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1 block">Title</label>
                <Input
                  placeholder="e.g., Holiday Favorites, Weeknight Dinners..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1 block">Description (optional)</label>
                <Input
                  placeholder="A short description..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1 block">Cover Color</label>
                <div className="flex gap-2 flex-wrap">
                  {BOOK_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        selectedColor === color ? 'border-stone-900 scale-110' : 'border-transparent hover:border-stone-300'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedColor(color)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button size="sm" className="bg-brand-600 hover:bg-brand-700" onClick={handleCreate} disabled={!newTitle.trim()}>
                  Create Book
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && books.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-semibold text-stone-700 mb-2">No Books Yet</h3>
          <p className="text-sm text-stone-400 max-w-xs mx-auto">
            Create a recipe book to organize your recipes into chapters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((book) => (
            <Card
              key={book.id}
              className="border-stone-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden"
              onClick={() => router.push(`/books/${book.id}`)}
            >
              <div className="h-2" style={{ backgroundColor: book.coverColor }} />
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-stone-900 truncate">{book.title}</h3>
                    {book.description && (
                      <p className="text-sm text-stone-500 mt-1 line-clamp-2">{book.description}</p>
                    )}
                  </div>
                  {deleteConfirmId === book.id ? (
                    <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                      <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => handleDelete(book.id)}>
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setDeleteConfirmId(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(book.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="secondary" className="text-xs">
                    {new Date(book.updatedAt).toLocaleDateString()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBookDetail, useUpdateBook } from '@/hooks/use-books';
import { BOOK_COLORS } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function EditBookPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError } = useBookDetail(id);
  const updateBook = useUpdateBook();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverColor, setCoverColor] = useState<string>(BOOK_COLORS[0]);
  const [error, setError] = useState('');
  const initializedBookId = useRef<string | null>(null);

  useEffect(() => {
    if (!data?.book || initializedBookId.current === data.book.id) return;
    initializedBookId.current = data.book.id;
    setTitle(data.book.title);
    setDescription(data.book.description || '');
    setCoverColor(data.book.coverColor);
  }, [data?.book]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setError('');
    try {
      await updateBook.mutateAsync({ id, data: { title: title.trim(), description: description.trim(), coverColor } });
      router.push(`/books/${id}`);
    } catch {
      setError('Could not save the book. Please try again.');
    }
  }

  if (isLoading) return <main className="max-w-2xl mx-auto p-6">Loading book...</main>;
  if (isError || !data?.book) return <main className="max-w-2xl mx-auto p-6">Book not found.</main>;

  return (
    <main className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-xl font-semibold mb-6">Edit Book</h1>
      <form onSubmit={handleSave} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="book-title">Title</Label>
          <Input id="book-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-description">Description</Label>
          <Textarea id="book-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          <p className="text-xs text-stone-500">For an author subtitle, use “Author: Name”. Attribution and license text belong in a book page.</p>
        </div>
        <fieldset>
          <legend className="text-sm font-medium mb-2">Cover color</legend>
          <div className="flex gap-2 flex-wrap">
            {Array.from(new Set([coverColor, ...BOOK_COLORS])).map(color => (
              <label key={color} className="cursor-pointer">
                <input type="radio" name="coverColor" value={color} checked={coverColor === color} onChange={() => setCoverColor(color)} className="sr-only peer" />
                <span className="block w-8 h-8 rounded-full border-2 border-stone-300 peer-checked:ring-2 peer-checked:ring-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600" style={{ backgroundColor: color }} aria-label={color} />
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={updateBook.isPending || !title.trim()}>Save Book</Button>
          <Button type="button" variant="outline" onClick={() => router.push(`/books/${id}`)}>Cancel</Button>
        </div>
      </form>
    </main>
  );
}

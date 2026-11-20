'use client';

import { useParams, useRouter } from 'next/navigation';
import { useBookDetail } from '@/hooks/use-books';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import dynamic from 'next/dynamic';
import { ChevronRight } from 'lucide-react';

const CookbookExport = dynamic(
  () => import('@/components/print/cookbook-export').then(m => ({ default: m.CookbookExport })),
  { ssr: false, loading: () => <p className="text-sm text-stone-400 py-8 text-center">Loading export tool...</p> },
);

export default function ExportPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;
  const { data: bookDetail, isLoading } = useBookDetail(bookId);
  const book = bookDetail?.book;

  useSetBreadcrumbLabel(`/books/${bookId}`, book?.title);
  useSetBreadcrumbLabel(`/books/${bookId}/export`, 'Export');

  return (
    <main className="flex-1 max-w-lg w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button aria-label="Back to cookbook" className="text-stone-400 hover:text-stone-600 transition-colors" onClick={() => router.push(`/books/${bookId}`)}>
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
        <h2 className="text-lg font-semibold text-stone-800">Export Cookbook</h2>
      </div>
      {book ? (
        <CookbookExport key={bookId} book={{ id: bookId, title: book.title }} />
      ) : isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">Loading cookbook...</p>
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">Could not load this cookbook.</p>
      )}
    </main>
  );
}

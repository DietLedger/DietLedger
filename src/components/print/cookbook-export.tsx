'use client';

import { useState, useCallback, useEffect } from 'react';
import { getApiClient } from '@/lib/api-client';
import { exportCookbook } from '@/lib/pdf-export';
import type { CookbookExportOptions, BrandKit } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface BookOption {
  id: string;
  title: string;
}

export function CookbookExport() {
  const [books, setBooks] = useState<BookOption[]>([]);
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedBrandKitId, setSelectedBrandKitId] = useState('');
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('letter');
  const [includeCover, setIncludeCover] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [includeIndex, setIncludeIndex] = useState(false);
  const [includePageNumbers, setIncludePageNumbers] = useState(true);
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    const [allBooks, allKits] = await Promise.all([getApiClient().getBooks(), getApiClient().getBrandKits()]);
    setBooks(allBooks.map(b => ({ id: b.id, title: b.title })));
    setBrandKits(allKits);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExport = async () => {
    if (!selectedBookId) {
      toast.error('Select a book to export');
      return;
    }

    setExporting(true);
    setProgress(0);

    try {
      const options: CookbookExportOptions = {
        bookId: selectedBookId,
        brandKitId: selectedBrandKitId || undefined,
        pageSize,
        includeCover,
        includeToc,
        includeIndex,
        includePageNumbers,
        onProgress: setProgress,
      };

      const blob = await exportCookbook(options);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const book = books.find(b => b.id === selectedBookId);
      a.href = url;
      a.download = `${book?.title ?? 'cookbook'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Cookbook exported successfully');
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">Book</Label>
        <Select value={selectedBookId} onValueChange={setSelectedBookId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select a book..." />
          </SelectTrigger>
          <SelectContent>
            {books.map(b => (
              <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {books.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">No books found. Create a book first.</p>
        )}
      </div>

      <div>
        <Label className="text-sm">Brand Kit (optional)</Label>
        <Select value={selectedBrandKitId} onValueChange={setSelectedBrandKitId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {brandKits.map(k => (
              <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm">Page Size</Label>
        <Select value={pageSize} onValueChange={(v) => setPageSize(v as 'a4' | 'letter')}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="letter">US Letter (8.5 x 11)</SelectItem>
            <SelectItem value="a4">A4 (210 x 297mm)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Cover Page</Label>
            <Switch checked={includeCover} onCheckedChange={setIncludeCover} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Table of Contents</Label>
            <Switch checked={includeToc} onCheckedChange={setIncludeToc} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Alphabetical Index</Label>
            <Switch checked={includeIndex} onCheckedChange={setIncludeIndex} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Page Numbers</Label>
            <Switch checked={includePageNumbers} onCheckedChange={setIncludePageNumbers} />
          </div>
        </CardContent>
      </Card>

      {exporting && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Generating PDF...</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleExport}
        disabled={exporting || !selectedBookId}
      >
        {exporting ? (
          <FileText className="h-4 w-4 mr-2 animate-pulse" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {exporting ? 'Exporting...' : 'Export Cookbook PDF'}
      </Button>
    </div>
  );
}

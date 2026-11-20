'use client';

import { useState, useEffect } from 'react';
import { getApiClient } from '@/lib/api-client';
import { downloadRecipeBundle, safeBundleFilename } from '@/lib/recipe-bundles';
import type { CookbookExportOptions, BrandKit } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Download, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BookOption {
  id: string;
  title: string;
}

export function CookbookExport({ book }: { book?: BookOption }) {
  const [format, setFormat] = useState<'pdf' | 'bundle'>('pdf');
  const [books, setBooks] = useState<BookOption[]>([]);
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedBrandKitId, setSelectedBrandKitId] = useState('');
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('letter');
  const [measurementSystem, setMeasurementSystem] = useState<CookbookExportOptions['measurementSystem'] | ''>('');
  const [includeCover, setIncludeCover] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [includeIndex, setIncludeIndex] = useState(false);
  const [includePageNumbers, setIncludePageNumbers] = useState(true);
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);

  const isBookPage = !!book;
  const isBundle = isBookPage && format === 'bundle';
  const activeBook = book ?? books.find(b => b.id === selectedBookId);

  useEffect(() => {
    if (!isBookPage) {
      getApiClient().getBooks().then(setBooks).catch(() => toast({ title: 'Could not load cookbooks', variant: 'destructive' }));
    }
  }, [isBookPage]);

  useEffect(() => {
    getApiClient().getBrandKits().then(setBrandKits).catch(() => toast({ title: 'Could not load brand kits', variant: 'destructive' }));
  }, []);

  const handleExport = async () => {
    if (!activeBook || exporting) return;

    setExporting(true);
    setProgress(0);

    try {
      if (isBundle) {
        const bundle = await getApiClient().exportRecipeBundle({ bookIds: [activeBook.id] });
        downloadRecipeBundle(bundle, safeBundleFilename(activeBook.title, 'cookbook'));
      } else {
        if (!measurementSystem) return;
        const { exportCookbook } = await import('@/lib/pdf-export');
        const blob = await exportCookbook({
          bookId: activeBook.id,
          measurementSystem,
          brandKitId: selectedBrandKitId || undefined,
          pageSize,
          includeCover,
          includeToc,
          includeIndex,
          includePageNumbers,
          onProgress: setProgress,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeBook.title}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast({ title: 'Cookbook download started' });
    } catch (e) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      {book ? (
        <div>
          <p className="mb-4 text-sm font-medium">{book.title}</p>
          <Label htmlFor="cookbook-export-format" className="text-sm">Export format</Label>
          <Select value={format} onValueChange={(value) => setFormat(value === 'bundle' ? 'bundle' : 'pdf')} disabled={exporting}>
            <SelectTrigger id="cookbook-export-format" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="bundle">DietLedger bundle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div>
          <Label htmlFor="cookbook-export-book" className="text-sm">Book</Label>
          <Select value={selectedBookId} onValueChange={setSelectedBookId}>
            <SelectTrigger id="cookbook-export-book" className="mt-1">
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
      )}

      {isBundle ? (
        <p className="text-sm text-muted-foreground">Download an importable copy of this cookbook for DietLedger.</p>
      ) : (
        <div className="space-y-4">
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
            <p className="mt-1 text-xs text-muted-foreground">PDF logos must be uploaded PNG, JPEG, GIF or WebP images. SVG and external image URLs are not loaded for safety and privacy; the PDF shows a notice when a logo is omitted.</p>
          </div>

          <div>
            <Label htmlFor="cookbook-measurements" className="text-sm">Measurement units</Label>
            <Select value={measurementSystem} onValueChange={(value) => setMeasurementSystem(value as CookbookExportOptions['measurementSystem'])}>
              <SelectTrigger id="cookbook-measurements" className="mt-1">
                <SelectValue placeholder="Choose measurement units..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="imperial">Imperial</SelectItem>
                <SelectItem value="metric">Metric</SelectItem>
                <SelectItem value="grams">Grams</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Grams uses food-specific weights when available; ingredients without a known weight keep their original units.</p>
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
        </div>
      )}

      {exporting && !isBundle && (
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
        disabled={exporting || !activeBook || (!isBundle && !measurementSystem)}
      >
        {exporting ? (
          <FileText className="h-4 w-4 mr-2 animate-pulse" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {exporting ? 'Exporting...' : isBundle ? 'Export DietLedger bundle' : 'Export Cookbook PDF'}
      </Button>
    </div>
  );
}

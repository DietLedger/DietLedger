'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplatePacks } from '@/components/print/template-packs';
import { BrandKitEditor } from '@/components/print/brand-kit-editor';
import { CookbookExport } from '@/components/print/cookbook-export';
import { Palette, BookOpen, Download } from 'lucide-react';

export function PrintStudio() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Print Studio</h2>
        <p className="text-sm text-muted-foreground">
          Design, brand, and export your recipes and cookbooks.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="w-full">
          <TabsTrigger value="templates" className="flex-1">
            <Palette className="h-3.5 w-3.5 mr-1.5" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="brand" className="flex-1">
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Brand Kit
          </TabsTrigger>
          <TabsTrigger value="export" className="flex-1">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <TemplatePacks />
        </TabsContent>

        <TabsContent value="brand" className="mt-4">
          <BrandKitEditor />
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <CookbookExport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

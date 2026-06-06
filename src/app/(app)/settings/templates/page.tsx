'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTemplates, useDeleteTemplate, useDuplicateTemplate } from '@/hooks/use-templates';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  LayoutTemplate,
} from 'lucide-react';
import type { TemplateRecord } from '@/lib/types';

const TYPE_TABS = [
  { value: 'recipe', label: 'Recipe' },
  { value: 'book-page', label: 'Book Pages' },
  { value: 'book-recipe', label: 'Book Recipes' },
] as const;

function typeBadgeColor(type: TemplateRecord['type']) {
  switch (type) {
    case 'recipe': return 'bg-brand-100 text-brand-700 border-brand-200';
    case 'book-page': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'book-recipe': return 'bg-purple-100 text-purple-700 border-purple-200';
  }
}

export default function TemplatesPage() {
  const router = useRouter();
  const { data: templates = [] } = useTemplates();
  const deleteMutation = useDeleteTemplate();
  const duplicateMutation = useDuplicateTemplate();
  const [activeTab, setActiveTab] = useState<string>('recipe');
  const [deleteTarget, setDeleteTarget] = useState<TemplateRecord | null>(null);

  useSetBreadcrumbLabel('/settings', 'Settings');
  useSetBreadcrumbLabel('/settings/templates', 'Templates');

  const filtered = templates.filter((t) => t.type === activeTab);

  const handleEdit = (id: string) => {
    router.push(`/settings/templates/${id}`);
  };

  const handleDuplicate = async (id: string) => {
    const created = await duplicateMutation.mutateAsync(id);
    router.push(`/settings/templates/${created.id}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-600 text-white">
            <LayoutTemplate className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Templates</h1>
            <p className="text-sm text-stone-500">Manage render templates for recipes and books</p>
          </div>
        </div>
        <Button
          onClick={() => router.push('/settings/templates/new')}
          className="bg-brand-600 hover:bg-brand-700 gap-1"
        >
          <Plus className="w-4 h-4" />Create Template
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          {TYPE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs gap-1">
              <LayoutTemplate className="w-3 h-3" />
              {tab.label}
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                {templates.filter((t) => t.type === tab.value).length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {TYPE_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-stone-400">
                <LayoutTemplate className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No {tab.label.toLowerCase()} templates yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => router.push('/settings/templates/new')}
                >
                  <Plus className="w-3 h-3 mr-1" />Create one
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-stone-900 text-sm">{template.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-[10px] h-5 ${typeBadgeColor(template.type)}`}>
                              {template.type}
                            </Badge>
                            {template.isDefault && (
                              <Badge variant="secondary" className="text-[10px] h-5 bg-amber-50 text-amber-700">
                                Default
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleEdit(template.id)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleDuplicate(template.id)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(template)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-stone-400 mt-2">
                        {template.layout.sections.filter((s) => s.visible).length} sections &middot;{' '}
                        {template.layout.pageSize}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

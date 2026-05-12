'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTemplateStore } from '@/lib/template-store';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, LayoutTemplate } from 'lucide-react';
import type { TemplateRecord } from '@/lib/types';

const TEMPLATE_TYPES: { value: TemplateRecord['type']; label: string; description: string }[] = [
  { value: 'recipe', label: 'Recipe', description: 'Standalone recipe page with ingredients, instructions, and nutrition' },
  { value: 'book-page', label: 'Book Page', description: 'Markdown page content within book chapters' },
  { value: 'book-recipe', label: 'Book Recipe', description: 'Compact recipe card for embedding in book chapters' },
];

function defaultLayoutForType(type: TemplateRecord['type']): TemplateRecord['layout'] {
  const theme = {
    primaryColor: '#059669',
    backgroundColor: '#ffffff',
    textColor: '#1c1917',
    accentColor: '#059669',
    fontFamily: 'inherit',
    borderRadius: 8,
  };

  const section = (
    t: string,
    order: number,
    column: 1 | 2,
    style?: TemplateRecord['layout']['sections'][0]['style'],
  ) => ({
    id: crypto.randomUUID(),
    type: t as TemplateRecord['layout']['sections'][0]['type'],
    visible: true,
    order,
    column,
    style: style || {},
  });

  switch (type) {
    case 'recipe':
      return {
        pageSize: 'card',
        orientation: 'portrait',
        margins: { top: 16, right: 16, bottom: 16, left: 16 },
        sections: [
          section('title', 0, 1, { fontSize: 22, fontWeight: '700', textAlign: 'center' }),
          section('servings-info', 1, 1, { fontSize: 12, textAlign: 'center' }),
          section('ingredients', 2, 1, { fontSize: 13 }),
          section('instructions', 3, 1, { fontSize: 13, showStepNumbers: true }),
        ],
        theme,
      };
    case 'book-page':
      return {
        pageSize: 'a4',
        orientation: 'portrait',
        margins: { top: 40, right: 40, bottom: 40, left: 40 },
        sections: [
          section('chapter-title', 0, 1, { fontSize: 24, fontWeight: '700', textAlign: 'center' }),
          section('page-content', 1, 1, { fontSize: 14 }),
          section('page-number', 2, 1, { fontSize: 10, textAlign: 'center' }),
        ],
        theme: { ...theme, primaryColor: '#1e293b' },
      };
    case 'book-recipe':
      return {
        pageSize: 'card',
        orientation: 'portrait',
        margins: { top: 12, right: 12, bottom: 12, left: 12 },
        sections: [
          section('title', 0, 1, { fontSize: 16, fontWeight: '700' }),
          section('ingredients', 1, 1, { fontSize: 11 }),
          section('instructions', 2, 1, { fontSize: 11, showStepNumbers: true }),
        ],
        theme: { ...theme, borderRadius: 6 },
      };
  }
}

export default function NewTemplatePage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center text-stone-500">Loading...</div>}>
      <NewTemplatePageContent />
    </Suspense>
  );
}

function NewTemplatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromId = searchParams.get('from');
  const { templates, fetchTemplates, createTemplate, duplicateTemplate } = useTemplateStore();

  useSetBreadcrumbLabel('/settings', 'Settings');
  useSetBreadcrumbLabel('/settings/templates', 'Templates');
  useSetBreadcrumbLabel('/settings/templates/new', 'New Template');

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (!fromId || templates.length === 0) return;

    const duplicate = async () => {
      setCreating(true);
      try {
        const created = await duplicateTemplate(fromId);
        router.replace(`/settings/templates/${created.id}`);
      } catch {
        setCreating(false);
      }
    };
    duplicate();
  }, [fromId, templates, duplicateTemplate, router]);

  const handleCreate = async (type: TemplateRecord['type']) => {
    setCreating(true);
    try {
      const created = await createTemplate({
        name: `New ${type === 'recipe' ? 'Recipe' : type === 'book-page' ? 'Book Page' : 'Book Recipe'} Template`,
        type,
        isDefault: false,
        layout: defaultLayoutForType(type),
      });
      router.push(`/settings/templates/${created.id}`);
    } catch {
      setCreating(false);
    }
  };

  if (creating) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center text-stone-500">
        Creating template...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-stone-900 mb-2">Create Template</h1>
      <p className="text-sm text-stone-500 mb-6">Choose a template type to get started</p>

      <div className="grid gap-4">
        {TEMPLATE_TYPES.map((t) => (
          <Card
            key={t.value}
            className="cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all"
            onClick={() => handleCreate(t.value)}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <LayoutTemplate className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-stone-900">{t.label}</h3>
                <p className="text-sm text-stone-500">{t.description}</p>
              </div>
              <Plus className="w-5 h-5 text-stone-400" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

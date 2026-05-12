'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTemplateStore } from '@/lib/template-store';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import type { TemplateRecord } from '@/lib/types';
import TemplateEditorPanel from '@/components/template-editor-panel';
import TemplatePreview from '@/components/template-preview';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save } from 'lucide-react';

export default function TemplateEditorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { templates, fetchTemplates, updateTemplate } = useTemplateStore();
  const [localTemplate, setLocalTemplate] = useState<TemplateRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useSetBreadcrumbLabel('/settings', 'Settings');
  useSetBreadcrumbLabel('/settings/templates', 'Templates');
  useSetBreadcrumbLabel(`/settings/templates/${id}`, localTemplate?.name);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (templates.length > 0 && !localTemplate) {
      const found = templates.find((t) => t.id === id);
      if (found) setLocalTemplate(found);
    }
  }, [templates, id, localTemplate]);

  const handleSave = useCallback(async () => {
    if (!localTemplate) return;
    setSaving(true);
    try {
      await updateTemplate(localTemplate.id, {
        name: localTemplate.name,
        layout: localTemplate.layout,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [localTemplate, updateTemplate]);

  if (!localTemplate) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <p className="text-stone-500">Loading template...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/settings/templates')}>
            <ArrowLeft className="w-4 h-4 mr-1" />Back
          </Button>
          <h1 className="text-xl font-bold text-stone-900">Edit Template</h1>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 gap-1"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border rounded-lg bg-white p-4 overflow-y-auto max-h-[calc(100vh-160px)]">
          <TemplateEditorPanel
            template={localTemplate}
            onChange={setLocalTemplate}
          />
        </div>
        <div className="border rounded-lg bg-stone-50 p-4 flex items-start justify-center overflow-y-auto max-h-[calc(100vh-160px)]">
          <TemplatePreview template={localTemplate} />
        </div>
      </div>
    </div>
  );
}

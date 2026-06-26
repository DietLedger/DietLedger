'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/use-templates';
import { useSetBreadcrumbLabel } from '@/components/breadcrumb-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import TemplateEditorPanel from '@/components/template-editor-panel';
import type { TemplateRecord } from '@/lib/types';

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: template, isLoading } = useTemplate(id);
  const updateMutation = useUpdateTemplate();
  const deleteMutation = useDeleteTemplate();
  const [draft, setDraft] = useState<TemplateRecord | null>(null);

  useSetBreadcrumbLabel('/settings/templates', 'Templates');

  useEffect(() => {
    if (template) setDraft(template);
  }, [template]);

  const handleSave = async () => {
    if (!draft) return;
    await updateMutation.mutateAsync({
      id: draft.id,
      data: { name: draft.name, layout: draft.layout },
    });
    router.push('/settings/templates');
  };

  const handleDelete = async () => {
    if (!draft) return;
    await deleteMutation.mutateAsync(draft.id);
    router.push('/settings/templates');
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center text-stone-500">
        Loading template...
      </div>
    );
  }

  if (!template || !draft) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center">
        <p className="text-stone-500 mb-4">Template not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/settings/templates')}>
          Back to Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/settings/templates')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold text-stone-900">Edit Template</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1" />Delete
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="w-4 h-4 mr-1" />Save
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <Label className="text-sm">Template Name</Label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="mt-1"
          />
        </CardContent>
      </Card>

      <TemplateEditorPanel template={draft} onChange={setDraft} />
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import type { TemplateRecord, TemplateSection, TemplateTheme } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';

interface TemplateEditorPanelProps {
  template: TemplateRecord;
  onChange: (updated: TemplateRecord) => void;
}

const SECTION_TYPES = [
  { value: 'title', label: 'Title' },
  { value: 'ingredients', label: 'Ingredients' },
  { value: 'instructions', label: 'Instructions' },
  { value: 'nutrition-label', label: 'Nutrition Label' },
  { value: 'nutrition-summary', label: 'Nutrition Summary' },
  { value: 'servings-info', label: 'Servings Info' },
  { value: 'image', label: 'Image' },
  { value: 'notes', label: 'Notes' },
  { value: 'divider', label: 'Divider' },
  { value: 'column-divider', label: 'Column Divider' },
  { value: 'chapter-title', label: 'Chapter Title' },
  { value: 'page-content', label: 'Page Content' },
  { value: 'page-number', label: 'Page Number' },
  { value: 'custom-text', label: 'Custom Text' },
] as const;

const FONT_OPTIONS = [
  { value: 'inherit', label: 'System Default' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
];

export default function TemplateEditorPanel({ template, onChange }: TemplateEditorPanelProps) {
  const { layout, name, type } = template;
  const { theme, pageSize, orientation, margins, sections } = layout;

  const updateName = (name: string) => {
    onChange({ ...template, name });
  };

  const updateLayout = (updates: Partial<TemplateRecord['layout']>) => {
    onChange({ ...template, layout: { ...template.layout, ...updates } });
  };

  const updateTheme = (theme: Partial<TemplateTheme>) => {
    onChange({ ...template, layout: { ...template.layout, theme: { ...template.layout.theme, ...theme } } });
  };

  const updateSections = (sections: TemplateSection[]) => {
    onChange({ ...template, layout: { ...template.layout, sections } });
  };

  const updateSection = (id: string, updates: Partial<TemplateSection>) => {
    updateSections(
      sections.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const updateSectionStyle = (id: string, styleUpdates: Partial<TemplateSection['style']>) => {
    updateSections(
      sections.map((s) =>
        s.id === id ? { ...s, style: { ...s.style, ...styleUpdates } } : s
      )
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }));
    updateSections(reordered);
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium">Template Name</Label>
        <Input
          value={name}
          onChange={(e) => updateName(e.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">Type</Label>
        <div className="mt-1 text-sm text-stone-500 capitalize">{type.replace('-', ' ')}</div>
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium mb-2 block">Page Size</Label>
        <Select value={pageSize} onValueChange={(v) => updateLayout({ pageSize: v as TemplateRecord['layout']['pageSize'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="a4">A4</SelectItem>
            <SelectItem value="letter">Letter</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Orientation</Label>
        <Select value={orientation} onValueChange={(v) => updateLayout({ orientation: v as 'portrait' | 'landscape' })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="portrait">Portrait</SelectItem>
            <SelectItem value="landscape">Landscape</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Margins (px)</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-stone-400">Top</Label>
            <Input type="number" value={margins.top} onChange={(e) => updateLayout({ margins: { ...margins, top: Number(e.target.value) } })} />
          </div>
          <div>
            <Label className="text-xs text-stone-400">Right</Label>
            <Input type="number" value={margins.right} onChange={(e) => updateLayout({ margins: { ...margins, right: Number(e.target.value) } })} />
          </div>
          <div>
            <Label className="text-xs text-stone-400">Bottom</Label>
            <Input type="number" value={margins.bottom} onChange={(e) => updateLayout({ margins: { ...margins, bottom: Number(e.target.value) } })} />
          </div>
          <div>
            <Label className="text-xs text-stone-400">Left</Label>
            <Input type="number" value={margins.left} onChange={(e) => updateLayout({ margins: { ...margins, left: Number(e.target.value) } })} />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-medium mb-2">Theme</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Primary" value={theme.primaryColor} onChange={(v) => updateTheme({ primaryColor: v })} />
            <ColorField label="Background" value={theme.backgroundColor} onChange={(v) => updateTheme({ backgroundColor: v })} />
            <ColorField label="Text" value={theme.textColor} onChange={(v) => updateTheme({ textColor: v })} />
            <ColorField label="Accent" value={theme.accentColor} onChange={(v) => updateTheme({ accentColor: v })} />
          </div>
          <div>
            <Label className="text-xs text-stone-400">Font</Label>
            <Select value={theme.fontFamily} onValueChange={(v) => updateTheme({ fontFamily: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-stone-400">Border Radius: {theme.borderRadius}px</Label>
            <Slider
              value={[theme.borderRadius]}
              onValueChange={([v]) => updateTheme({ borderRadius: v })}
              min={0}
              max={24}
              step={1}
            />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-medium mb-2">Sections</h3>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {sections
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((section) => (
                  <SortableSectionItem
                    key={section.id}
                    section={section}
                    onUpdate={(updates) => updateSection(section.id, updates)}
                    onUpdateStyle={(styleUpdates) => updateSectionStyle(section.id, styleUpdates)}
                  />
                ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-stone-400">{label}</Label>
      <div className="flex items-center gap-2 mt-0.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-stone-200 cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs h-8"
        />
      </div>
    </div>
  );
}

function SortableSectionItem({
  section,
  onUpdate,
  onUpdateStyle,
}: {
  section: TemplateSection;
  onUpdate: (updates: Partial<TemplateSection>) => void;
  onUpdateStyle: (updates: Partial<TemplateSection['style']>) => void;
}) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sectionLabel = SECTION_TYPES.find((t) => t.value === section.type)?.label || section.type;

  return (
    <div ref={setNodeRef} style={style} className="border rounded-md bg-white">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button {...attributes} {...listeners} className="cursor-grab text-stone-400 hover:text-stone-600">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-medium flex-1">{sectionLabel}</span>
        <button onClick={() => onUpdate({ visible: !section.visible })} className="text-stone-400 hover:text-stone-600">
          {section.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="text-stone-400 hover:text-stone-600">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-2 pb-2 pt-1 border-t space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-stone-400">Column</Label>
                  <Select
                    value={String(section.column)}
                    onValueChange={(v) => onUpdate({ column: Number(v) as 1 | 2 })}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Left</SelectItem>
                      <SelectItem value="2">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-stone-400">Font Size</Label>
                  <Input
                    type="number"
                    value={section.style.fontSize ?? ''}
                    onChange={(e) => onUpdateStyle({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
                    className="h-7 text-xs"
                    placeholder="Default"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-stone-400">Font Weight</Label>
                  <Select
                    value={section.style.fontWeight ?? ''}
                    onValueChange={(v) => onUpdateStyle({ fontWeight: v || undefined })}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Default</SelectItem>
                      <SelectItem value="400">Normal</SelectItem>
                      <SelectItem value="600">Semi Bold</SelectItem>
                      <SelectItem value="700">Bold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-stone-400">Align</Label>
                  <Select
                    value={section.style.textAlign ?? ''}
                    onValueChange={(v) => onUpdateStyle({ textAlign: (v || undefined) as 'left' | 'center' | 'right' | undefined })}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Default</SelectItem>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <Label className="text-[10px] text-stone-400">Color</Label>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={section.style.color ?? '#000000'}
                      onChange={(e) => onUpdateStyle({ color: e.target.value })}
                      className="w-6 h-6 rounded border border-stone-200 cursor-pointer"
                    />
                  </div>
                </div>
                {section.type === 'instructions' && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Label className="text-[10px] text-stone-400">Step Numbers</Label>
                    <Switch
                      checked={section.style.showStepNumbers !== false}
                      onCheckedChange={(v) => onUpdateStyle({ showStepNumbers: v })}
                    />
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

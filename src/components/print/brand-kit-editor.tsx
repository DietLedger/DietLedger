'use client';

import { useState, useEffect, useCallback } from 'react';
import { getApiClient } from '@/lib/api-client';
import type { BrandKit } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Save } from 'lucide-react';

const MAX_LOGO_SIZE = 500 * 1024;

const SYSTEM_FONTS = [
  'system-ui', 'Georgia', 'Palatino', 'Times New Roman', 'Arial',
  'Helvetica', 'Verdana', 'Trebuchet MS', 'Courier New', 'monospace',
];

interface BrandKitEditorProps {
  kit?: BrandKit | null;
  onClose: () => void;
  onSaved?: () => void;
}

function BrandKitForm({ kit, onClose, onSaved }: BrandKitEditorProps) {
  const [name, setName] = useState(kit?.name ?? '');
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(kit?.logoDataUrl);
  const [primaryColor, setPrimaryColor] = useState(kit?.primaryColor ?? '#059669');
  const [secondaryColor, setSecondaryColor] = useState(kit?.secondaryColor ?? '#1f2937');
  const [fontFamily, setFontFamily] = useState(kit?.fontFamily ?? 'system-ui');
  const [tagline, setTagline] = useState(kit?.tagline ?? '');
  const [logoError, setLogoError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_SIZE) {
      setLogoError('Logo must be under 500KB');
      return;
    }
    setLogoError('');
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        logoDataUrl,
        primaryColor,
        secondaryColor,
        fontFamily,
        tagline: tagline.trim() || undefined,
      };
      if (kit) {
        await getApiClient().updateBrandKit(kit.id, data);
      } else {
        await getApiClient().createBrandKit(data);
      }
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Brand Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Kitchen" />
      </div>

      <div>
        <Label>Logo</Label>
        {logoDataUrl && (
          <div className="mb-2">
            <img src={logoDataUrl} alt="Logo preview" className="h-16 object-contain" />
          </div>
        )}
        <Input type="file" accept="image/*" onChange={handleLogoUpload} />
        {logoError && <p className="text-xs text-destructive mt-1">{logoError}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Primary Color</Label>
          <div className="flex gap-2">
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-8 w-8 cursor-pointer" />
            <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
          </div>
        </div>
        <div>
          <Label>Secondary Color</Label>
          <div className="flex gap-2">
            <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-8 w-8 cursor-pointer" />
            <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="flex-1" />
          </div>
        </div>
      </div>

      <div>
        <Label>Font Family</Label>
        <select
          className="w-full h-9 rounded-md border px-3 text-sm"
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
        >
          {SYSTEM_FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div>
        <Label>Tagline</Label>
        <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Made with love" />
      </div>

      <div className="border rounded-lg p-4">
        <p className="text-xs text-muted-foreground mb-2">Preview</p>
        <div style={{ fontFamily, color: primaryColor }}>
          {logoDataUrl && <img src={logoDataUrl} alt="" className="h-8 mb-2 object-contain" />}
          <h3 className="text-lg font-bold">{name || 'Brand Name'}</h3>
          {tagline && <p className="text-sm" style={{ color: secondaryColor }}>{tagline}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          <Save className="h-4 w-4 mr-1" />{saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function BrandKitEditor() {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [editingKit, setEditingKit] = useState<BrandKit | null>(null);
  const [creating, setCreating] = useState(false);

  const loadKits = useCallback(async () => {
    const all = await getApiClient().getBrandKits();
    setKits(all);
  }, []);

  useEffect(() => { loadKits(); }, [loadKits]);

  const handleDelete = async (id: string) => {
    await getApiClient().deleteBrandKit(id);
    loadKits();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Brand Kits</h3>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" />New Kit
        </Button>
      </div>

      {kits.length === 0 && (
        <p className="text-sm text-muted-foreground">No brand kits yet. Create one to customize printed recipes.</p>
      )}

      {kits.map((kit) => (
        <Card key={kit.id}>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              {kit.logoDataUrl && <img src={kit.logoDataUrl} alt="" className="h-8 object-contain" />}
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: kit.primaryColor }} />
                <span className="font-medium text-sm">{kit.name}</span>
              </div>
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingKit(kit)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(kit.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Brand Kit</DialogTitle>
          </DialogHeader>
          <BrandKitForm onClose={() => setCreating(false)} onSaved={loadKits} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingKit} onOpenChange={(open) => { if (!open) setEditingKit(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Brand Kit</DialogTitle>
          </DialogHeader>
          {editingKit && <BrandKitForm kit={editingKit} onClose={() => setEditingKit(null)} onSaved={loadKits} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

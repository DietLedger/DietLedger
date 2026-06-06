'use client';

import { useState, useCallback } from 'react';
import { useDietaryProfiles, useCreateDietaryProfile, useUpdateDietaryProfile, useDeleteDietaryProfile } from '@/hooks/use-dietary';
import { useDietarySelection } from '@/lib/dietary-selection';
import type { Allergen, DietaryTag, NutrientThreshold, DietaryProfileRecord } from '@/lib/types';
import { getAllergenNames } from '@/lib/dietary-rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, Save, X as XIcon } from 'lucide-react';

const ALLERGENS: Allergen[] = ['milk', 'eggs', 'fish', 'shellfish', 'treeNuts', 'peanuts', 'wheat', 'soybeans', 'sesame'];
const ALLERGEN_LABELS: Record<Allergen, string> = {
  milk: 'Milk/Dairy',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  treeNuts: 'Tree Nuts',
  peanuts: 'Peanuts',
  wheat: 'Wheat/Gluten',
  soybeans: 'Soy',
  sesame: 'Sesame',
};

const DIETARY_TAGS: DietaryTag[] = [
  'vegetarian', 'vegan', 'glutenFree', 'dairyFree', 'nutFree',
  'soyFree', 'eggFree', 'keto', 'paleo', 'lowFodmap', 'dASH', 'mediterranean',
];
const DIETARY_TAG_LABELS: Record<DietaryTag, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  glutenFree: 'Gluten-Free',
  dairyFree: 'Dairy-Free',
  nutFree: 'Nut-Free',
  soyFree: 'Soy-Free',
  eggFree: 'Egg-Free',
  keto: 'Keto',
  paleo: 'Paleo',
  lowFodmap: 'Low-FODMAP',
  dASH: 'DASH',
  mediterranean: 'Mediterranean',
};

const NUTRIENT_OPTIONS = [
  'sodium', 'sugar', 'saturatedFat', 'cholesterol', 'calories',
  'totalFat', 'totalCarbs', 'protein', 'fiber', 'vitaminD', 'calcium', 'iron', 'potassium',
];

interface DietaryProfileEditorProps {
  profile?: DietaryProfileRecord | null;
  onClose: () => void;
  onSaved?: () => void;
}

function ThresholdEditor({
  thresholds,
  onChange,
}: {
  thresholds: NutrientThreshold[];
  onChange: (thresholds: NutrientThreshold[]) => void;
}) {
  const addThreshold = () => {
    onChange([...thresholds, { nutrient: 'sodium', alertLevel: 'warning' }]);
  };

  const updateThreshold = (index: number, field: keyof NutrientThreshold, value: string | number) => {
    const updated = [...thresholds];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeThreshold = (index: number) => {
    onChange(thresholds.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {thresholds.map((t, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">Nutrient</Label>
            <Select value={t.nutrient} onValueChange={(v) => updateThreshold(i, 'nutrient', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NUTRIENT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-20">
            <Label className="text-xs">Daily Max</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={t.dailyMax ?? ''}
              onChange={(e) => updateThreshold(i, 'dailyMax', Number(e.target.value))}
              placeholder="—"
            />
          </div>
          <div className="w-20">
            <Label className="text-xs">Meal Max</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={t.perMealMax ?? ''}
              onChange={(e) => updateThreshold(i, 'perMealMax', Number(e.target.value))}
              placeholder="—"
            />
          </div>
          <div className="w-24">
            <Label className="text-xs">Alert</Label>
            <Select value={t.alertLevel} onValueChange={(v) => updateThreshold(i, 'alertLevel', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="danger">Danger</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeThreshold(i)}>
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addThreshold}>
        <Plus className="h-3.5 w-3.5 mr-1" />Add Threshold
      </Button>
    </div>
  );
}

export function DietaryProfileEditor({ profile, onClose, onSaved }: DietaryProfileEditorProps) {
  const createMutation = useCreateDietaryProfile();
  const updateMutation = useUpdateDietaryProfile();
  const [name, setName] = useState(profile?.name ?? '');
  const [allergens, setAllergens] = useState<Allergen[]>(profile?.allergens ?? []);
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(profile?.dietaryTags ?? []);
  const [thresholds, setThresholds] = useState<NutrientThreshold[]>(profile?.nutrientThresholds ?? []);
  const [saving, setSaving] = useState(false);

  const toggleAllergen = (allergen: Allergen) => {
    setAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]
    );
  };

  const toggleDietaryTag = (tag: DietaryTag) => {
    setDietaryTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (profile) {
        await updateMutation.mutateAsync({
          id: profile.id,
          data: {
            name: name.trim(),
            allergens,
            dietaryTags,
            nutrientThresholds: thresholds,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          allergens,
          dietaryTags,
          nutrientThresholds: thresholds,
          isActive: false,
        });
      }
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="profile-name">Profile Name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Allergies"
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">Allergens (FDA Top 9)</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {ALLERGENS.map((a) => (
            <label key={a} className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={allergens.includes(a)}
                onCheckedChange={() => toggleAllergen(a)}
              />
              <span className="text-sm">{ALLERGEN_LABELS[a]}</span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium">Dietary Preferences</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {DIETARY_TAGS.map((tag) => (
            <Badge
              key={tag}
              variant={dietaryTags.includes(tag) ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              onClick={() => toggleDietaryTag(tag)}
            >
              {DIETARY_TAG_LABELS[tag]}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium">Nutrient Thresholds</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Set daily and per-meal limits. Alerts will show when thresholds are exceeded.
        </p>
        <ThresholdEditor thresholds={thresholds} onChange={setThresholds} />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? 'Saving...' : profile ? 'Update Profile' : 'Create Profile'}
        </Button>
      </div>
    </div>
  );
}

export function DietaryProfileList() {
  const { profiles, activeProfileId } = useDietaryProfiles();
  const deleteMutation = useDeleteDietaryProfile();
  const { setActiveProfileId } = useDietarySelection();
  const [editingProfile, setEditingProfile] = useState<DietaryProfileRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  const handleActivate = async (id: string) => {
    setActiveProfileId(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dietary Profiles</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" />New Profile
        </Button>
      </div>

      {profiles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No dietary profiles yet. Create one to track allergens and dietary preferences.
        </p>
      )}

      {profiles.map((p) => (
        <Card key={p.id} className={activeProfileId === p.id ? 'ring-2 ring-brand-500' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{p.name}</h3>
                {p.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.allergens.map((a) => (
                      <Badge key={a} variant="destructive" className="text-xs">{ALLERGEN_LABELS[a]}</Badge>
                    ))}
                  </div>
                )}
                {p.dietaryTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.dietaryTags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{DIETARY_TAG_LABELS[t]}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => handleActivate(p.id)}>
                  {activeProfileId === p.id ? 'Active' : 'Activate'}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingProfile(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Dietary Profile</DialogTitle>
          </DialogHeader>
          <DietaryProfileEditor onClose={() => setCreating(false)} onSaved={() => {}} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingProfile} onOpenChange={(open) => { if (!open) setEditingProfile(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Dietary Profile</DialogTitle>
          </DialogHeader>
          {editingProfile && (
            <DietaryProfileEditor
              profile={editingProfile}
              onClose={() => setEditingProfile(null)}
              onSaved={() => {}}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

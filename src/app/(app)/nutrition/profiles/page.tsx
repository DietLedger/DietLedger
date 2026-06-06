'use client';

import { useEffect, useState, useCallback } from 'react';
import { useNutritionProfiles, useCreateNutritionProfile, useUpdateNutritionProfile, useDeleteNutritionProfile, useLogWeight } from '@/hooks/use-nutrition';
import { ProfileCard } from '@/components/nutrition/profile-card';
import { getApiClient } from '@/lib/api-client';
import type { WeightEntryRecord, NutritionProfileRecord, ActivityLevel } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUnitSystem, lbsToKg, kgToLbs, inchesToCm, cmToInches, cmToFtIn, ftInToCm, weightUnit, weightPlaceholder } from '@/hooks/use-unit-system';
import { type BmrEquation, EQUATION_OPTIONS } from '@/lib/nutrition-calcs';
import { Plus } from 'lucide-react';
import Link from 'next/link';

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Lightly Active' },
  { value: 'moderate', label: 'Moderately Active' },
  { value: 'active', label: 'Active' },
  { value: 'veryActive', label: 'Very Active' },
];

interface WeightCache {
  [profileId: string]: WeightEntryRecord | undefined;
}

export default function ProfilesPage() {
  const { profiles } = useNutritionProfiles();
  const createProfile = useCreateNutritionProfile();
  const updateProfile = useUpdateNutritionProfile();
  const deleteProfile = useDeleteNutritionProfile();
  const logWeightMutation = useLogWeight();
  const { system } = useUnitSystem();
  const [weightCache, setWeightCache] = useState<WeightCache>({});
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [weightDialogOpen, setWeightDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<NutritionProfileRecord | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [weightProfileId, setWeightProfileId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formSex, setFormSex] = useState<'male' | 'female'>('male');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formHeightCm, setFormHeightCm] = useState<number | null>(null);
  const [formHeightFt, setFormHeightFt] = useState('');
  const [formHeightIn, setFormHeightIn] = useState('');
  const [formActivityLevel, setFormActivityLevel] = useState<ActivityLevel>('moderate');
  const [formGoalWeightKg, setFormGoalWeightKg] = useState<number | null>(null);
  const [formGoalWeightDisplay, setFormGoalWeightDisplay] = useState('');
  const [formGoalDate, setFormGoalDate] = useState('');
  const [formBmrEquation, setFormBmrEquation] = useState<BmrEquation>('auto');
  const [formManualBmrValue, setFormManualBmrValue] = useState<string>('');
  const [formCalorieTarget, setFormCalorieTarget] = useState<string>('');
  const [formStartingWeightKg, setFormStartingWeightKg] = useState<number | null>(null);
  const [formStartingWeightDisplay, setFormStartingWeightDisplay] = useState('');
  const [formWeightKg, setFormWeightKg] = useState<number | null>(null);
  const [formWeightDisplay, setFormWeightDisplay] = useState('');
  const [formWeightDate, setFormWeightDate] = useState('');
  const [formWeightNotes, setFormWeightNotes] = useState('');
  const [formBloodSugar, setFormBloodSugar] = useState('');
  const [formBPSystolic, setFormBPSystolic] = useState('');
  const [formBPDiastolic, setFormBPDiastolic] = useState('');
  const [formMeasurementContext, setFormMeasurementContext] = useState<'fasting' | 'postMeal' | 'random' | ''>('');

  useEffect(() => {
    async function loadWeights() {
      const client = getApiClient();
      const entries = await Promise.all(profiles.map(async (p) => {
        const weights = await client.getWeightByProfile(p.id);
        const latest = weights.length > 0
          ? weights.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
          : undefined;
        return [p.id, latest] as const;
      }));
      const cache: WeightCache = {};
      for (const [id, weight] of entries) {
        cache[id] = weight;
      }
      setWeightCache(cache);
    }
    if (profiles.length > 0) loadWeights();
  }, [profiles]);

  const openCreateDialog = useCallback(() => {
    setEditingProfile(null);
    setFormName('');
    setFormSex('male');
    setFormBirthDate('');
    setFormHeightCm(null);
    setFormHeightFt('');
    setFormHeightIn('');
    setFormActivityLevel('moderate');
    setFormGoalWeightKg(null);
    setFormGoalWeightDisplay('');
    setFormGoalDate('');
    setFormBmrEquation('auto');
    setFormManualBmrValue('');
    setFormCalorieTarget('');
    setFormStartingWeightKg(null);
    setFormStartingWeightDisplay('');
    setProfileDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((profile: NutritionProfileRecord) => {
    setEditingProfile(profile);
    setFormName(profile.name);
    setFormSex(profile.sex);
    setFormBirthDate(profile.birthDate ?? '');
    setFormActivityLevel(profile.activityLevel);
    setFormGoalDate(profile.goalDate ?? '');
    setFormBmrEquation(profile.bmrEquation ?? 'auto');
    setFormManualBmrValue(profile.manualBmrValue != null ? String(profile.manualBmrValue) : '');
    setFormCalorieTarget(profile.calorieTarget != null ? String(profile.calorieTarget) : '');

    if (profile.heightCm) {
      setFormHeightCm(profile.heightCm);
      const { ft, inches } = cmToFtIn(profile.heightCm);
      setFormHeightFt(String(ft));
      setFormHeightIn(String(inches));
    } else {
      setFormHeightCm(null);
      setFormHeightFt('');
      setFormHeightIn('');
    }

    if (profile.goalWeightKg) {
      setFormGoalWeightKg(profile.goalWeightKg);
      setFormGoalWeightDisplay(system === 'imperial' ? kgToLbs(profile.goalWeightKg).toFixed(1) : profile.goalWeightKg.toFixed(1));
    } else {
      setFormGoalWeightKg(null);
      setFormGoalWeightDisplay('');
    }

    setProfileDialogOpen(true);
  }, [system]);

  const openWeightDialog = useCallback((profileId: string) => {
    setWeightProfileId(profileId);
    setFormWeightKg(null);
    setFormWeightDisplay('');
    setFormWeightDate(new Date().toISOString().split('T')[0]);
    setFormWeightNotes('');
    setWeightDialogOpen(true);
  }, []);

  const handleHeightFtInChange = useCallback((ft: string, inches: string) => {
    setFormHeightFt(ft);
    setFormHeightIn(inches);
    const ftNum = parseFloat(ft);
    const inNum = parseFloat(inches);
    if (!isNaN(ftNum) || !isNaN(inNum)) {
      setFormHeightCm(ftInToCm(ftNum || 0, inNum || 0));
    } else {
      setFormHeightCm(null);
    }
  }, []);

  const handleHeightCmChange = useCallback((val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setFormHeightCm(num);
      const { ft, inches } = cmToFtIn(num);
      setFormHeightFt(String(ft));
      setFormHeightIn(String(inches));
    } else {
      setFormHeightCm(null);
      setFormHeightFt('');
      setFormHeightIn('');
    }
  }, []);

  const handleGoalWeightDisplayChange = useCallback((val: string) => {
    setFormGoalWeightDisplay(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setFormGoalWeightKg(system === 'imperial' ? lbsToKg(num) : num);
    } else {
      setFormGoalWeightKg(null);
    }
  }, [system]);

  const handleWeightDisplayChange = useCallback((val: string) => {
    setFormWeightDisplay(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setFormWeightKg(system === 'imperial' ? lbsToKg(num) : num);
    } else {
      setFormWeightKg(null);
    }
  }, [system]);

  const handleStartingWeightDisplayChange = useCallback((val: string) => {
    setFormStartingWeightDisplay(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setFormStartingWeightKg(system === 'imperial' ? lbsToKg(num) : num);
    } else {
      setFormStartingWeightKg(null);
    }
  }, [system]);

  const handleSaveProfile = useCallback(async () => {
    if (!formName.trim()) return;
    if (!editingProfile && formStartingWeightKg === null) return;
    const data = {
      name: formName.trim(),
      sex: formSex,
      birthDate: formBirthDate || null,
      heightCm: formHeightCm,
      activityLevel: formActivityLevel,
      goalWeightKg: formGoalWeightKg,
      goalDate: formGoalDate || null,
      bmrEquation: formBmrEquation,
      manualBmrValue: formBmrEquation === 'indirectCalorimetry' && formManualBmrValue ? Number(formManualBmrValue) : null,
      calorieTarget: formCalorieTarget ? Number(formCalorieTarget) : null,
    };
    if (editingProfile) {
      await updateProfile.mutateAsync({ id: editingProfile.id, data });
    } else {
      const profile = await createProfile.mutateAsync(data);
      await logWeightMutation.mutateAsync({
        profileId: profile.id,
        date: new Date().toISOString().split('T')[0],
        weightKg: formStartingWeightKg!,
        notes: 'Starting weight',
      });
      const client = getApiClient();
      const weights = await client.getWeightByProfile(profile.id);
      const latest = weights.length > 0
        ? weights.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : undefined;
      setWeightCache(prev => ({ ...prev, [profile.id]: latest }));
    }
    setProfileDialogOpen(false);
  }, [formName, formSex, formBirthDate, formHeightCm, formActivityLevel, formGoalWeightKg, formGoalDate, formBmrEquation, formManualBmrValue, formCalorieTarget, formStartingWeightKg, editingProfile, createProfile, updateProfile, logWeightMutation]);

  const handleSaveWeight = useCallback(async () => {
    if (!weightProfileId || formWeightKg === null) return;
    const data: Record<string, unknown> = {
      profileId: weightProfileId,
      date: formWeightDate || new Date().toISOString().split('T')[0],
      weightKg: formWeightKg,
      notes: formWeightNotes || null,
      lastSyncedAt: null,
    };
    if (formBloodSugar) data.bloodSugar = Number(formBloodSugar);
    if (formBPSystolic) data.bloodPressureSystolic = Number(formBPSystolic);
    if (formBPDiastolic) data.bloodPressureDiastolic = Number(formBPDiastolic);
    if (formMeasurementContext) data.measurementContext = formMeasurementContext;
    await logWeightMutation.mutateAsync(data as any);
    setWeightDialogOpen(false);
    const client = getApiClient();
    const weights = await client.getWeightByProfile(weightProfileId);
    const updated = weights.length > 0
      ? weights.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
      : undefined;
    setWeightCache(prev => ({ ...prev, [weightProfileId]: updated }));
  }, [weightProfileId, formWeightKg, formWeightDate, formWeightNotes, formBloodSugar, formBPSystolic, formBPDiastolic, formMeasurementContext, logWeightMutation]);

  const handleDelete = useCallback(async () => {
    if (!deletingProfileId) return;
    await deleteProfile.mutateAsync(deletingProfileId);
    setDeleteDialogOpen(false);
    setDeletingProfileId(null);
  }, [deletingProfileId, deleteProfile]);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">People</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage nutrition profiles for you and your family.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/nutrition">Back to Dashboard</Link>
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Add Person
          </Button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No profiles yet</p>
          <p className="text-sm mb-4">Create a profile to start tracking nutrition.</p>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Add Person
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((profile, index) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              latestWeight={weightCache[profile.id]}
              index={index}
              onEdit={() => openEditDialog(profile)}
              onDelete={() => { setDeletingProfileId(profile.id); setDeleteDialogOpen(true); }}
              onLogWeight={() => openWeightDialog(profile.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProfile ? 'Edit Profile' : 'Add Person'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Enter name" />
            </div>
            {!editingProfile && (
              <div>
                <Label>Starting Weight ({weightUnit(system)})</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formStartingWeightDisplay}
                  onChange={(e) => handleStartingWeightDisplayChange(e.target.value)}
                  placeholder={weightPlaceholder(system)}
                />
              </div>
            )}
            <div>
              <Label>Sex</Label>
              <Select value={formSex} onValueChange={(v) => setFormSex(v as 'male' | 'female')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Birth Date</Label>
              <Input type="date" value={formBirthDate} onChange={(e) => setFormBirthDate(e.target.value)} />
            </div>
            <div>
              <Label>Height{system === 'metric' ? ' (cm)' : ''}</Label>
              {system === 'metric' ? (
                <Input
                  type="number"
                  value={formHeightCm ?? ''}
                  onChange={(e) => handleHeightCmChange(e.target.value)}
                  placeholder="175"
                />
              ) : (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      value={formHeightFt}
                      onChange={(e) => handleHeightFtInChange(e.target.value, formHeightIn)}
                      placeholder="5"
                    />
                  </div>
                  <span className="text-muted-foreground self-center text-sm">ft</span>
                  <div className="flex-1">
                    <Input
                      type="number"
                      value={formHeightIn}
                      onChange={(e) => handleHeightFtInChange(formHeightFt, e.target.value)}
                      placeholder="9"
                      min="0"
                      max="11"
                    />
                  </div>
                  <span className="text-muted-foreground self-center text-sm">in</span>
                </div>
              )}
            </div>
            <div>
              <Label>Activity Level</Label>
              <Select value={formActivityLevel} onValueChange={(v) => setFormActivityLevel(v as ActivityLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Goal Weight ({weightUnit(system)})</Label>
              <Input
                type="number"
                step="0.1"
                value={formGoalWeightDisplay}
                onChange={(e) => handleGoalWeightDisplayChange(e.target.value)}
                placeholder={weightPlaceholder(system)}
              />
            </div>
            <div>
              <Label>Goal Date</Label>
              <Input type="date" value={formGoalDate} onChange={(e) => setFormGoalDate(e.target.value)} />
            </div>
            <div>
              <Label>BMR/RMR Equation</Label>
              <Select value={formBmrEquation} onValueChange={(v) => setFormBmrEquation(v as BmrEquation)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formBmrEquation === 'indirectCalorimetry' && (
              <div>
                <Label>Measured RMR (kcal/day)</Label>
                <Input
                  type="number"
                  value={formManualBmrValue}
                  onChange={(e) => setFormManualBmrValue(e.target.value)}
                  placeholder="Enter value from doctor"
                />
              </div>
            )}
            <div>
              <Label>Calorie Target (kcal/day)</Label>
              <Input
                type="number"
                value={formCalorieTarget}
                onChange={(e) => setFormCalorieTarget(e.target.value)}
                placeholder="Optional override"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProfile}>{editingProfile ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={weightDialogOpen} onOpenChange={setWeightDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Weight</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={formWeightDate} onChange={(e) => setFormWeightDate(e.target.value)} />
            </div>
            <div>
              <Label>Weight ({weightUnit(system)})</Label>
              <Input
                type="number"
                step="0.1"
                value={formWeightDisplay}
                onChange={(e) => handleWeightDisplayChange(e.target.value)}
                placeholder={weightPlaceholder(system)}
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={formWeightNotes} onChange={(e) => setFormWeightNotes(e.target.value)} placeholder="Optional notes" />
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Health Metrics (optional)</p>
              <div>
                <Label>Blood Sugar (mg/dL)</Label>
                <Input type="number" value={formBloodSugar} onChange={(e) => setFormBloodSugar(e.target.value)} placeholder="e.g. 95" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>Systolic</Label>
                  <Input type="number" value={formBPSystolic} onChange={(e) => setFormBPSystolic(e.target.value)} placeholder="120" />
                </div>
                <div className="flex-1">
                  <Label>Diastolic</Label>
                  <Input type="number" value={formBPDiastolic} onChange={(e) => setFormBPDiastolic(e.target.value)} placeholder="80" />
                </div>
              </div>
              <div>
                <Label>Measurement Context</Label>
                <Select value={formMeasurementContext || 'random'} onValueChange={(v) => setFormMeasurementContext(v as 'fasting' | 'postMeal' | 'random')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fasting">Fasting</SelectItem>
                    <SelectItem value="postMeal">Post-Meal</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWeightDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveWeight}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this profile and all associated food logs and weight entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingProfileId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

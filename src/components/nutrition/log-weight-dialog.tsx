'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNutritionProfiles, useLogWeight } from '@/hooks/use-nutrition';
import { getApiClient } from '@/lib/api-client';
import { useUnitSystem, lbsToKg, weightUnit, weightPlaceholder } from '@/hooks/use-unit-system';

interface LogWeightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogWeightDialog({ open, onOpenChange }: LogWeightDialogProps) {
  const { profiles } = useNutritionProfiles();
  const logWeightMutation = useLogWeight();
  const { system } = useUnitSystem();

  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [formWeightDisplay, setFormWeightDisplay] = useState('');
  const [formWeightKg, setFormWeightKg] = useState<number | null>(null);
  const [formWeightDate, setFormWeightDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formWeightNotes, setFormWeightNotes] = useState('');
  const [formBloodSugar, setFormBloodSugar] = useState('');
  const [formBPSystolic, setFormBPSystolic] = useState('');
  const [formBPDiastolic, setFormBPDiastolic] = useState('');
  const [formMeasurementContext, setFormMeasurementContext] = useState<'fasting' | 'postMeal' | 'random' | ''>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFormWeightDisplay('');
      setFormWeightKg(null);
      setFormWeightDate(new Date().toISOString().split('T')[0]);
      setFormWeightNotes('');
      setFormBloodSugar('');
      setFormBPSystolic('');
      setFormBPDiastolic('');
      setFormMeasurementContext('');
    }
  }, [open]);

  useEffect(() => {
    if (open && profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [open, profiles, selectedProfileId]);

  const handleWeightDisplayChange = useCallback((val: string) => {
    setFormWeightDisplay(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setFormWeightKg(system === 'imperial' ? lbsToKg(num) : num);
    } else {
      setFormWeightKg(null);
    }
  }, [system]);

  const handleSave = useCallback(async () => {
    if (!selectedProfileId || formWeightKg === null) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        profileId: selectedProfileId,
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
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }, [selectedProfileId, formWeightKg, formWeightDate, formWeightNotes, formBloodSugar, formBPSystolic, formBPDiastolic, formMeasurementContext, logWeightMutation, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log Weight</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {profiles.length > 0 ? (
            <div>
              <Label>Person</Label>
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                <SelectTrigger><SelectValue placeholder="Select person..." /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No profiles yet. Create one from the People page first.</p>
          )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!selectedProfileId || formWeightKg === null || saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

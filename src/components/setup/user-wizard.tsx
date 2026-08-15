'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useInstanceState } from '@/hooks/use-instance';
import { useUpdateSettings } from '@/hooks/use-settings';
import { useCreateNutritionProfile } from '@/hooks/use-nutrition';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChefHat, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import type { ActivityLevel } from '@/lib/types';

type StepKey = 'welcome' | 'profile' | 'preferences';

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary — little or no exercise' },
  { value: 'light', label: 'Lightly active — 1-3 days/week' },
  { value: 'moderate', label: 'Moderately active — 3-5 days/week' },
  { value: 'active', label: 'Active — 6-7 days/week' },
  { value: 'veryActive', label: 'Very active — hard daily exercise' },
];

const TITLE: Record<StepKey, string> = {
  welcome: 'Welcome to DietLedger',
  profile: 'Create a profile (optional)',
  preferences: 'Your preferences',
};

const SUBTITLE: Record<StepKey, string> = {
  welcome: 'A few quick choices to personalize your workspace. You can skip anything.',
  profile: 'Profiles power nutrition tracking, BMI, BMR and TDEE.',
  preferences: 'You can change these later in Settings.',
};

export function UserWizard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: instance, isLoading: instanceLoading } = useInstanceState();
  const updateSettings = useUpdateSettings();
  const createProfile = useCreateNutritionProfile();

  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [profileName, setProfileName] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [birthDate, setBirthDate] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [heightCm, setHeightCm] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const steps: StepKey[] = ['welcome', 'profile', 'preferences'];
  const currentStep = steps[stepIndex];

  useEffect(() => {
    if (isLoading || instanceLoading) return;
    if (!instance?.onboardingComplete) {
      router.replace('/setup');
      return;
    }
    if (user?.isAdmin) {
      router.replace('/');
      return;
    }
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, instanceLoading, instance?.onboardingComplete, user?.isAdmin, isAuthenticated, router]);

  if (isLoading || instanceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
      </div>
    );
  }

  // Redirect in an effect so render stays pure.
  if (!instance?.onboardingComplete || user?.isAdmin || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
      </div>
    );
  }

  const heightToCm = (): number | null => {
    if (unitSystem === 'metric') {
      const cm = parseFloat(heightCm);
      return isNaN(cm) ? null : cm;
    }
    const ft = parseFloat(heightFt);
    const inch = parseFloat(heightIn);
    if (isNaN(ft) && isNaN(inch)) return null;
    return ((isNaN(ft) ? 0 : ft) * 12 + (isNaN(inch) ? 0 : inch)) * 2.54;
  };

  const advance = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => {
    setError('');
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  // Marks onboarding complete and bounces into the app. Shared by "Finish"
  // and "Skip" (skip = complete without saving the optional profile/prefs).
  const complete = async (savePrefs: boolean) => {
    setBusy(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { onboardingComplete: true };
      if (savePrefs) {
        payload.unitSystem = unitSystem;
        payload.theme = theme;
      }
      await new Promise<void>((resolve, reject) => {
        updateSettings.mutate(payload, {
          onSuccess: () => resolve(),
          onError: (e) => reject(e),
        });
      });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setBusy(false);
    }
  };

  const saveProfileAndAdvance = async () => {
    if (!profileName.trim()) {
      advance();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await new Promise<void>((resolve, reject) => {
        createProfile.mutate(
          {
            name: profileName.trim(),
            sex,
            birthDate: birthDate || null,
            heightCm: heightToCm(),
            activityLevel,
            goalWeightKg: null,
            goalDate: null,
          },
          { onSuccess: () => resolve(), onError: (e) => reject(e) },
        );
      });
      advance();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create profile');
    } finally {
      setBusy(false);
    }
  };

  const onNext = () => {
    if (currentStep === 'profile') {
      saveProfileAndAdvance();
      return;
    }
    if (currentStep === 'preferences') {
      complete(true);
      return;
    }
    advance();
  };

  const isLastStep = currentStep === 'preferences';
  const nextLabel = currentStep === 'welcome' ? 'Get started' : isLastStep ? 'Finish' : 'Continue';
  const showBack = stepIndex > 0;

  return (
    <Shell wide>
      <div className="flex items-center gap-2 mb-1 text-brand-700">
        <ChefHat className="w-5 h-5" />
        <span className="font-semibold">DietLedger</span>
      </div>
      <CardTitle className="text-xl">{TITLE[currentStep]}</CardTitle>
      <CardDescription>{SUBTITLE[currentStep]}</CardDescription>

      <div className="py-2">
        {currentStep === 'welcome' && (
          <ul className="text-sm text-stone-600 space-y-2">
            <li>Create a nutrition profile (optional).</li>
            <li>Choose measurement units and appearance.</li>
            <li>Start cooking and tracking.</li>
          </ul>
        )}

        {currentStep === 'profile' && (
          <div className="space-y-3">
            <Field label="Profile name">
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g. You, or a family member" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sex">
                <Select value={sex} onValueChange={(v) => setSex(v as 'male' | 'female')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Birth date">
                <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Activity level">
              <Select value={activityLevel} onValueChange={(v) => setActivityLevel(v as ActivityLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Height">
              {unitSystem === 'metric' ? (
                <Input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="cm" />
              ) : (
                <div className="flex gap-2">
                  <Input type="number" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} placeholder="ft" />
                  <Input type="number" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="in" />
                </div>
              )}
            </Field>
            <p className="text-xs text-stone-400">Optional — skip to continue without a profile.</p>
          </div>
        )}

        {currentStep === 'preferences' && (
          <div className="space-y-4">
            <Field label="Measurement units">
              <RadioGroup value={unitSystem} onValueChange={(v) => setUnitSystem(v as 'imperial' | 'metric')} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="imperial" id="u-imperial" />
                  <Label htmlFor="u-imperial">Imperial (lb, oz)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="metric" id="u-metric" />
                  <Label htmlFor="u-metric">Metric (kg, g)</Label>
                </div>
              </RadioGroup>
            </Field>
            <Field label="Appearance">
              <RadioGroup value={theme} onValueChange={(v) => setTheme(v as 'light' | 'dark')} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="light" id="t-light" />
                  <Label htmlFor="t-light">Light</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="dark" id="t-dark" />
                  <Label htmlFor="t-dark">Dark</Label>
                </div>
              </RadioGroup>
            </Field>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded mt-2">{error}</div>}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-stone-100">
        <div>
          {showBack && (
            <Button variant="ghost" onClick={back} disabled={busy}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => complete(false)} disabled={busy}>
            Skip
          </Button>
          <Button className="bg-brand-600 hover:bg-brand-700" onClick={onNext} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {nextLabel}
            {!isLastStep && !busy && <ArrowRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <Card className={`w-full ${wide ? 'max-w-lg' : 'max-w-sm'} shadow-sm`}>
        <CardHeader className="space-y-1">{children}</CardHeader>
      </Card>
    </div>
  );
}

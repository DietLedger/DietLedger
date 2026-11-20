'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  useInstanceState,
  useCompleteOnboarding,
  useSetRegistrationEnabled,
} from '@/hooks/use-instance';
import { useUpdateSettings } from '@/hooks/use-settings';
import { useCreateNutritionProfile } from '@/hooks/use-nutrition';
import { getApiClient, type SeedJob } from '@/lib/api-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { Progress } from '@/components/ui/progress';
import { DEFAULT_MEAL_SLOT_TIMES, type ActivityLevel } from '@/lib/types';
import { ChefHat, ArrowLeft, ArrowRight, Loader2, Check } from 'lucide-react';

type StepKey = 'welcome' | 'account' | 'basics' | 'registration' | 'usda' | 'demo' | 'profile' | 'finish';

type UsdaPresetId = 'foundation' | 'recommended' | 'branded' | 'skip';

// Backend data-type keys (see sync-server/seed.go datasetURLs). A preset maps
// to one or more datasets; "recommended" enqueues two jobs that the seeder
// processes sequentially.
const USDA_PRESETS: { id: UsdaPresetId; label: string; hint: string; dataTypes: string[]; warning?: boolean }[] = [
  { id: 'foundation', label: 'Foundation only', hint: '~400 foods · ~6.5 MB · seconds', dataTypes: ['foundation'] },
  { id: 'recommended', label: 'Foundation + SR Legacy', hint: '~8,200 foods · ~210 MB · recommended', dataTypes: ['foundation', 'sr_legacy'] },
  { id: 'branded', label: 'Branded Foods', hint: '~1.8M products · ~3.1 GB · long download', dataTypes: ['branded'], warning: true },
  { id: 'skip', label: 'Skip for now', hint: 'Set up USDA data later from Settings.', dataTypes: [] },
];

const DATA_TYPE_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  sr_legacy: 'SR Legacy',
  fndds: 'FNDDS',
  branded: 'Branded',
};


const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary — little or no exercise' },
  { value: 'light', label: 'Lightly active — 1-3 days/week' },
  { value: 'moderate', label: 'Moderately active — 3-5 days/week' },
  { value: 'active', label: 'Active — 6-7 days/week' },
  { value: 'veryActive', label: 'Very active — hard daily exercise' },
];

export function SetupWizard() {
  const router = useRouter();
  const { isAuthenticated, user, register } = useAuth();
  const { data: instance, isLoading: instanceLoading } = useInstanceState();
  const completeOnboarding = useCompleteOnboarding();
  const setRegistration = useSetRegistrationEnabled();
  const updateSettings = useUpdateSettings();
  const createProfile = useCreateNutritionProfile();

  // The current step is tracked by its key, not a positional index. The
  // ordered `steps` list changes shape once the session authenticates (the
  // 'account' step drops out), so a positional index would point at the wrong
  // step right after the account -> basics transition (it would overshoot to
  // 'registration'). Navigating by key keeps the step stable across that list
  // mutation.
  const [currentStep, setCurrentStep] = useState<StepKey>('welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Account form
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupClaim, setSetupClaim] = useState('');

  // Basics form
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Registration form
  const [allowRegistration, setAllowRegistration] = useState(true);

  // Profile form
  const [profileName, setProfileName] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [birthDate, setBirthDate] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [heightCm, setHeightCm] = useState('');

  // USDA data form. Seed jobs run server-side (POST /api/foods/seed just queues;
  // the background seeder downloads/imports). The wizard never blocks on them.
  const [usdaPreset, setUsdaPreset] = useState<UsdaPresetId>('skip');
  const [seedJobs, setSeedJobs] = useState<{ jobId: number; dataType: string }[]>([]);
  const [jobProgress, setJobProgress] = useState<Record<number, SeedJob>>({});
  const [seedStarting, setSeedStarting] = useState(false);

  // Starter data is now owned by the server-side recipe bundle/import path.
  // The old browser-driven demo zip installer has been intentionally removed.

  useEffect(() => {
    if (!instanceLoading && instance?.onboardingComplete) {
      router.replace('/');
    }
  }, [instanceLoading, instance?.onboardingComplete, router]);

  // Poll seed-job progress while any are running. Stops once every queued job
  // reaches a terminal state (completed/failed). Declared before the early
  // returns so hook order stays stable across renders.
  useEffect(() => {
    if (seedJobs.length === 0) return;
    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    const isTerminal = (j?: SeedJob) => j?.status === 'completed' || j?.status === 'failed';

    const poll = async () => {
      const updated: Record<number, SeedJob> = {};
      for (const { jobId } of seedJobs) {
        try {
          updated[jobId] = await getApiClient().getSeedJob(jobId);
        } catch {
          /* ignore — will retry on next tick */
        }
      }
      if (!active) return;
      setJobProgress((prev) => ({ ...prev, ...updated }));
      if (seedJobs.every(({ jobId }) => isTerminal(updated[jobId])) && interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    poll();
    interval = setInterval(poll, 2000);
    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [seedJobs]);

  if (instanceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
      </div>
    );
  }

  // Already set up — nothing to do here. Redirect in an effect so render stays pure.
  if (instance?.onboardingComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
      </div>
    );
  }

  // Instance is not ready but an admin account already exists and this session
  // is not authenticated (e.g. setup was interrupted). Send the admin to sign in
  // rather than letting a second account register.
  if (!isAuthenticated && instance?.hasUsers) {
    return (
      <Shell>
        <CardTitle className="text-xl">Sign in to finish setup</CardTitle>
        <CardDescription>
          This DietLedger instance is partially configured. Sign in with the
          administrator account to complete setup.
        </CardDescription>
        <div className="mt-4 flex flex-col gap-2">
          <Button asChild className="bg-brand-600 hover:bg-brand-700">
            <Link href="/login">Sign in as administrator</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  // Authenticated but not an admin before setup completes.
  if (isAuthenticated && !user?.isAdmin) {
    return (
      <Shell>
        <CardTitle className="text-xl">Setup in progress</CardTitle>
        <CardDescription>
          The administrator is still configuring this DietLedger instance.
          You&apos;ll be able to sign in once setup is complete.
        </CardDescription>
      </Shell>
    );
  }

  // Determine the ordered step list. The account-creation step only applies to
  // a truly fresh install (no users, not authenticated).
  const steps: StepKey[] = isAuthenticated
    ? ['welcome', 'basics', 'registration', 'usda', 'demo', 'profile', 'finish']
    : ['welcome', 'account', 'basics', 'registration', 'usda', 'demo', 'profile', 'finish'];

  const stepIndex = steps.indexOf(currentStep);
  const stepNumber = stepIndex + 1;

  const advance = () => {
    const i = steps.indexOf(currentStep);
    setCurrentStep(steps[Math.min(i + 1, steps.length - 1)]);
  };
  const back = () => {
    setError('');
    const i = steps.indexOf(currentStep);
    setCurrentStep(steps[Math.max(i - 1, 0)]);
  };

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

  const handleAccount = async () => {
    setError('');
    if (!setupClaim.trim()) { setError('The installation setup claim is required.'); return false; }
    if (!displayName.trim() || !email.trim()) {
      setError('Name and email are required.');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    setBusy(true);
    try {
      await register(email, password, displayName, setupClaim);
      setSetupClaim('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create account');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveBasics = async () => {
    setBusy(true);
    setError('');
    try {
      await new Promise<void>((resolve, reject) => {
        updateSettings.mutate(
          {
            unitSystem,
            theme,
            defaultMealSlotTimes: { ...DEFAULT_MEAL_SLOT_TIMES },
          },
          { onSuccess: () => resolve(), onError: (e) => reject(e) },
        );
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveRegistration = async () => {
    setBusy(true);
    setError('');
    try {
      await new Promise<void>((resolve, reject) => {
        setRegistration.mutate(allowRegistration, {
          onSuccess: () => resolve(),
          onError: (e) => reject(e),
        });
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update registration');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startImport = async () => {
    const preset = USDA_PRESETS.find((p) => p.id === usdaPreset);
    if (!preset || preset.dataTypes.length === 0) return;
    setSeedStarting(true);
    setError('');
    try {
      const created: { jobId: number; dataType: string }[] = [];
      for (const dt of preset.dataTypes) {
        const { jobId } = await getApiClient().startFoodSeed(dt);
        created.push({ jobId, dataType: dt });
      }
      setSeedJobs(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start USDA import');
    } finally {
      setSeedStarting(false);
    }
  };

  const saveProfile = async () => {
    setError('');
    if (!profileName.trim()) {
      setError('A profile name is required.');
      return false;
    }
    setBusy(true);
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
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create profile');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      await new Promise<void>((resolve, reject) => {
        completeOnboarding.mutate(undefined, {
          onSuccess: () => resolve(),
          onError: (e) => reject(e),
        });
      });
      // Mark the admin's per-user onboarding complete too, so the welcome
      // flow isn't shown immediately after instance setup. Best-effort.
      await new Promise<void>((resolve) => {
        updateSettings.mutate({ onboardingComplete: true }, {
          onSuccess: () => resolve(),
          onError: () => resolve(),
        });
      });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete setup');
      setBusy(false);
    }
  };

  const onNext = async () => {
    let ok = true;
    if (currentStep === 'account') ok = await handleAccount();
    else if (currentStep === 'basics') ok = await saveBasics();
    else if (currentStep === 'registration') ok = await saveRegistration();
    else if (currentStep === 'usda') {
      // Queue the chosen import if it hasn't started. The POST only enqueues a
      // job (fast), so this never blocks on the long download.
      if (usdaPreset !== 'skip' && seedJobs.length === 0) await startImport();
    }
    else if (currentStep === 'demo') {
      // Starter data import is handled outside the browser-driven onboarding
      // flow by the server-side recipe bundle/import pipeline.
    }
    else if (currentStep === 'profile') ok = await saveProfile();
    if (ok) advance();
  };

  const isLastStep = currentStep === 'finish';
  const nextLabel =
    currentStep === 'welcome'
      ? 'Get started'
      : currentStep === 'finish'
        ? 'Finish setup'
        : 'Continue';
  const showSkip = currentStep === 'profile';
  const showBack = stepIndex > 0 && currentStep !== 'finish';

  return (
    <Shell wide>
      <div className="flex items-center gap-2 mb-1 text-brand-700">
        <ChefHat className="w-5 h-5" />
        <span className="font-semibold">DietLedger Setup</span>
      </div>
      <CardTitle className="text-xl">{TITLE[currentStep]}</CardTitle>
      <CardDescription>{SUBTITLE[currentStep]}</CardDescription>

      <div className="mt-4 mb-2">
        <Progress value={(stepNumber / steps.length) * 100} className="h-1.5" />
        <p className="text-[11px] text-stone-400 mt-1">
          Step {stepNumber} of {steps.length}
        </p>
      </div>

      <div className="py-2">
        {currentStep === 'welcome' && (
          <ul className="text-sm text-stone-600 space-y-2">
            <li className="flex gap-2"><Check className="w-4 h-4 text-brand-600 mt-0.5" />Create your administrator account</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-brand-600 mt-0.5" />Choose measurement units and appearance</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-brand-600 mt-0.5" />Control who can register accounts</li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-brand-600 mt-0.5" />Set up your first nutrition profile</li>
          </ul>
        )}

        {currentStep === 'account' && (
          <div className="space-y-3">
            <Field label="Your name">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Admin" />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Field label="Installation setup claim">
              <Input aria-label="Installation setup claim" type="password" value={setupClaim} onChange={(e) => setSetupClaim(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
            </Field>
            <Field label="Confirm password">
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <p className="text-xs text-stone-400">
              This account becomes the instance administrator and can manage USDA data, demo content, and registration.
            </p>
          </div>
        )}

        {currentStep === 'basics' && (
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

        {currentStep === 'registration' && (
          <div className="space-y-3">
            <Field label="Allow new account registration?">
              <RadioGroup value={allowRegistration ? 'open' : 'closed'} onValueChange={(v) => setAllowRegistration(v === 'open')} className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="open" id="r-open" className="mt-1" />
                  <div>
                    <Label htmlFor="r-open">Open registration</Label>
                    <p className="text-xs text-stone-400">Anyone with the link can create an account.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="closed" id="r-closed" className="mt-1" />
                  <div>
                    <Label htmlFor="r-closed">Admin-managed</Label>
                    <p className="text-xs text-stone-400">Only the administrator can create accounts. You can change this later in Settings.</p>
                  </div>
                </div>
              </RadioGroup>
            </Field>
          </div>
        )}

        {currentStep === 'usda' && (
          <div className="space-y-3">
            <Field label="Import USDA food data?">
              <RadioGroup value={usdaPreset} onValueChange={(v) => setUsdaPreset(v as UsdaPresetId)} className="flex flex-col gap-2">
                {USDA_PRESETS.map((p) => (
                  <div key={p.id} className="flex items-start gap-2">
                    <RadioGroupItem value={p.id} id={`usda-${p.id}`} className="mt-1" />
                    <div>
                      <Label htmlFor={`usda-${p.id}`}>{p.label}</Label>
                      <p className="text-xs text-stone-400">{p.hint}</p>
                      {p.warning && (
                        <p className="text-xs text-amber-600 mt-0.5">Large download — can take several minutes.</p>
                      )}
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </Field>

            {usdaPreset !== 'skip' && seedJobs.length === 0 && (
              <Button variant="outline" onClick={startImport} disabled={seedStarting}>
                {seedStarting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Start import now
              </Button>
            )}

            {seedJobs.length > 0 && (
              <div className="space-y-2">
                {seedJobs.map(({ jobId, dataType }) => {
                  const j = jobProgress[jobId];
                  const pct = j ? Math.round(j.progress) : 0;
                  return (
                    <div key={jobId} className="p-2 rounded border border-stone-200">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-stone-700">{DATA_TYPE_LABELS[dataType] ?? dataType}</span>
                        <span className="capitalize text-stone-500">{j?.status ?? 'queued'}</span>
                      </div>
                      <Progress value={pct} className="h-1.5 mt-1.5" />
                      <div className="flex items-center justify-between text-[11px] text-stone-400 mt-1">
                        <span>{j ? `${j.recordCount.toLocaleString()} records` : ''}</span>
                        <span>{pct}%</span>
                      </div>
                      {j?.error && <p className="text-xs text-red-600 mt-1">{j.error}</p>}
                    </div>
                  );
                })}
                <p className="text-[11px] text-stone-400">
                  Imports run in the background and continue after setup. Track progress in Settings → Food Database.
                </p>
              </div>
            )}
          </div>
        )}

        {currentStep === 'demo' && (
          <div className="space-y-3 text-sm text-stone-600">
            <p>
              Starter recipe data is now handled by DietLedger recipe bundle imports instead of the old browser-driven demo zip installer.
            </p>
            <p className="text-xs text-stone-400">
              Continue setup now; you can import a DietLedger recipe/cookbook bundle later from Recipes, Books, or Settings.
            </p>
          </div>
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
            <p className="text-xs text-stone-400">
              Used for BMI, BMR and TDEE calculations. You can add more profiles later.
            </p>
          </div>
        )}

        {currentStep === 'finish' && (
          <div className="text-sm text-stone-600 space-y-2">
            <p>You&apos;re ready to go. Here&apos;s what happens next:</p>
            <ul className="space-y-1.5">
              <li className="flex gap-2"><Check className="w-4 h-4 text-brand-600 mt-0.5" />Start creating recipes and cookbooks.</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-brand-600 mt-0.5" />Import USDA food data from Settings (administrator).</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-brand-600 mt-0.5" />Import DietLedger recipe/cookbook bundles from Recipes, Books, or Settings.</li>
            </ul>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded mt-2">{error}</div>
      )}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-stone-100">
        <div>
          {showBack && (
            <Button variant="ghost" onClick={back} disabled={busy}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {showSkip && (
            <Button variant="ghost" onClick={advance} disabled={busy}>
              Skip
            </Button>
          )}
          <Button
            className="bg-brand-600 hover:bg-brand-700"
            onClick={isLastStep ? finish : onNext}
            disabled={busy}
          >
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {nextLabel}
            {!isLastStep && !busy && <ArrowRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

const TITLE: Record<StepKey, string> = {
  welcome: 'Welcome to DietLedger',
  account: 'Create your administrator account',
  basics: 'Choose your preferences',
  registration: 'Registration policy',
  usda: 'Food database (USDA)',
  demo: 'Starter recipes',
  profile: 'Create your first profile',
  finish: 'You\'re all set',
};

const SUBTITLE: Record<StepKey, string> = {
  welcome: 'A quick setup to get your nutrition workspace ready.',
  account: 'This first account becomes the instance administrator.',
  basics: 'You can change these later in Settings.',
  registration: 'Control who can create accounts on this instance.',
  usda: 'Optional. Loads shared USDA food data for recipe and nutrition search.',
  demo: 'Starter recipe bundles can be imported after setup.',
  profile: 'Profiles power nutrition tracking, BMI, BMR and TDEE.',
  finish: 'Complete setup to start using DietLedger.',
};

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
        <CardHeader className="space-y-1">
          {children}
        </CardHeader>
      </Card>
    </div>
  );
}

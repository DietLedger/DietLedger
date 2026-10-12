'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useInstanceState, useSetRegistrationEnabled } from '@/hooks/use-instance';
import { useAppSettings, useUpdateSingleSlotTime, useUpdateSettings } from '@/hooks/use-settings';
import { useCreateSecret, useDeleteSecret, useFDAKey, useSecrets, useSetFDAKey } from '@/hooks/use-secrets';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useRecipes } from '@/hooks/use-recipes';
import { useBooks } from '@/hooks/use-books';
import { queryKeys } from '@/lib/query-keys';
import { getApiClient, type UserListEntry } from '@/lib/api-client';
import { ConfirmWithPasswordDialog } from '@/components/confirm-with-password-dialog';
import FoodDatabasePanel from '@/components/food-database-panel';
import CategoriesPanel from '@/components/categories-panel';
import PantryStaplesPanel from '@/components/pantry-staples-panel';
import CustomFoodsPanel from '@/components/custom-foods-panel';
import LocationPanel from '@/components/location-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Clock, Key, Plus, Trash2, Copy, Check, Download, Upload, AlertTriangle, ShieldCheck,
  Loader2, RotateCcw, Settings, Database, FolderOpen, Package, MapPin, LayoutTemplate,
  Eye, EyeOff,
  User, Palette,
} from 'lucide-react';
import { DEFAULT_MEAL_SLOT_TIMES, type DaySlot } from '@/lib/types';
import { downloadRecipeBundle, importRecipeBundleFromFile, summarizeRecipeBundleImport } from '@/lib/recipe-bundles';

const SLOT_LABELS: Record<DaySlot, string> = {
  morning: 'Morning', midMorning: 'Mid-Morning', noon: 'Noon', afternoon: 'Afternoon', evening: 'Evening', night: 'Night',
};
const SLOT_ORDER: DaySlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night'];

type FeatureKey = 'recipes' | 'books' | 'mealPlans' | 'nutrition' | 'foods' | 'categories' | 'customFoods';
const FEATURES: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'recipes', label: 'Recipes', description: 'Read and create recipes' },
  { key: 'books', label: 'Books', description: 'Read and manage recipe books' },
  { key: 'mealPlans', label: 'Meal Plans', description: 'Read and modify meal plans' },
  { key: 'nutrition', label: 'Nutrition', description: 'Read nutrition profiles and food logs' },
  { key: 'foods', label: 'Food Database', description: 'Search the food database' },
  { key: 'categories', label: 'Categories', description: 'List recipe categories' },
  { key: 'customFoods', label: 'Custom Foods', description: 'Read and create custom foods' },
];

interface ApiKeyInfo { id: string; name: string; keyPrefix: string; permissions: Record<string, string[]>; lastUsedAt: string | null; createdAt: string }

type TabKey = 'general' | 'mealtimes' | 'food' | 'categories' | 'staples' | 'customfoods' | 'location' | 'templates' | 'data' | 'apikeys' | 'admin' | 'danger';
const TABS: { id: TabKey; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'mealtimes', label: 'Meal Times', icon: Clock },
  { id: 'food', label: 'Food Database', icon: Database },
  { id: 'categories', label: 'Categories', icon: FolderOpen },
  { id: 'staples', label: 'Staples', icon: Package },
  { id: 'customfoods', label: 'Custom Foods', icon: Package },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'data', label: 'Data', icon: Download },
  { id: 'apikeys', label: 'API Keys', icon: Key },
  { id: 'admin', label: 'Administration', icon: ShieldCheck },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { data: instance } = useInstanceState();
  const setRegistration = useSetRegistrationEnabled();
  const qc = useQueryClient();
  const { data: appSettings } = useAppSettings();
  const defaultMealSlotTimes = appSettings?.defaultMealSlotTimes ?? DEFAULT_MEAL_SLOT_TIMES;
  const updateSingleSlotTimeMutation = useUpdateSingleSlotTime();
  const updateSettingsMutation = useUpdateSettings();
  const { data: apiKey = 'DEMO_KEY' } = useFDAKey();
  const setFDAKeyMutation = useSetFDAKey();
  const { data: secrets = [] } = useSecrets();
  const createSecretMutation = useCreateSecret();
  const deleteSecretMutation = useDeleteSecret();
  const { themeId, setTheme, themes } = useAppTheme();
  const { data: recipes = [] } = useRecipes();
  const { data: books = [] } = useBooks();

  const [tab, setTab] = useState<TabKey>('general');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');

  // Non-admins use the popup; the page is the admin console.
  useEffect(() => {
    if (user && !user.isAdmin) router.replace('/');
  }, [user, router]);

  const handleSaveApiKey = useCallback(() => {
    setApiKeyError('');
    setFDAKeyMutation.mutate(apiKeyInput, {
      onSuccess: () => {
        setApiKeySaved(true);
        setApiKeyInput('');
        setTimeout(() => setApiKeySaved(false), 2000);
      },
      onError: (err) => setApiKeyError(err instanceof Error ? err.message : 'Failed to save API key'),
    });
  }, [apiKeyInput, setFDAKeyMutation]);

  // ── API keys ─────────────────────────────────────────────────────────
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState<Record<FeatureKey, { read: boolean; write: boolean }>>({
    recipes: { read: true, write: true }, books: { read: true, write: true }, mealPlans: { read: true, write: true },
    nutrition: { read: true, write: false }, foods: { read: true, write: false }, categories: { read: true, write: false }, customFoods: { read: true, write: true },
  });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) { const json = await res.json(); setKeys(Array.isArray(json.data ?? json) ? (json.data ?? json) : []); }
      else setKeys([]);
    } catch { setKeys([]); }
  }, []);
  useEffect(() => { loadKeys(); }, [loadKeys]);
  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    const permissions: Record<string, string[]> = {};
    for (const [feat, perms] of Object.entries(newKeyPerms)) {
      const actions: string[] = [];
      if (perms.read) actions.push('read');
      if (perms.write) actions.push('write');
      if (actions.length > 0) permissions[feat] = actions;
    }
    try {
      const res = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newKeyName.trim(), permissions: JSON.stringify(permissions) }) });
      if (res.ok) { const json = await res.json(); setCreatedKey(json.data?.key ?? json.key); setNewKeyName(''); loadKeys(); }
    } catch {}
  };
  const handleDeleteKey = async (id: string) => { try { await fetch(`/api/keys/${id}`, { method: 'DELETE' }); loadKeys(); } catch {} };
  const togglePerm = (feat: FeatureKey, action: 'read' | 'write') => setNewKeyPerms(prev => ({ ...prev, [feat]: { ...prev[feat], [action]: !prev[feat][action] } }));

  // ── Encrypted user secrets ─────────────────────────────────────────
  const [secretKeyName, setSecretKeyName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [secretVisible, setSecretVisible] = useState<Record<string, boolean>>({});
  const [secretError, setSecretError] = useState('');
  const handleSaveSecret = () => {
    const keyName = secretKeyName.trim();
    if (!keyName || !secretValue) return;
    setSecretError('');
    createSecretMutation.mutate({ keyName, value: secretValue }, {
      onSuccess: () => {
        setSecretKeyName('');
        setSecretValue('');
      },
      onError: (err) => setSecretError(err instanceof Error ? err.message : 'Failed to save secret'),
    });
  };
  const handleToggleSecret = async (id: string) => {
    if (secretVisible[id]) {
      setSecretVisible(prev => ({ ...prev, [id]: false }));
      return;
    }
    if (!secretValues[id]) {
      try {
        const value = await getApiClient().getSecretValue(id);
        setSecretValues(prev => ({ ...prev, [id]: value }));
      } catch (err) {
        setSecretError(err instanceof Error ? err.message : 'Failed to reveal secret');
        return;
      }
    }
    setSecretVisible(prev => ({ ...prev, [id]: true }));
  };
  const handleDeleteSecret = (id: string) => {
    deleteSecretMutation.mutate(id, {
      onSuccess: () => {
        setSecretValues(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSecretVisible(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      },
      onError: (err) => setSecretError(err instanceof Error ? err.message : 'Failed to delete secret'),
    });
  };

  // ── Data: recipe/cookbook bundle export / import ─────────────────────
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const handleExport = async () => {
    setExporting(true);
    try {
      const bundle = await getApiClient().exportRecipeBundle({ recipeIds: recipes.map((r) => r.id), bookIds: books.map((b) => b.id) });
      downloadRecipeBundle(bundle, `dietledger-recipes-${new Date().toISOString().slice(0, 10)}.dietledger-bundle.json`);
    }
    catch (e) { console.error('Export failed', e); } finally { setExporting(false); }
  };
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportStatus(null);
    try {
      const result = await importRecipeBundleFromFile(file);
      setImportStatus(`Imported: ${summarizeRecipeBundleImport(result)}`);
      qc.invalidateQueries({ queryKey: queryKeys.recipes.all });
      qc.invalidateQueries({ queryKey: queryKeys.books.all });
    } catch (err) { setImportStatus(`Import failed: ${err instanceof Error ? err.message : 'Invalid file'}`); }
    finally { setImporting(false); e.target.value = ''; }
  };

  // ── Delete my account (backup → delete → logout; successor if last admin) ──
  const [delAccOpen, setDelAccOpen] = useState(false);
  const [delAccPw, setDelAccPw] = useState('');
  const [delAccSucc, setDelAccSucc] = useState('');
  const [delAccBusy, setDelAccBusy] = useState(false);
  const [delAccErr, setDelAccErr] = useState('');
  const [users, setUsers] = useState<UserListEntry[]>([]);
  useEffect(() => {
    if (delAccOpen && user?.isAdmin) { getApiClient().listUsers().then(setUsers).catch(() => setUsers([])); }
  }, [delAccOpen, user]);
  const adminCount = users.filter((u) => u.isAdmin).length;
  const needSuccessor = !!user?.isAdmin && adminCount <= 1;
  const submitDeleteAccount = async () => {
    setDelAccErr('');
    if (!delAccPw) { setDelAccErr('Enter your password.'); return; }
    if (needSuccessor && !delAccSucc) { setDelAccErr('You are the only administrator — choose a successor.'); return; }
    setDelAccBusy(true);
    try {
      // 1. download a recipe/cookbook bundle, 2. delete the account, 3. sign out.
      const bundle = await getApiClient().exportRecipeBundle({ recipeIds: recipes.map((r) => r.id), bookIds: books.map((b) => b.id) });
      downloadRecipeBundle(bundle, `dietledger-recipes-${new Date().toISOString().slice(0, 10)}.dietledger-bundle.json`);
      await getApiClient().deleteMyAccount(delAccPw, needSuccessor ? delAccSucc : undefined);
      logout();
      router.replace('/');
    } catch (e) {
      setDelAccErr(e instanceof Error ? e.message : 'Failed to delete account');
    } finally { setDelAccBusy(false); }
  };

  if (!user?.isAdmin) {
    return <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10"><p className="text-sm text-stone-500">Administrator access required.</p></main>;
  }

  const TabBtn = ({ id, label, icon: Icon }: { id: TabKey; label: string; icon: typeof Settings }) => (
    <button
      onClick={() => setTab(id)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
        tab === id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-stone-600 hover:bg-stone-100'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />{label}
    </button>
  );

  return (
    <main className="flex-1 w-full mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>
      <div className="flex flex-col md:flex-row gap-6">
        <nav className="md:w-52 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {TABS.map((t) => <TabBtn key={t.id} {...t} />)}
          </div>
        </nav>

        <div className="flex-1 min-w-0 max-w-3xl">
          {/* GENERAL */}
          {tab === 'general' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><Key className="w-4 h-4 text-brand-600" />USDA FoodData Central API Key</CardTitle>
                  <p className="text-xs text-stone-400">For live food search. Without your own key you&apos;re limited to 50/day with the demo key.</p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input type="password" placeholder="Enter your API key..." value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className="flex-1 text-sm" />
                    <Button onClick={handleSaveApiKey} disabled={!apiKeyInput.trim() || setFDAKeyMutation.isPending} className="bg-brand-600 hover:bg-brand-700 gap-1" size="sm">
                      {apiKeySaved ? (<><Check className="w-3.5 h-3.5" />Saved</>) : setFDAKeyMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                  {apiKeyError && <p className="text-xs text-red-600 mt-2">{apiKeyError}</p>}
                  {apiKey === 'DEMO_KEY' && <p className="text-xs text-amber-600 mt-2">Currently using the demo key (rate-limited).</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Palette className="w-4 h-4 text-brand-600" />Theme</CardTitle></CardHeader>
                <CardContent>
                  <Select value={themeId} onValueChange={setTheme}>
                    <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {themes.map((t) => (<SelectItem key={t.id} value={t.id}><span>{t.name} <span className="text-stone-400 text-xs">— {t.description}</span></span></SelectItem>))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><User className="w-4 h-4 text-brand-600" />Account</CardTitle></CardHeader>
                <CardContent className="text-sm text-stone-600 space-y-1">
                  <p>Signed in as <span className="font-medium text-stone-800">{user.displayName || user.email}</span>{user.isAdmin && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">admin</span>}</p>
                  <p className="text-xs text-stone-400">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-stone-400 pt-2">DietLedger build v{process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* MEAL TIMES */}
          {tab === 'mealtimes' && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-brand-600" />Default Meal Times</CardTitle>
                  <button onClick={() => appSettings && updateSettingsMutation.mutate({ defaultMealSlotTimes: { ...DEFAULT_MEAL_SLOT_TIMES }, unitSystem: appSettings.unitSystem, theme: appSettings.theme })} className="text-xs text-stone-500 hover:text-brand-600">Reset to Defaults</button>
                </div>
                <p className="text-xs text-stone-400">Used when creating new meal plans. Individual plans can override these.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {SLOT_ORDER.map((slot) => (
                    <div key={slot} className="flex items-center justify-between">
                      <span className="text-sm text-stone-600">{SLOT_LABELS[slot]}</span>
                      <input type="time" value={defaultMealSlotTimes[slot] || DEFAULT_MEAL_SLOT_TIMES[slot]}
                        onChange={(e) => appSettings && updateSingleSlotTimeMutation.mutate({ slot, time: e.target.value, currentTimes: defaultMealSlotTimes, unitSystem: appSettings.unitSystem, theme: appSettings.theme })}
                        className="h-8 w-32 px-2 text-sm border border-stone-200 rounded-md bg-transparent focus:outline-none focus:border-brand-400" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* PANEL TABS */}
          {tab === 'food' && <FoodDatabasePanel />}
          {tab === 'categories' && <CategoriesPanel />}
          {tab === 'staples' && <PantryStaplesPanel />}
          {tab === 'customfoods' && <CustomFoodsPanel />}
          {tab === 'location' && <LocationPanel />}

          {/* TEMPLATES */}
          {tab === 'templates' && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><LayoutTemplate className="w-4 h-4 text-brand-600" />Templates</CardTitle>
                <p className="text-xs text-stone-400">Manage render templates for recipes and books.</p>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="gap-1" onClick={() => router.push('/settings/templates')}><LayoutTemplate className="w-3.5 h-3.5" />Manage Templates</Button>
              </CardContent>
            </Card>
          )}

          {/* DATA */}
          {tab === 'data' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Download className="w-4 h-4 text-brand-600" />Recipe Bundle Export / Import</CardTitle>
                  <p className="text-xs text-stone-400">Export or import DietLedger-native recipe/cookbook bundles.</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Button size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1" onClick={() => router.push('/export')} disabled={exporting}>
                      <Download className="w-3.5 h-3.5" />Export
                    </Button>
                    <label className="inline-flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-md border border-stone-200 hover:bg-stone-50 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />{importing ? 'Importing...' : 'Import'}
                      <input type="file" accept=".json,application/json" className="hidden" onChange={handleImport} disabled={importing} />
                    </label>
                  </div>
                  {importStatus && <p className={`text-xs mt-2 ${importStatus.startsWith('Imported') ? 'text-green-600' : 'text-red-600'}`}>{importStatus}</p>}
                </CardContent>
              </Card>

              <Card className="border-red-200">
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700"><AlertTriangle className="w-4 h-4" />Account Deletion</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-700">Delete my data</p>
                      <p className="text-xs text-stone-400 mt-0.5">Permanently deletes all your content. Keeps your account, settings, and global data.</p>
                    </div>
                    <ConfirmWithPasswordDialog
                      title="Delete all your data?"
                      description="This permanently deletes ALL of your content (recipes, books, plans, profiles, etc.). Your account and settings remain. Cannot be undone."
                      confirmLabel="Delete data" destructive
                      trigger={<Button variant="outline" size="sm" className="gap-1 shrink-0 border-red-200 text-red-700 hover:bg-red-50"><RotateCcw className="w-3.5 h-3.5" />Delete data</Button>}
                      action={async (password) => {
                        try { await getApiClient().deleteMyData(password); qc.clear(); return { ok: true }; }
                        catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Failed' }; }
                      }}
                    />
                  </div>
                  <div className="border-t border-stone-100 pt-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-700">Delete my account</p>
                      <p className="text-xs text-stone-400 mt-0.5">Downloads a backup zip, then deletes your account and all its data.</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1 shrink-0 border-red-200 text-red-700 hover:bg-red-50" onClick={() => { setDelAccOpen(true); setDelAccPw(''); setDelAccSucc(''); setDelAccErr(''); }}>
                      <Trash2 className="w-3.5 h-3.5" />Delete account
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* API KEYS */}
          {tab === 'apikeys' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Key className="w-4 h-4 text-brand-600" />Developer API Keys</CardTitle>
                    <Button size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1 h-8" onClick={() => { setCreatedKey(null); setDialogOpen(true); }}><Plus className="w-3.5 h-3.5" />Generate Key</Button>
                  </div>
                  <p className="text-xs text-stone-400">Scoped keys for AI assistants and external tools.</p>
                </CardHeader>
                <CardContent>
                  {keys.length === 0 ? (
                    <div className="text-center py-6 text-stone-400"><Key className="w-8 h-8 mx-auto mb-2 text-stone-300" /><p className="text-sm">No API keys yet</p></div>
                  ) : (
                    <div className="space-y-2">
                      {keys.map((k) => (
                        <div key={k.id} className="p-3 border border-stone-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-stone-900">{k.name}</p>
                              <p className="text-xs text-stone-400 font-mono mt-0.5">{k.keyPrefix}...</p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {Object.entries(k.permissions).map(([feat, actions]) => (
                                  <span key={feat} className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">{feat}:{actions.join(',')}</span>
                                ))}
                              </div>
                              <p className="text-[10px] text-stone-300 mt-1">Created {new Date(k.createdAt).toLocaleDateString()}{k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}</p>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-destructive" onClick={() => handleDeleteKey(k.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-brand-600" />Encrypted User Secrets</CardTitle>
                  <p className="text-xs text-stone-400">Store per-user API tokens and integration secrets encrypted on the server. Values are hidden until revealed.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 md:grid-cols-[1fr_1.2fr_auto]">
                    <Input placeholder="Secret name, e.g. fda-api-key" value={secretKeyName} onChange={(e) => setSecretKeyName(e.target.value)} className="text-sm" />
                    <Input type="password" placeholder="Secret value" value={secretValue} onChange={(e) => setSecretValue(e.target.value)} className="text-sm" />
                    <Button size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1" onClick={handleSaveSecret} disabled={!secretKeyName.trim() || !secretValue || createSecretMutation.isPending}>
                      {createSecretMutation.isPending ? 'Saving…' : <><Plus className="w-3.5 h-3.5" />Save Secret</>}
                    </Button>
                  </div>
                  {secretError && <p className="text-xs text-red-600">{secretError}</p>}
                  {secrets.length === 0 ? (
                    <div className="text-center py-6 text-stone-400"><ShieldCheck className="w-8 h-8 mx-auto mb-2 text-stone-300" /><p className="text-sm">No encrypted secrets yet</p></div>
                  ) : (
                    <div className="space-y-2">
                      {secrets.map((secret) => (
                        <div key={secret.id} className="p-3 border border-stone-200 rounded-lg">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-stone-900">{secret.keyName}</p>
                              <p className="text-xs text-stone-400 font-mono mt-0.5 break-all">
                                {secretVisible[secret.id] ? secretValues[secret.id] : '••••••••••••••••'}
                              </p>
                              <p className="text-[10px] text-stone-300 mt-1">Updated {secret.updatedAt ? new Date(secret.updatedAt).toLocaleString() : 'recently'}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-stone-500" onClick={() => handleToggleSecret(secret.id)}>
                                {secretVisible[secret.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span className="sr-only">{secretVisible[secret.id] ? 'Hide' : 'Reveal'} secret</span>
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-destructive" onClick={() => handleDeleteSecret(secret.id)} disabled={deleteSecretMutation.isPending}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ADMINISTRATION */}
          {tab === 'admin' && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-brand-600" />Administration</CardTitle>
                <p className="text-xs text-stone-400">Instance-wide controls.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-700">Allow new account registration</p>
                    <p className="text-xs text-stone-400 mt-0.5">When off, only the administrator can create accounts.</p>
                  </div>
                  <Switch checked={instance?.registrationEnabled ?? false} disabled={setRegistration.isPending || !instance} onCheckedChange={(v) => setRegistration.mutate(v)} />
                </div>
                <div className="border-t border-stone-100 pt-4">
                  <p className="text-sm font-medium text-stone-700">Starter data</p>
                  <p className="text-xs text-stone-400 mt-0.5">Starter cookbook seeding is being replaced by the server-side recipe bundle pipeline.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* DANGER ZONE */}
          {tab === 'danger' && (
            <Card className="border-red-200">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700"><AlertTriangle className="w-4 h-4" />Danger Zone</CardTitle>
                <p className="text-xs text-stone-400">Instance-wide, irreversible. Each requires your admin password.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-700">Reset user data (all users)</p>
                    <p className="text-xs text-stone-400 mt-0.5">Deletes all content across the instance. Keeps accounts, settings, USDA data.</p>
                  </div>
                  <ConfirmWithPasswordDialog
                    title="Reset all user data?" description="Permanently deletes ALL user-generated content across the instance. Accounts, settings, and USDA data are kept. Cannot be undone."
                    confirmLabel="Reset data" destructive
                    trigger={<Button variant="outline" size="sm" className="gap-1 shrink-0 border-red-200 text-red-700 hover:bg-red-50"><RotateCcw className="w-3.5 h-3.5" />Reset data</Button>}
                    action={async (password) => { try { await getApiClient().resetUserData(password); qc.clear(); return { ok: true }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Failed' }; } }}
                  />
                </div>
                <div className="border-t border-stone-100 pt-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-700">Factory reset</p>
                    <p className="text-xs text-stone-400 mt-0.5">Wipes everything (data, accounts, settings) and re-runs setup. USDA data preserved.</p>
                  </div>
                  <ConfirmWithPasswordDialog
                    title="Reset to factory defaults?" description="Deletes EVERYTHING and returns the instance to setup state. You will be signed out. Cannot be undone."
                    confirmLabel="Factory reset" destructive
                    trigger={<Button variant="outline" size="sm" className="gap-1 shrink-0 border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" />Factory reset</Button>}
                    action={async (password) => { try { await getApiClient().factoryReset(password); logout(); router.replace('/'); return { ok: true }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Failed' }; } }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Generate API key dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[80vh]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="w-4 h-4 text-brand-600" />{createdKey ? 'API Key Created' : 'Generate API Key'}</DialogTitle></DialogHeader>
          {createdKey ? (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 font-medium mb-2">Copy this key now. You won&apos;t see it again.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white p-2 rounded border border-amber-200 break-all font-mono">{createdKey}</code>
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { navigator.clipboard.writeText(createdKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <Button className="w-full" onClick={() => setDialogOpen(false)}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div><Label className="text-xs">Key Name</Label><Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., Claude Desktop" className="h-9 mt-1" /></div>
              <div>
                <Label className="text-xs mb-2 block">Permissions</Label>
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-3">
                    {FEATURES.map((f) => (
                      <div key={f.key} className="flex items-center justify-between p-2 rounded-md hover:bg-stone-50">
                        <div><p className="text-sm font-medium text-stone-700">{f.label}</p><p className="text-[11px] text-stone-400">{f.description}</p></div>
                        <div className="flex items-center gap-3">
                          {(['read', 'write'] as const).map((action) => (
                            <div key={action} className="flex items-center gap-1.5">
                              <Checkbox id={`${f.key}-${action}`} checked={newKeyPerms[f.key][action]} onCheckedChange={() => togglePerm(f.key, action)} />
                              <Label htmlFor={`${f.key}-${action}`} className="text-xs cursor-pointer capitalize">{action}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button className="bg-brand-600 hover:bg-brand-700" onClick={handleCreateKey} disabled={!newKeyName.trim()}>Generate</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete account dialog (backup → delete → logout; successor if last admin) */}
      <Dialog open={delAccOpen} onOpenChange={setDelAccOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="w-4 h-4" />Delete my account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-stone-500">A backup zip will be downloaded first, then your account and all its data will be permanently deleted. You will be signed out.</p>
            {needSuccessor && (
              <div className="space-y-1.5">
                <Label className="text-xs">Successor administrator (required — you are the only admin)</Label>
                <Select value={delAccSucc} onValueChange={setDelAccSucc}>
                  <SelectTrigger><SelectValue placeholder="Choose a user to promote…" /></SelectTrigger>
                  <SelectContent>
                    {users.filter((u) => u.id !== user.id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.displayName || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Admin password</Label>
              <Input type="password" value={delAccPw} onChange={(e) => setDelAccPw(e.target.value)} autoFocus disabled={delAccBusy} onKeyDown={(e) => { if (e.key === 'Enter') submitDeleteAccount(); }} />
              {delAccErr && <p className="text-xs text-red-600">{delAccErr}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDelAccOpen(false)} disabled={delAccBusy}>Cancel</Button>
              <Button size="sm" className="bg-destructive text-white hover:bg-destructive/90" disabled={delAccBusy} onClick={submitDeleteAccount}>
                {delAccBusy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Delete account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

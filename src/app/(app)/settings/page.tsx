'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppSettingsStore } from '@/lib/app-settings-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Clock, Key, Plus, Trash2, Copy, Check, Download, Upload, AlertTriangle } from 'lucide-react';
import { DEFAULT_MEAL_SLOT_TIMES, type DaySlot } from '@/lib/types';
import { getAllStoreData, putStoreData } from '@/lib/storage';

const SLOT_LABELS: Record<DaySlot, string> = {
  morning: 'Morning',
  midMorning: 'Mid-Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
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

interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: Record<string, string[]>;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const { defaultMealSlotTimes, fetchSettings, updateSingleSlotTime } = useAppSettingsStore();

  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState<Record<FeatureKey, { read: boolean; write: boolean }>>({
    recipes: { read: true, write: true },
    books: { read: true, write: true },
    mealPlans: { read: true, write: true },
    nutrition: { read: true, write: false },
    foods: { read: true, write: false },
    categories: { read: true, write: false },
    customFoods: { read: true, write: true },
  });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const json = await res.json();
        console.log('[Settings] /api/keys response:', JSON.stringify(json).substring(0, 500));
        const data = json.data ?? json;
        if (!Array.isArray(data)) {
          console.error('[Settings] keys is not an array:', typeof data, data);
          setKeys([]);
          return;
        }
        setKeys(data);
      } else {
        console.warn('[Settings] /api/keys returned', res.status);
        setKeys([]);
      }
    } catch (e) {
      console.error('[Settings] loadKeys error:', e);
      setKeys([]);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleResetDefaults = () => {
    useAppSettingsStore.getState().updateDefaultMealSlotTimes({ ...DEFAULT_MEAL_SLOT_TIMES });
  };

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
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), permissions: JSON.stringify(permissions) }),
      });
      if (res.ok) {
        const json = await res.json();
        setCreatedKey(json.data?.key ?? json.key);
        setNewKeyName('');
        loadKeys();
      }
    } catch {}
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      loadKeys();
    } catch {}
  };

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const DATA_STORES = [
    'customFoods', 'nutritionProfiles', 'foodLogEntries', 'weightEntries',
    'mealPlans', 'dayPlanEntries', 'mealGroups', 'groceryChecklists',
    'recipes', 'books', 'chapters', 'chapterRecipes', 'chapterPages',
    'categories', 'recipeCategories', 'dietaryProfiles', 'allergenRules',
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      const data: Record<string, unknown[]> = {};
      for (const store of DATA_STORES) {
        data[store] = await getAllStoreData(store);
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dietledger-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Record<string, unknown[]>;
      let total = 0;
      for (const [store, records] of Object.entries(data)) {
        if (DATA_STORES.includes(store) && Array.isArray(records) && records.length > 0) {
          await putStoreData(store, records);
          total += records.length;
        }
      }
      setImportStatus(`Imported ${total} records from ${Object.keys(data).filter(k => DATA_STORES.includes(k) && Array.isArray(data[k]) && data[k].length > 0).length} stores`);
    } catch (err) {
      setImportStatus(`Import failed: ${err instanceof Error ? err.message : 'Invalid file'}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const togglePerm = (feat: FeatureKey, action: 'read' | 'write') => {
    setNewKeyPerms(prev => ({
      ...prev,
      [feat]: { ...prev[feat], [action]: !prev[feat][action] },
    }));
  };

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-600" />
              Default Meal Times
            </CardTitle>
            <button onClick={handleResetDefaults} className="text-xs text-stone-500 hover:text-brand-600 transition-colors">
              Reset to Defaults
            </button>
          </div>
          <p className="text-xs text-stone-400">
            These default times are used when creating new meal plans. Individual meal plans can override these.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {SLOT_ORDER.map((slot) => (
              <div key={slot} className="flex items-center justify-between">
                <span className="text-sm text-stone-600">{SLOT_LABELS[slot]}</span>
                <input
                  type="time"
                  value={defaultMealSlotTimes[slot] || DEFAULT_MEAL_SLOT_TIMES[slot]}
                  onChange={(e) => updateSingleSlotTime(slot, e.target.value)}
                  className="h-8 w-32 px-2 text-sm border border-stone-200 rounded-md bg-transparent focus:outline-none focus:border-brand-400"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Key className="w-4 h-4 text-brand-600" />
              API Keys
            </CardTitle>
            <Button size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1 h-8" onClick={() => { setCreatedKey(null); setDialogOpen(true); }}>
              <Plus className="w-3.5 h-3.5" />Generate Key
            </Button>
          </div>
          <p className="text-xs text-stone-400">
            API keys allow AI assistants and external tools to access your data with configurable permissions.
          </p>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-6 text-stone-400">
              <Key className="w-8 h-8 mx-auto mb-2 text-stone-300" />
              <p className="text-sm">No API keys yet</p>
              <p className="text-xs mt-1">Generate a key to give AI assistants read access to your data</p>
            </div>
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
                          <span key={feat} className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
                            {feat}:{actions.join(',')}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-stone-300 mt-1">
                        Created {new Date(k.createdAt).toLocaleDateString()}
                        {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-destructive" onClick={() => handleDeleteKey(k.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Download className="w-4 h-4 text-brand-600" />
            Data Export / Import
          </CardTitle>
          <p className="text-xs text-stone-400">
            Export all your data as a JSON file to transfer between devices or back up. Import merges data into the current device.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1 h-8" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting...' : <><Download className="w-3.5 h-3.5" />Export All Data</>}
            </Button>
            <label className="inline-flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-md border border-stone-200 hover:bg-stone-50 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              {importing ? 'Importing...' : 'Import Data'}
              <input type="file" accept=".json" className="hidden" onChange={handleImport} disabled={importing} />
            </label>
          </div>
          {importStatus && (
            <p className={`text-xs mt-2 flex items-center gap-1 ${importStatus.startsWith('Imported') ? 'text-green-600' : 'text-red-600'}`}>
              {importStatus.startsWith('Imported') ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {importStatus}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-4 h-4 text-brand-600" />
              {createdKey ? 'API Key Created' : 'Generate API Key'}
            </DialogTitle>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 font-medium mb-2">Copy this key now. You won't be able to see it again.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white p-2 rounded border border-amber-200 break-all font-mono">{createdKey}</code>
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={copyKey}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <Button className="w-full" onClick={() => setDialogOpen(false)}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Key Name</Label>
                <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., Claude Desktop" className="h-9 mt-1" />
              </div>
              <div>
                <Label className="text-xs mb-2 block">Permissions</Label>
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-3">
                    {FEATURES.map((f) => (
                      <div key={f.key} className="flex items-center justify-between p-2 rounded-md hover:bg-stone-50">
                        <div>
                          <p className="text-sm font-medium text-stone-700">{f.label}</p>
                          <p className="text-[11px] text-stone-400">{f.description}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`${f.key}-read`}
                              checked={newKeyPerms[f.key].read}
                              onCheckedChange={() => togglePerm(f.key, 'read')}
                            />
                            <Label htmlFor={`${f.key}-read`} className="text-xs cursor-pointer">Read</Label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`${f.key}-write`}
                              checked={newKeyPerms[f.key].write}
                              onCheckedChange={() => togglePerm(f.key, 'write')}
                            />
                            <Label htmlFor={`${f.key}-write`} className="text-xs cursor-pointer">Write</Label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button className="bg-brand-600 hover:bg-brand-700" onClick={handleCreateKey} disabled={!newKeyName.trim()}>Generate</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

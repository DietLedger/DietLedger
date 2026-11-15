'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRecipes } from '@/hooks/use-recipes';
import { useBooks } from '@/hooks/use-books';
import { useFDAKey, useSetFDAKey } from '@/hooks/use-secrets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChefHat,
  BookOpen,
  UtensilsCrossed,
  Settings,
  HardDrive,
  Key,
  Check,
  Wifi,
  WifiOff,
  ScanBarcode,
  Salad,
  Database,
  FolderOpen,
  LayoutTemplate,
  Package,
  MapPin,
  Activity,
  Palette,
  Plus,
  LogOut,
  Weight,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import FoodDatabasePanel from '@/components/food-database-panel';
import CategoriesPanel from '@/components/categories-panel';
import PantryStaplesPanel from '@/components/pantry-staples-panel';
import LocationPanel from '@/components/location-panel';
import CustomFoodsPanel from '@/components/custom-foods-panel';
import { LogWeightDialog } from '@/components/nutrition/log-weight-dialog';
import { ConfirmWithPasswordDialog } from '@/components/confirm-with-password-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useAppTheme } from '@/hooks/use-app-theme';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { downloadRecipeBundle, summarizeRecipeBundleImport } from '@/lib/recipe-bundles';
import { useRecipeImport } from '@/components/recipe/recipe-import-workflow';

const NAV_ITEMS = [
  { href: '/recipes', label: 'Recipes', icon: Salad },
  { href: '/books', label: 'Books', icon: BookOpen },
  { href: '/meal-plans', label: 'Meal Plans', icon: UtensilsCrossed },
  { href: '/kitchen-helper', label: 'Kitchen Helper', icon: ChefHat },
  { href: '/nutrition', label: 'Nutrition', icon: Activity },
  { href: '/nutrition?action=addfood', label: 'Add Food', icon: Plus },
  { href: '/export', label: 'Export', icon: Download },
] as const;

export default function AppNav() {
  const { importFile, decisionDialog } = useRecipeImport();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: apiKey = 'DEMO_KEY' } = useFDAKey();
  const setFDAKeyMutation = useSetFDAKey();
  const { data: recipes = [] } = useRecipes();
  const { data: books = [] } = useBooks();
  const { user, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logWeightOpen, setLogWeightOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [dataStatus, setDataStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [dataBusy, setDataBusy] = useState(false);
  const { themeId, setTheme, themes, mounted: themeMounted } = useAppTheme();

  const handleSaveApiKey = useCallback(() => {
    setFDAKeyMutation.mutate(apiKeyInput);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  }, [apiKeyInput, setFDAKeyMutation]);

  const handleDataExport = useCallback(async () => {
    setDataBusy(true); setDataStatus(null);
    try {
      const bundle = await getApiClient().exportRecipeBundle({ recipeIds: recipes.map((r) => r.id), bookIds: books.map((b) => b.id) });
      downloadRecipeBundle(bundle, `dietledger-recipes-${new Date().toISOString().slice(0, 10)}.dietledger-bundle.json`);
    }
    catch (e) { setDataStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Export failed' }); }
    finally { setDataBusy(false); }
  }, [recipes, books]);

  const handleDataImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDataBusy(true); setDataStatus(null);
    try {
      const result = await importFile(file);
      setDataStatus({ kind: 'ok', msg: summarizeRecipeBundleImport(result) });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
    } catch (e) { setDataStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Import failed' }); }
    finally { setDataBusy(false); e.target.value = ''; }
  }, [queryClient, importFile]);

  function getActiveSection(pathname: string): string | null {
    for (const item of NAV_ITEMS) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        return item.href;
      }
    }
    return null;
  }

  const activeSection = getActiveSection(pathname);

  return (
    <header className="border-b bg-white shadow-sm">
      {decisionDialog}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <img src="/logo.svg" alt="DietLedger" className="w-9 h-9" />
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">DietLedger</h1>
          </div>
        </Link>

        <nav className="flex items-center gap-1 ml-6">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = activeSection === href;
            return (
              <Link key={href} href={href}>
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  className={`h-8 gap-1.5 text-xs ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                      : 'text-stone-500 hover:text-brand-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs text-brand-700 border-brand-200 hover:bg-brand-50"
            onClick={() => setLogWeightOpen(true)}
          >
            <Weight className="w-3.5 h-3.5" />
            Log Weight
          </Button>
          <Badge variant="secondary" className="text-xs gap-1">
            <HardDrive className="w-3 h-3" />Local Storage
          </Badge>
          <Badge
            variant={apiKey === 'DEMO_KEY' ? 'outline' : 'secondary'}
            className={`text-xs gap-1 ${apiKey !== 'DEMO_KEY' ? 'bg-brand-100 text-brand-700 border-brand-200' : ''}`}
          >
            {apiKey === 'DEMO_KEY' ? (
              <><WifiOff className="w-3 h-3" />Demo Key</>
            ) : (
              <><Wifi className="w-3 h-3" />API Key Set</>
            )}
          </Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-stone-400" disabled>
                  <ScanBarcode className="w-4 h-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Barcode Scanner</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-stone-400 hover:text-red-500" onClick={logout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign Out</TooltipContent>
          </Tooltip>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-stone-400 hover:text-stone-600"
            title="Settings"
            onClick={() => (user?.isAdmin ? router.push('/settings') : setSettingsOpen(true))}
          >
            <Settings className="w-4 h-4" />
          </Button>

          <Dialog open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (open) { setApiKeyInput(apiKey); setApiKeySaved(false); } }}>
            <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand-600" />Settings
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="general" className="mt-2 flex flex-col min-h-0 flex-1 overflow-hidden">
                <TabsList className="w-full justify-start shrink-0 flex-wrap h-auto">
                  <TabsTrigger value="general" className="text-xs gap-1"><Settings className="w-3 h-3" />General</TabsTrigger>
                  {user?.isAdmin && (
                    <TabsTrigger value="food-database" className="text-xs gap-1"><Database className="w-3 h-3" />Food Database</TabsTrigger>
                  )}
                  <TabsTrigger value="categories" className="text-xs gap-1"><FolderOpen className="w-3 h-3" />Categories</TabsTrigger>
                  <TabsTrigger value="staples" className="text-xs gap-1"><Package className="w-3 h-3" />Staples</TabsTrigger>
                  <TabsTrigger value="custom-foods" className="text-xs gap-1"><Package className="w-3 h-3" />Custom Foods</TabsTrigger>
                  <TabsTrigger value="location" className="text-xs gap-1"><MapPin className="w-3 h-3" />Location</TabsTrigger>
                  <TabsTrigger value="templates" className="text-xs gap-1"><LayoutTemplate className="w-3 h-3" />Templates</TabsTrigger>
                  <TabsTrigger value="data" className="text-xs gap-1"><Download className="w-3 h-3" />Data</TabsTrigger>
                </TabsList>
                <div className="flex-1 min-h-0 overflow-y-auto mt-4">
                <TabsContent value="general" className="mt-0">
                  <div className="space-y-5">
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-2 mb-2">
                        <Key className="w-3.5 h-3.5 text-brand-600" />USDA FoodData Central API Key
                      </label>
                      <p className="text-xs text-stone-400 mb-3">
                        Required for live food search. Get a free key at{' '}
                        <a href="https://api.data.gov/signup/" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline hover:text-brand-700">api.data.gov</a>.
                        Without your own key, you&apos;re limited to 50 searches/day with the demo key.
                      </p>
                      <div className="flex gap-2">
                        <Input type="password" placeholder="Enter your API key..." value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className="flex-1 text-sm" />
                        <Button onClick={handleSaveApiKey} className="bg-brand-600 hover:bg-brand-700 gap-1" size="sm">
                          {apiKeySaved ? (<><Check className="w-3.5 h-3.5" />Saved</>) : 'Save'}
                        </Button>
                      </div>
                      {apiKey === 'DEMO_KEY' && (
                        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                          <WifiOff className="w-3 h-3" />Currently using demo key (rate-limited to 50 requests/day)
                        </p>
                      )}
                    </div>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-2 mb-2">
                        <Palette className="w-3.5 h-3.5 text-brand-600" />Theme
                      </label>
                      <p className="text-xs text-stone-400 mb-3">
                        Choose a color palette for the app interface. Dark mode uses a matching dark variant.
                      </p>
                      <Select value={themeId} onValueChange={setTheme}>
                        <SelectTrigger className="w-full text-sm">
                          <SelectValue placeholder="Select theme..." />
                        </SelectTrigger>
                        <SelectContent>
                          {themes.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <span className="flex items-center gap-2">
                                <span>{t.name}</span>
                                <span className="text-stone-400 text-xs">— {t.description}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {themeMounted && (
                        <div className="mt-3 flex gap-1.5">
                          {(() => {
                            const vars = document.documentElement.classList.contains('dark')
                              ? themes.find(t => t.id === themeId)?.dark || themes[0].dark
                              : themes.find(t => t.id === themeId)?.light || themes[0].light;
                            const swatches = ['--brand-600', '--brand-100', '--background', '--foreground', '--brand-400'];
                            return swatches.map((v) => (
                              <span
                                key={v}
                                className="w-6 h-6 rounded-full border border-stone-200"
                                style={{ backgroundColor: vars[v] || '#888' }}
                              />
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-2 mb-2">
                        <HardDrive className="w-3.5 h-3.5 text-brand-600" />Account
                      </label>
                      <p className="text-xs text-stone-400">
                        Signed in as <span className="text-stone-600 font-medium">{user?.displayName || user?.email}</span>
                      </p>
                      <div className="mt-2 p-2 bg-stone-50 rounded-md text-xs text-stone-500">
                        {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <Separator />
                     <div className="text-xs text-stone-400">
                        <p className="font-medium text-stone-500 mb-1">About DietLedger</p>
                        <p>A fully standalone recipe tool that generates standard nutrition labels.</p>
                         <p className="mt-1">Build: v{process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}</p>
                      </div>
                  </div>
                </TabsContent>
                <TabsContent value="food-database" className="mt-4">
                  <FoodDatabasePanel />
                </TabsContent>
                <TabsContent value="categories" className="mt-4">
                  <CategoriesPanel readOnly />
                </TabsContent>
                <TabsContent value="staples" className="mt-4">
                  <PantryStaplesPanel />
                </TabsContent>
                <TabsContent value="custom-foods" className="mt-4">
                  <CustomFoodsPanel />
                </TabsContent>
                <TabsContent value="location" className="mt-4">
                  <LocationPanel />
                </TabsContent>
                <TabsContent value="templates" className="mt-4">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-2 mb-2">
                        <LayoutTemplate className="w-3.5 h-3.5 text-brand-600" />Templates
                      </label>
                      <p className="text-xs text-stone-400 mb-3">
                        Manage render templates for recipes and books. Templates control layout, section visibility, styling, and page sizing.
                      </p>
                      <Button
                        variant="outline"
                        className="gap-1"
                        onClick={() => { setSettingsOpen(false); router.push('/settings/templates'); }}
                      >
                        <LayoutTemplate className="w-3.5 h-3.5" />Manage Templates
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="data" className="mt-4">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-stone-700 flex items-center gap-2 mb-1">
                        <Download className="w-3.5 h-3.5 text-brand-600" />Export / Import
                      </label>
                      <p className="text-xs text-stone-400 mb-3">Export or import DietLedger-native recipe/cookbook bundles.</p>
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1" onClick={() => { setSettingsOpen(false); router.push('/export'); }} disabled={dataBusy}>
                          <Download className="w-3.5 h-3.5" />Export
                        </Button>
                        <label className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md border border-stone-200 hover:bg-stone-50 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />Import
                          <input type="file" accept=".json,application/json" className="hidden" onChange={handleDataImport} disabled={dataBusy} />
                        </label>
                      </div>
                    </div>

                    <div className="border-t border-stone-100 pt-4">
                      <p className="text-sm font-medium text-red-700 flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5" />Danger Zone
                      </p>
                      <p className="text-xs text-stone-400 mb-3">Irreversible. Each requires your password.</p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-stone-600">Delete my data<br /><span className="text-stone-400">Removes all your content; keeps your account.</span></p>
                          <ConfirmWithPasswordDialog
                            title="Delete all your data?"
                            description="Permanently deletes ALL of your content (recipes, books, plans, profiles, etc.). Your account and settings remain. Cannot be undone."
                            confirmLabel="Delete data" destructive
                            trigger={<Button size="sm" variant="outline" className="gap-1 border-red-200 text-red-700 hover:bg-red-50"><RotateCcw className="w-3.5 h-3.5" />Delete data</Button>}
                            action={async (password) => {
                              try { await getApiClient().deleteMyData(password); window.location.reload(); return { ok: true }; }
                              catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Failed' }; }
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-stone-600">Delete my account<br /><span className="text-stone-400">Initiates a recipe/book JSON backup download, then deletes your account and all its data.</span></p>
                          <ConfirmWithPasswordDialog
                            title="Delete your account?"
                            description="A recipe/book JSON backup download will be initiated first, then your account and all its data will be permanently deleted. This is not a full-account backup: profiles, food logs, weights and meal plans are not included. The browser cannot confirm the file was saved to disk. You will be signed out. Cannot be undone."
                            confirmLabel="Delete account" destructive
                            trigger={<Button size="sm" variant="outline" className="gap-1 border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" />Delete account</Button>}
                            action={async (password) => {
                              try {
                                const bundle = await getApiClient().exportOwnerRecipeBookBackup();
                                await downloadRecipeBundle(bundle, `dietledger-recipes-${new Date().toISOString().slice(0, 10)}.dietledger-bundle.json`);
                                await getApiClient().deleteMyAccount(password);
                                logout();
                                router.replace('/');
                                return { ok: true };
                              } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Failed' }; }
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {dataStatus && (
                      <p className={`text-xs ${dataStatus.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{dataStatus.msg} {dataStatus.msg.includes('quarantined') && <Link href="/recipes/quarantine" className="underline">Open quarantine</Link>}</p>
                    )}
                  </div>
                </TabsContent>
                </div>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <LogWeightDialog open={logWeightOpen} onOpenChange={setLogWeightOpen} />
    </header>
  );
}

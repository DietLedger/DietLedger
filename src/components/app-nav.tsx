'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRecipeStore } from '@/lib/recipe-store';
import { useRecipes } from '@/hooks/use-recipes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
} from 'lucide-react';
import FoodDatabasePanel from '@/components/food-database-panel';
import CategoriesPanel from '@/components/categories-panel';
import PantryStaplesPanel from '@/components/pantry-staples-panel';
import LocationPanel from '@/components/location-panel';
import CustomFoodsPanel from '@/components/custom-foods-panel';
import { LogWeightDialog } from '@/components/nutrition/log-weight-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useAppTheme } from '@/hooks/use-app-theme';

const NAV_ITEMS = [
  { href: '/recipes', label: 'Recipes', icon: Salad },
  { href: '/books', label: 'Books', icon: BookOpen },
  { href: '/meal-plans', label: 'Meal Plans', icon: UtensilsCrossed },
  { href: '/kitchen-helper', label: 'Kitchen Helper', icon: ChefHat },
  { href: '/nutrition', label: 'Nutrition', icon: Activity },
  { href: '/nutrition?action=addfood', label: 'Add Food', icon: Plus },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { apiKey, setApiKey, loadApiKey } = useRecipeStore();
  const { data: recipes = [] } = useRecipes();
  const { user, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logWeightOpen, setLogWeightOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const { themeId, setTheme, themes, mounted: themeMounted } = useAppTheme();

  useEffect(() => {
    loadApiKey();
  }, [loadApiKey]);

  const handleSaveApiKey = useCallback(() => {
    setApiKey(apiKeyInput);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  }, [apiKeyInput, setApiKey]);

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

          <Dialog open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (open) { setApiKeyInput(apiKey); setApiKeySaved(false); } }}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-stone-400 hover:text-stone-600">
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand-600" />Settings
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="general" className="mt-2 flex flex-col min-h-0 flex-1 overflow-hidden">
                <TabsList className="w-full justify-start shrink-0 flex-wrap h-auto">
                  <TabsTrigger value="general" className="text-xs gap-1"><Settings className="w-3 h-3" />General</TabsTrigger>
                  <TabsTrigger value="food-database" className="text-xs gap-1"><Database className="w-3 h-3" />Food Database</TabsTrigger>
                  <TabsTrigger value="categories" className="text-xs gap-1"><FolderOpen className="w-3 h-3" />Categories</TabsTrigger>
                  <TabsTrigger value="staples" className="text-xs gap-1"><Package className="w-3 h-3" />Staples</TabsTrigger>
                  <TabsTrigger value="custom-foods" className="text-xs gap-1"><Package className="w-3 h-3" />Custom Foods</TabsTrigger>
                  <TabsTrigger value="location" className="text-xs gap-1"><MapPin className="w-3 h-3" />Location</TabsTrigger>
                  <TabsTrigger value="templates" className="text-xs gap-1"><LayoutTemplate className="w-3 h-3" />Templates</TabsTrigger>
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
                  <CategoriesPanel />
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

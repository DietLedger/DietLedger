'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRecipeStore } from '@/lib/recipe-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  RefreshCw,
  ScanBarcode,
  Salad,
  Database,
  FolderOpen,
  LayoutTemplate,
  Package,
  MapPin,
  Activity,
} from 'lucide-react';
import FoodDatabasePanel from '@/components/food-database-panel';
import CategoriesPanel from '@/components/categories-panel';
import PantryStaplesPanel from '@/components/pantry-staples-panel';
import LocationPanel from '@/components/location-panel';
import CustomFoodsPanel from '@/components/custom-foods-panel';

const NAV_ITEMS = [
  { href: '/recipes', label: 'Recipes', icon: Salad },
  { href: '/books', label: 'Books', icon: BookOpen },
  { href: '/meal-plans', label: 'Meal Plans', icon: UtensilsCrossed },
  { href: '/kitchen-helper', label: 'Kitchen Helper', icon: ChefHat },
  { href: '/nutrition', label: 'Nutrition', icon: Activity },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { apiKey, setApiKey, loadApiKey, recipes } = useRecipeStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);

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
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 text-white">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">NutriLabel</h1>
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
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'text-stone-500 hover:text-emerald-700'
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
          <Badge variant="secondary" className="text-xs gap-1">
            <HardDrive className="w-3 h-3" />Local Storage
          </Badge>
          <Badge
            variant={apiKey === 'DEMO_KEY' ? 'outline' : 'secondary'}
            className={`text-xs gap-1 ${apiKey !== 'DEMO_KEY' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}`}
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
              <span>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-stone-400" disabled>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Synchronize</TooltipContent>
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
                  <Settings className="w-4 h-4 text-emerald-600" />Settings
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="general" className="mt-2 flex flex-col min-h-0 flex-1 overflow-hidden">
                <TabsList className="w-full justify-start shrink-0">
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
                        <Key className="w-3.5 h-3.5 text-emerald-600" />USDA FoodData Central API Key
                      </label>
                      <p className="text-xs text-stone-400 mb-3">
                        Required for live food search. Get a free key at{' '}
                        <a href="https://api.data.gov/signup/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline hover:text-emerald-700">api.data.gov</a>.
                        Without your own key, you&apos;re limited to 50 searches/day with the demo key.
                      </p>
                      <div className="flex gap-2">
                        <Input type="password" placeholder="Enter your API key..." value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} className="flex-1 text-sm" />
                        <Button onClick={handleSaveApiKey} className="bg-emerald-600 hover:bg-emerald-700 gap-1" size="sm">
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
                        <HardDrive className="w-3.5 h-3.5 text-emerald-600" />Local Storage
                      </label>
                      <p className="text-xs text-stone-400">
                        All your recipes are stored locally in your browser&apos;s IndexedDB. No data is sent to any server.
                      </p>
                      <div className="mt-2 p-2 bg-stone-50 rounded-md text-xs text-stone-500">
                        {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} stored locally
                      </div>
                    </div>
                    <Separator />
                    <div className="text-xs text-stone-400">
                      <p className="font-medium text-stone-500 mb-1">About NutriLabel</p>
                      <p>A fully standalone recipe tool that generates standard nutrition labels.</p>
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
                        <LayoutTemplate className="w-3.5 h-3.5 text-emerald-600" />Templates
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
    </header>
  );
}

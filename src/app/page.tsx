'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRecipeStore } from '@/lib/recipe-store';
import { type FDAFood, type InstructionStep, type Ingredient, type IngredientGroup, type InstructionGroup, type Recipe } from '@/lib/recipe-store';
import NutritionLabel, { type NutritionData } from '@/components/nutrition-label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Search,
  Trash2,
  ChefHat,
  Salad,
  X,
  Loader2,
  BookOpen,
  UtensilsCrossed,
  Settings,
  HardDrive,
  Key,
  Check,
  Wifi,
  WifiOff,
  Database,
  Pencil,
  GripVertical,
  FolderOpen,
  Link2,
} from 'lucide-react';
import Link from 'next/link';
import { fmt } from '@/lib/format';

type IngredientSlot =
  | { type: 'item'; ingredient: Ingredient }
  | { type: 'group'; group: IngredientGroup; items: Ingredient[] };

type InstructionSlot =
  | { type: 'item'; step: InstructionStep }
  | { type: 'group'; group: InstructionGroup; items: InstructionStep[] };

function computeIngredientSlots(ingredients: Ingredient[], groups: IngredientGroup[]): IngredientSlot[] {
  const slots: IngredientSlot[] = [];
  const renderedGroups = new Set<string>();
  for (const ing of ingredients) {
    if (!ing.groupId) {
      slots.push({ type: 'item', ingredient: ing });
    } else if (!renderedGroups.has(ing.groupId)) {
      renderedGroups.add(ing.groupId);
      const group = groups.find(g => g.id === ing.groupId);
      if (group) {
        const groupItems = ingredients.filter(i => i.groupId === ing.groupId);
        slots.push({ type: 'group', group, items: groupItems });
      } else {
        slots.push({ type: 'item', ingredient: ing });
      }
    }
  }
  return slots;
}

function computeInstructionSlots(steps: InstructionStep[], groups: InstructionGroup[]): InstructionSlot[] {
  const slots: InstructionSlot[] = [];
  const renderedGroups = new Set<string>();
  for (const step of steps) {
    if (!step.groupId) {
      slots.push({ type: 'item', step });
    } else if (!renderedGroups.has(step.groupId)) {
      renderedGroups.add(step.groupId);
      const group = groups.find(g => g.id === step.groupId);
      if (group) {
        const groupItems = steps.filter(s => s.groupId === step.groupId);
        slots.push({ type: 'group', group, items: groupItems });
      } else {
        slots.push({ type: 'item', step });
      }
    }
  }
  return slots;
}

function recipeTotalCalories(ingredients: Ingredient[]): number {
  return ingredients.reduce((sum, i) => sum + i.calories, 0);
}

export default function HomePage() {
  const {
    recipes,
    activeRecipe,
    isSearching,
    searchResults,
    searchSource,
    isLoading,
    apiKey,
    fetchRecipes,
    createRecipe,
    selectRecipe,
    updateRecipe,
    deleteRecipe,
    searchFDA,
    addIngredient,
    addRecipeAsIngredient,
    removeIngredient,
    updateIngredient,
    getTotalNutrition,
    setApiKey,
    loadApiKey,
    reorderIngredients,
    reorderInstructions,
    createIngredientGroup,
    removeIngredientGroup,
    renameIngredientGroup,
    moveIngredientToGroup,
    createInstructionGroup,
    removeInstructionGroup,
    renameInstructionGroup,
    moveInstructionToGroup,
  } = useRecipeStore();

  const [newRecipeName, setNewRecipeName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchTab, setSearchTab] = useState<'fda' | 'recipes'>('fda');
  const [selectedFood, setSelectedFood] = useState<FDAFood | null>(null);
  const [ingredientAmount, setIngredientAmount] = useState('100');
  const [ingredientUnit, setIngredientUnit] = useState('g');
  const [selectedRecipeToAdd, setSelectedRecipeToAdd] = useState<Recipe | null>(null);
  const [recipeMultiplier, setRecipeMultiplier] = useState('1');
  const [editingName, setEditingName] = useState(false);
  const [editingServings, setEditingServings] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [servingsValue, setServingsValue] = useState('');
  const [servingNameValue, setServingNameValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [editIngredientId, setEditIngredientId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editUnit, setEditUnit] = useState('g');
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepText, setStepText] = useState('');
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogTitle, setGroupDialogTitle] = useState('');
  const [groupDialogTargetIds, setGroupDialogTargetIds] = useState<string[]>([]);
  const [groupDialogType, setGroupDialogType] = useState<'ingredient' | 'instruction'>('ingredient');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupTitleValue, setEditingGroupTitleValue] = useState('');
  const [editingGroupType, setEditingGroupType] = useState<'ingredient' | 'instruction'>('ingredient');

  const shiftRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    loadApiKey();
    fetchRecipes();
  }, [loadApiKey, fetchRecipes]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = true; };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleCreateRecipe = useCallback(async () => {
    if (!newRecipeName.trim()) return;
    await createRecipe(newRecipeName.trim());
    setNewRecipeName('');
  }, [newRecipeName, createRecipe]);

  const handleSearchFDA = useCallback(() => {
    if (!searchQuery.trim()) return;
    searchFDA(searchQuery.trim());
  }, [searchQuery, searchFDA]);

  const handleAddIngredient = useCallback(async () => {
    if (!selectedFood || !ingredientAmount) return;
    await addIngredient(selectedFood, parseFloat(ingredientAmount), ingredientUnit);
    setSelectedFood(null);
    setIngredientAmount('100');
    setIngredientUnit('g');
    setSearchDialogOpen(false);
  }, [selectedFood, ingredientAmount, ingredientUnit, addIngredient]);

  const handleAddRecipeAsIngredient = useCallback(async () => {
    if (!selectedRecipeToAdd) return;
    await addRecipeAsIngredient(selectedRecipeToAdd, parseFloat(recipeMultiplier) || 1);
    setSelectedRecipeToAdd(null);
    setRecipeMultiplier('1');
    setSearchDialogOpen(false);
  }, [selectedRecipeToAdd, recipeMultiplier, addRecipeAsIngredient]);

  const handleDeleteRecipe = useCallback(async (id: string) => {
    await deleteRecipe(id);
    setDeleteConfirmId(null);
  }, [deleteRecipe]);

  const handleUpdateName = useCallback(async () => {
    if (!activeRecipe || !nameValue.trim()) {
      setEditingName(false);
      return;
    }
    await updateRecipe({ name: nameValue.trim() });
    setEditingName(false);
  }, [activeRecipe, nameValue, updateRecipe]);

  const handleUpdateServings = useCallback(async () => {
    if (!activeRecipe || !servingsValue) {
      setEditingServings(false);
      return;
    }
    await updateRecipe({ servings: parseInt(servingsValue) || 1, servingName: servingNameValue.trim() || 'serving' });
    setEditingServings(false);
  }, [activeRecipe, servingsValue, servingNameValue, updateRecipe]);

  const handleSaveStep = useCallback(async () => {
    if (!activeRecipe || !stepText.trim()) return;
    const steps = [...activeRecipe.instructionSteps];
    if (editingStepId) {
      const idx = steps.findIndex((s) => s.id === editingStepId);
      if (idx !== -1) steps[idx] = { ...steps[idx], text: stepText.trim() };
    } else {
      steps.push({ id: crypto.randomUUID(), text: stepText.trim(), groupId: null });
    }
    await updateRecipe({ instructionSteps: steps });
    setStepText('');
    setEditingStepId(null);
  }, [activeRecipe, stepText, editingStepId, updateRecipe]);

  const handleDeleteStep = useCallback(async (stepId: string) => {
    if (!activeRecipe) return;
    const steps = activeRecipe.instructionSteps.filter((s) => s.id !== stepId);
    await updateRecipe({ instructionSteps: steps });
    if (editingStepId === stepId) {
      setEditingStepId(null);
      setStepText('');
    }
  }, [activeRecipe, editingStepId, updateRecipe]);

  const handleEditStep = useCallback((step: InstructionStep) => {
    setEditingStepId(step.id);
    setStepText(step.text);
  }, []);

  const handleSaveApiKey = useCallback(() => {
    setApiKey(apiKeyInput);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  }, [apiKeyInput, setApiKey]);

  const handleSaveIngredientEdit = useCallback(async () => {
    if (!editIngredientId || !activeRecipe) return;
    const ingredient = activeRecipe.ingredients.find((i) => i.id === editIngredientId);
    if (!ingredient) return;
    await updateIngredient(editIngredientId, {
      description: editDescription,
      amount: parseFloat(editAmount) || ingredient.amount,
      unit: editUnit,
    });
    setEditIngredientId(null);
  }, [editIngredientId, editDescription, editAmount, editUnit, activeRecipe, updateIngredient]);

  const handleIngredientDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeRecipe) return;

    if (shiftRef.current) {
      setGroupDialogTargetIds([String(active.id), String(over.id)]);
      setGroupDialogType('ingredient');
      setGroupDialogTitle('');
      setGroupDialogOpen(true);
      return;
    }

    const oldIndex = activeRecipe.ingredients.findIndex((i) => i.id === active.id);
    const newIndex = activeRecipe.ingredients.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderIngredients(oldIndex, newIndex);
  }, [activeRecipe, reorderIngredients]);

  const handleInstructionDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeRecipe) return;

    if (shiftRef.current) {
      setGroupDialogTargetIds([String(active.id), String(over.id)]);
      setGroupDialogType('instruction');
      setGroupDialogTitle('');
      setGroupDialogOpen(true);
      return;
    }

    const oldIndex = activeRecipe.instructionSteps.findIndex((s) => s.id === active.id);
    const newIndex = activeRecipe.instructionSteps.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderInstructions(oldIndex, newIndex);
  }, [activeRecipe, reorderInstructions]);

  const toggleIngredientSelect = useCallback((id: string) => {
    setSelectedIngredientIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const toggleStepSelect = useCallback((id: string) => {
    setSelectedStepIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const handleGroupSelectedIngredients = useCallback(() => {
    if (selectedIngredientIds.length < 2) return;
    setGroupDialogTargetIds(selectedIngredientIds);
    setGroupDialogType('ingredient');
    setGroupDialogTitle('');
    setGroupDialogOpen(true);
  }, [selectedIngredientIds]);

  const handleGroupSelectedSteps = useCallback(() => {
    if (selectedStepIds.length < 2) return;
    setGroupDialogTargetIds(selectedStepIds);
    setGroupDialogType('instruction');
    setGroupDialogTitle('');
    setGroupDialogOpen(true);
  }, [selectedStepIds]);

  const handleGroupDialogConfirm = useCallback(async () => {
    if (!groupDialogTitle.trim()) return;
    if (groupDialogType === 'ingredient') {
      await createIngredientGroup(groupDialogTargetIds, groupDialogTitle.trim());
      setSelectedIngredientIds([]);
    } else {
      await createInstructionGroup(groupDialogTargetIds, groupDialogTitle.trim());
      setSelectedStepIds([]);
    }
    setGroupDialogOpen(false);
    setGroupDialogTitle('');
    setGroupDialogTargetIds([]);
  }, [groupDialogTitle, groupDialogType, groupDialogTargetIds, createIngredientGroup, createInstructionGroup]);

  const handleStartEditGroupTitle = useCallback((groupId: string, currentTitle: string, type: 'ingredient' | 'instruction') => {
    setEditingGroupId(groupId);
    setEditingGroupTitleValue(currentTitle);
    setEditingGroupType(type);
  }, []);

  const handleFinishEditGroupTitle = useCallback(async () => {
    if (!editingGroupId || !editingGroupTitleValue.trim()) {
      setEditingGroupId(null);
      return;
    }
    if (editingGroupType === 'ingredient') {
      await renameIngredientGroup(editingGroupId, editingGroupTitleValue.trim());
    } else {
      await renameInstructionGroup(editingGroupId, editingGroupTitleValue.trim());
    }
    setEditingGroupId(null);
  }, [editingGroupId, editingGroupTitleValue, editingGroupType, renameIngredientGroup, renameInstructionGroup]);

  const totalNutrition = getTotalNutrition();

  const nutritionData: NutritionData = {
    servings: activeRecipe?.servings || 1,
    ...totalNutrition,
  };

  const perServingNutrition: NutritionData = {
    servings: activeRecipe?.servings || 1,
    calories: Math.round((totalNutrition.calories / (activeRecipe?.servings || 1)) * 10) / 10,
    totalFat: Math.round((totalNutrition.totalFat / (activeRecipe?.servings || 1)) * 10) / 10,
    saturatedFat: Math.round((totalNutrition.saturatedFat / (activeRecipe?.servings || 1)) * 10) / 10,
    transFat: Math.round((totalNutrition.transFat / (activeRecipe?.servings || 1)) * 10) / 10,
    cholesterol: Math.round((totalNutrition.cholesterol / (activeRecipe?.servings || 1)) * 10) / 10,
    sodium: Math.round((totalNutrition.sodium / (activeRecipe?.servings || 1)) * 10) / 10,
    totalCarbs: Math.round((totalNutrition.totalCarbs / (activeRecipe?.servings || 1)) * 10) / 10,
    dietaryFiber: Math.round((totalNutrition.dietaryFiber / (activeRecipe?.servings || 1)) * 10) / 10,
    totalSugars: Math.round((totalNutrition.totalSugars / (activeRecipe?.servings || 1)) * 10) / 10,
    addedSugars: Math.round((totalNutrition.addedSugars / (activeRecipe?.servings || 1)) * 10) / 10,
    protein: Math.round((totalNutrition.protein / (activeRecipe?.servings || 1)) * 10) / 10,
    vitaminD: Math.round((totalNutrition.vitaminD / (activeRecipe?.servings || 1)) * 10) / 10,
    calcium: Math.round((totalNutrition.calcium / (activeRecipe?.servings || 1)) * 10) / 10,
    iron: Math.round((totalNutrition.iron / (activeRecipe?.servings || 1)) * 10) / 10,
    potassium: Math.round((totalNutrition.potassium / (activeRecipe?.servings || 1)) * 10) / 10,
  };

  const ingredientSlots = activeRecipe ? computeIngredientSlots(activeRecipe.ingredients, activeRecipe.ingredientGroups) : [];
  const instructionSlots = activeRecipe ? computeInstructionSlots(activeRecipe.instructionSteps, activeRecipe.instructionGroups) : [];
  const globalStepNumber = (() => {
    let n = 0;
    const map = new Map<string, number>();
    for (const step of (activeRecipe?.instructionSteps || [])) {
      n++;
      map.set(step.id, n);
    }
    return map;
  })();

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 text-white">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">NutriLabel</h1>
            <p className="text-xs text-stone-500">Standalone recipe storage with FDA nutrition labels</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/food-database">
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-stone-500 hover:text-emerald-700">
                <Database className="w-3.5 h-3.5" />Food DB
              </Button>
            </Link>
            <Badge variant="secondary" className="text-xs gap-1"><HardDrive className="w-3 h-3" />Local Storage</Badge>
            <Badge
              variant={apiKey === 'DEMO_KEY' ? 'outline' : 'secondary'}
              className={`text-xs gap-1 ${apiKey !== 'DEMO_KEY' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}`}
            >
              {apiKey === 'DEMO_KEY' ? (<><WifiOff className="w-3 h-3" />Demo Key</>) : (<><Wifi className="w-3 h-3" />API Key Set</>)}
            </Badge>
            <Dialog open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (open) { setApiKeyInput(apiKey); setApiKeySaved(false); } }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-stone-400 hover:text-stone-600">
                  <Settings className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Settings className="w-4 h-4 text-emerald-600" />Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 mt-4">
                  <div>
                    <label className="text-sm font-medium text-stone-700 flex items-center gap-2 mb-2">
                      <Key className="w-3.5 h-3.5 text-emerald-600" />FDA FoodData Central API Key
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
                    <p>A fully standalone recipe tool that generates FDA-compliant nutrition labels.</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Panel: Recipe List */}
          <div className="lg:col-span-3">
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" />My Recipes
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-2 mb-4">
                  <Input placeholder="New recipe name..." value={newRecipeName} onChange={(e) => setNewRecipeName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateRecipe()} className="text-sm h-9" />
                  <Button onClick={handleCreateRecipe} disabled={!newRecipeName.trim() || isLoading} size="sm" className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <ScrollArea className="max-h-[calc(100vh-280px)]">
                  <div className="space-y-1.5">
                    {recipes.length === 0 ? (
                      <p className="text-xs text-stone-400 text-center py-8">No recipes yet. Create one above!</p>
                    ) : (
                      recipes.map((recipe) => (
                        <div
                          key={recipe.id}
                          className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all text-sm ${
                            activeRecipe?.id === recipe.id
                              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium'
                              : 'hover:bg-stone-100 text-stone-600'
                          }`}
                          onClick={() => selectRecipe(recipe.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium text-sm">{recipe.name}</div>
                            <div className="text-xs text-stone-400 mt-0.5">
                              {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''} · {recipe.servings} {recipe.servingName || 'serving'}
                            </div>
                          </div>
                          {deleteConfirmId === recipe.id ? (
                            <div className="flex items-center gap-1 ml-2">
                              <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }}>Confirm</Button>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}><X className="w-3 h-3" /></Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(recipe.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Center Panel: Recipe Editor */}
          <div className="lg:col-span-5">
            {activeRecipe ? (
              <Card className="border-stone-200 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {editingName ? (
                        <div className="flex gap-2">
                          <Input value={nameValue} onChange={(e) => setNameValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleUpdateName()} onBlur={handleUpdateName} autoFocus className="text-lg font-bold h-9" />
                        </div>
                      ) : (
                        <h2 className="text-lg font-bold text-stone-900 cursor-pointer hover:text-emerald-700 transition-colors" onClick={() => { setNameValue(activeRecipe.name); setEditingName(true); }} title="Click to edit">
                          {activeRecipe.name}
                        </h2>
                      )}
                      {editingServings ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input type="number" min="1" value={servingsValue} onChange={(e) => setServingsValue(e.target.value)} autoFocus className="w-16 h-7 text-sm" />
                          <Input value={servingNameValue} onChange={(e) => setServingNameValue(e.target.value)} className="w-28 h-7 text-sm" />
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleUpdateServings}><Check className="w-4 h-4" /></Button>
                        </div>
                      ) : (
                        <p className="text-sm text-stone-500 mt-1 cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => { setServingsValue(String(activeRecipe.servings)); setServingNameValue(activeRecipe.servingName || 'serving'); setEditingServings(true); }} title="Click to edit">
                          {activeRecipe.servings} {activeRecipe.servingName || 'serving'} · Click to edit
                        </p>
                      )}
                    </div>
                    <Dialog open={searchDialogOpen} onOpenChange={(open) => {
                      setSearchDialogOpen(open);
                      if (open) {
                        setSelectedFood(null);
                        setSelectedRecipeToAdd(null);
                        setRecipeMultiplier('1');
                        setSearchTab('fda');
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                          <Search className="w-4 h-4" />Add Ingredient
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[540px] max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Search className="w-4 h-4 text-emerald-600" />Add Ingredient
                          </DialogTitle>
                        </DialogHeader>
                        <Tabs value={searchTab} onValueChange={(v) => setSearchTab(v as 'fda' | 'recipes')} className="mt-2">
                          <TabsList className="w-full">
                            <TabsTrigger value="fda" className="flex-1">FDA Database</TabsTrigger>
                            <TabsTrigger value="recipes" className="flex-1">My Recipes</TabsTrigger>
                          </TabsList>

                          <TabsContent value="fda" className="space-y-4 mt-4">
                            {searchSource === 'fallback' && (
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                                <strong>Note:</strong> FDA API is currently rate-limited. Showing results from built-in food database.
                              </div>
                            )}
                            {searchSource === 'local' && (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
                                Results from <strong>local database</strong> — no API call needed.
                              </div>
                            )}
                            {searchSource && (
                              <Badge variant="outline" className={`text-[10px] h-5 gap-1 ${searchSource === 'local' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : searchSource === 'fda' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                {searchSource === 'local' ? 'Local DB' : searchSource === 'fda' ? 'FDA API' : 'Fallback'}
                              </Badge>
                            )}
                            <div className="flex gap-2">
                              <Input placeholder="Search foods (e.g., chicken breast, rice)..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchFDA()} className="flex-1" />
                              <Button onClick={handleSearchFDA} disabled={isSearching || !searchQuery.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                              </Button>
                            </div>
                            {searchResults.length > 0 && (
                              <ScrollArea className="max-h-[300px]">
                                <div className="space-y-1">
                                  {searchResults.map((food) => (
                                    <div key={food.fdcId} className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedFood?.fdcId === food.fdcId ? 'border-emerald-400 bg-emerald-50' : 'border-stone-200 hover:border-emerald-200 hover:bg-stone-50'}`} onClick={() => { setSelectedFood(food); setIngredientAmount('100'); setIngredientUnit(food.servingSizeUnit || 'g'); }}>
                                      <div className="font-medium text-sm text-stone-900">{food.description}</div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-[10px] h-5">{food.dataType}</Badge>
                                        {food.brandOwner && <span className="text-xs text-stone-400">{food.brandOwner}</span>}
                                        <span className="text-xs text-stone-400 ml-auto">{fmt(food.nutrients.calories)} cal per 100{food.servingSizeUnit || 'g'}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>
                            )}
                            {searchResults.length === 0 && !isSearching && searchQuery && (
                              <p className="text-sm text-stone-400 text-center py-6">Click search to find foods</p>
                            )}
                            {selectedFood && (
                              <div className="border-t pt-4 space-y-3">
                                <div className="bg-emerald-50 p-3 rounded-lg">
                                  <p className="font-medium text-sm text-emerald-900">{selectedFood.description}</p>
                                  <p className="text-xs text-emerald-700 mt-1">
                                    {fmt(selectedFood.nutrients.calories)} cal · {fmt(selectedFood.nutrients.protein)}g protein · {fmt(selectedFood.nutrients.totalFat)}g fat · {fmt(selectedFood.nutrients.totalCarbs)}g carbs
                                    <span className="text-emerald-500"> per 100{selectedFood.servingSizeUnit || 'g'}</span>
                                  </p>
                                </div>
                                <div className="flex gap-3 items-end">
                                  <div className="flex-1">
                                    <label className="text-xs font-medium text-stone-600 mb-1 block">Amount</label>
                                    <Input type="number" min="0" step="0.1" value={ingredientAmount} onChange={(e) => setIngredientAmount(e.target.value)} className="h-9" />
                                  </div>
                                  <div className="w-24">
                                    <label className="text-xs font-medium text-stone-600 mb-1 block">Unit</label>
                                    <select value={ingredientUnit} onChange={(e) => setIngredientUnit(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                                      <option value="g">grams</option><option value="oz">oz</option><option value="cup">cup</option>
                                      <option value="tbsp">tbsp</option><option value="tsp">tsp</option><option value="ml">ml</option>
                                      <option value="lb">lb</option><option value="whole">whole</option>
                                    </select>
                                  </div>
                                  <Button onClick={handleAddIngredient} disabled={!ingredientAmount || isLoading} className="bg-emerald-600 hover:bg-emerald-700 h-9">
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="recipes" className="space-y-4 mt-4">
                            <ScrollArea className="max-h-[300px]">
                              <div className="space-y-1">
                                {recipes.filter(r => r.id !== activeRecipe?.id).length === 0 ? (
                                  <p className="text-sm text-stone-400 text-center py-6">No other recipes to add</p>
                                ) : (
                                  recipes.filter(r => r.id !== activeRecipe?.id).map(recipe => (
                                    <div key={recipe.id} className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedRecipeToAdd?.id === recipe.id ? 'border-emerald-400 bg-emerald-50' : 'border-stone-200 hover:border-emerald-200 hover:bg-stone-50'}`} onClick={() => { setSelectedRecipeToAdd(recipe); setRecipeMultiplier('1'); }}>
                                      <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-emerald-600" />
                                        <span className="font-medium text-sm text-stone-900">{recipe.name}</span>
                                      </div>
                                      <div className="text-xs text-stone-400 mt-1 ml-6">
                                        {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''} · {fmt(recipeTotalCalories(recipe.ingredients))} cal total
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </ScrollArea>
                            {selectedRecipeToAdd && (
                              <div className="border-t pt-4 space-y-3">
                                <div className="bg-emerald-50 p-3 rounded-lg">
                                  <p className="font-medium text-sm text-emerald-900 flex items-center gap-2">
                                    <BookOpen className="w-3.5 h-3.5" />{selectedRecipeToAdd.name}
                                  </p>
                                  <p className="text-xs text-emerald-700 mt-1">
                                    {fmt(recipeTotalCalories(selectedRecipeToAdd.ingredients))} cal total · {selectedRecipeToAdd.servings} {selectedRecipeToAdd.servingName || 'servings'}
                                  </p>
                                </div>
                                <div className="flex gap-3 items-end">
                                  <div className="flex-1">
                                    <label className="text-xs font-medium text-stone-600 mb-1 block">Multiplier</label>
                                    <Input type="number" min="0.1" step="0.1" value={recipeMultiplier} onChange={(e) => setRecipeMultiplier(e.target.value)} className="h-9" />
                                  </div>
                                  <span className="text-sm text-stone-500 pb-2">× recipe</span>
                                  <Button onClick={handleAddRecipeAsIngredient} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 h-9">
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <Separator className="mb-4" />

                  {/* Ingredients List */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                        <UtensilsCrossed className="w-4 h-4 text-emerald-600" />Ingredients
                        <Badge variant="secondary" className="text-[10px] h-5 ml-1">{activeRecipe.ingredients.length}</Badge>
                      </h3>
                      {selectedIngredientIds.length >= 2 && (
                        <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleGroupSelectedIngredients}>
                          <FolderOpen className="w-3.5 h-3.5" />Group ({selectedIngredientIds.length})
                        </Button>
                      )}
                    </div>
                    {activeRecipe.ingredients.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-stone-200 rounded-lg">
                        <Salad className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                        <p className="text-sm text-stone-400">No ingredients yet</p>
                        <p className="text-xs text-stone-300 mt-1">Click &quot;Add Ingredient&quot; to search the FDA database or add a recipe</p>
                      </div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleIngredientDragEnd}>
                        <SortableContext items={activeRecipe.ingredients.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1.5">
                            {ingredientSlots.map((slot) => {
                              if (slot.type === 'group') {
                                const isEditingThisGroup = editingGroupId === slot.group.id && editingGroupType === 'ingredient';
                                return (
                                  <div key={slot.group.id} className="border border-emerald-200 rounded-lg overflow-hidden bg-emerald-50/30">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b border-emerald-200">
                                      <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                                      {isEditingThisGroup ? (
                                        <Input value={editingGroupTitleValue} onChange={(e) => setEditingGroupTitleValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleFinishEditGroupTitle(); if (e.key === 'Escape') setEditingGroupId(null); }} onBlur={handleFinishEditGroupTitle} autoFocus className="h-6 text-sm flex-1 bg-white" />
                                      ) : (
                                        <span className="text-sm font-medium text-emerald-800 flex-1 cursor-pointer hover:text-emerald-600" onClick={() => handleStartEditGroupTitle(slot.group.id, slot.group.title, 'ingredient')}>
                                          {slot.group.title}
                                        </span>
                                      )}
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-emerald-400 hover:text-destructive" onClick={() => removeIngredientGroup(slot.group.id)}>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    <div className="p-1.5 space-y-1.5">
                                      {slot.items.map((ingredient) => (
                                        <SortableIngredientItem
                                          key={ingredient.id}
                                          ingredient={ingredient}
                                          isSelected={selectedIngredientIds.includes(ingredient.id)}
                                          isEditing={editIngredientId === ingredient.id}
                                          editDescription={editDescription}
                                          editAmount={editAmount}
                                          editUnit={editUnit}
                                          isLoading={isLoading}
                                          isGrouped
                                          onToggleSelect={() => toggleIngredientSelect(ingredient.id)}
                                          onEdit={() => { setEditIngredientId(ingredient.id); setEditDescription(ingredient.description || ''); setEditAmount(String(ingredient.amount)); setEditUnit(ingredient.unit); }}
                                          onRemove={() => removeIngredient(ingredient.id)}
                                          onRemoveFromGroup={() => moveIngredientToGroup(ingredient.id, null)}
                                          onSaveEdit={handleSaveIngredientEdit}
                                          onCancelEdit={() => setEditIngredientId(null)}
                                          onEditDescription={setEditDescription}
                                          onEditAmount={setEditAmount}
                                          onEditUnit={setEditUnit}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <SortableIngredientItem
                                  key={slot.ingredient.id}
                                  ingredient={slot.ingredient}
                                  isSelected={selectedIngredientIds.includes(slot.ingredient.id)}
                                  isEditing={editIngredientId === slot.ingredient.id}
                                  editDescription={editDescription}
                                  editAmount={editAmount}
                                  editUnit={editUnit}
                                  isLoading={isLoading}
                                  isGrouped={false}
                                  onToggleSelect={() => toggleIngredientSelect(slot.ingredient.id)}
                                  onEdit={() => { setEditIngredientId(slot.ingredient.id); setEditDescription(slot.ingredient.description || ''); setEditAmount(String(slot.ingredient.amount)); setEditUnit(slot.ingredient.unit); }}
                                  onRemove={() => removeIngredient(slot.ingredient.id)}
                                  onSaveEdit={handleSaveIngredientEdit}
                                  onCancelEdit={() => setEditIngredientId(null)}
                                  onEditDescription={setEditDescription}
                                  onEditAmount={setEditAmount}
                                  onEditUnit={setEditUnit}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                    {activeRecipe.ingredients.length > 1 && (
                      <p className="text-[10px] text-stone-400 mt-2 text-center">
                        Hold Shift + drop on another ingredient to group them
                      </p>
                    )}
                  </div>

                  {/* Instructions */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-stone-700">Instructions</h3>
                      {selectedStepIds.length >= 2 && (
                        <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleGroupSelectedSteps}>
                          <FolderOpen className="w-3.5 h-3.5" />Group ({selectedStepIds.length})
                        </Button>
                      )}
                    </div>
                    {activeRecipe.instructionSteps.length > 0 && (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleInstructionDragEnd}>
                        <SortableContext items={activeRecipe.instructionSteps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1.5 mb-3">
                            {instructionSlots.map((slot) => {
                              if (slot.type === 'group') {
                                const isEditingThisGroup = editingGroupId === slot.group.id && editingGroupType === 'instruction';
                                return (
                                  <div key={slot.group.id} className="border border-emerald-200 rounded-lg overflow-hidden bg-emerald-50/30">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b border-emerald-200">
                                      <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                                      {isEditingThisGroup ? (
                                        <Input value={editingGroupTitleValue} onChange={(e) => setEditingGroupTitleValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleFinishEditGroupTitle(); if (e.key === 'Escape') setEditingGroupId(null); }} onBlur={handleFinishEditGroupTitle} autoFocus className="h-6 text-sm flex-1 bg-white" />
                                      ) : (
                                        <span className="text-sm font-medium text-emerald-800 flex-1 cursor-pointer hover:text-emerald-600" onClick={() => handleStartEditGroupTitle(slot.group.id, slot.group.title, 'instruction')}>
                                          {slot.group.title}
                                        </span>
                                      )}
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-emerald-400 hover:text-destructive" onClick={() => removeInstructionGroup(slot.group.id)}>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    <div className="p-1.5 space-y-1.5">
                                      {slot.items.map((step) => (
                                        <SortableInstructionStep
                                          key={step.id}
                                          step={step}
                                          stepNumber={globalStepNumber.get(step.id) || 0}
                                          isActive={editingStepId === step.id}
                                          isSelected={selectedStepIds.includes(step.id)}
                                          isGrouped
                                          onToggleSelect={() => toggleStepSelect(step.id)}
                                          onEdit={() => handleEditStep(step)}
                                          onDelete={() => handleDeleteStep(step.id)}
                                          onRemoveFromGroup={() => moveInstructionToGroup(step.id, null)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <SortableInstructionStep
                                  key={slot.step.id}
                                  step={slot.step}
                                  stepNumber={globalStepNumber.get(slot.step.id) || 0}
                                  isActive={editingStepId === slot.step.id}
                                  isSelected={selectedStepIds.includes(slot.step.id)}
                                  isGrouped={false}
                                  onToggleSelect={() => toggleStepSelect(slot.step.id)}
                                  onEdit={() => handleEditStep(slot.step)}
                                  onDelete={() => handleDeleteStep(slot.step.id)}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                    {activeRecipe.instructionSteps.length > 1 && (
                      <p className="text-[10px] text-stone-400 mb-2 text-center">
                        Hold Shift + drop on another step to group them
                      </p>
                    )}
                    <div className="space-y-2">
                      <Textarea
                        placeholder={editingStepId ? 'Edit this step...' : 'Add a cooking step...'}
                        value={stepText}
                        onChange={(e) => setStepText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleSaveStep(); }}
                        className="min-h-[80px] text-sm resize-none"
                      />
                      <div className="flex items-center gap-2">
                        <Button onClick={handleSaveStep} disabled={!stepText.trim() || isLoading} className="bg-emerald-600 hover:bg-emerald-700 gap-1 text-sm" size="sm">
                          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />{editingStepId ? 'Update Step' : 'Save Step'}</>}
                        </Button>
                        {editingStepId && (
                          <Button variant="ghost" size="sm" className="text-sm" onClick={() => { setEditingStepId(null); setStepText(''); }}>Cancel</Button>
                        )}
                        {stepText.trim() && <span className="text-xs text-stone-400 ml-auto">Ctrl+Enter to save</span>}
                      </div>
                    </div>
                  </div>

                  {/* Nutrition Summary Bar */}
                  {activeRecipe.ingredients.length > 0 && (
                    <div className="mt-4 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-emerald-800">Total Recipe Nutrition</span>
                        <div className="flex gap-3 text-emerald-700">
                          <span>{fmt(totalNutrition.calories)} cal</span>
                          <span>{fmt(totalNutrition.protein)}g protein</span>
                          <span>{fmt(totalNutrition.totalFat)}g fat</span>
                          <span>{fmt(totalNutrition.totalCarbs)}g carbs</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-stone-200 shadow-sm flex items-center justify-center min-h-[500px]">
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
                    <ChefHat className="w-8 h-8 text-stone-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-stone-700 mb-2">No Recipe Selected</h3>
                  <p className="text-sm text-stone-400 max-w-xs mx-auto">Create a new recipe or select an existing one from the sidebar to get started.</p>
                </div>
              </Card>
            )}
          </div>

          {/* Right Panel: Nutrition Label */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-6">
              <Card className="border-stone-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                    <Salad className="w-4 h-4 text-emerald-600" />Nutrition Facts Label
                  </CardTitle>
                  <p className="text-xs text-stone-400">FDA-compliant label auto-generated from your ingredients</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex justify-center">
                    <NutritionLabel
                      data={activeRecipe && activeRecipe.servings > 1 ? perServingNutrition : nutritionData}
                      servingDescription={activeRecipe ? `1 ${activeRecipe.servingName || 'serving'}` : undefined}
                      servingsPerContainer={activeRecipe?.servings}
                    />
                  </div>
                  {activeRecipe && activeRecipe.ingredients.length > 0 && activeRecipe.servings > 1 && (
                    <div className="mt-4 p-3 bg-stone-50 rounded-lg border border-stone-200">
                      <p className="text-xs font-medium text-stone-600 mb-2">Full Recipe (all {activeRecipe.servings} {activeRecipe.servingName || 'serving'})</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between"><span className="text-stone-500">Calories</span><span className="font-medium">{fmt(totalNutrition.calories)}</span></div>
                        <div className="flex justify-between"><span className="text-stone-500">Protein</span><span className="font-medium">{fmt(totalNutrition.protein)}g</span></div>
                        <div className="flex justify-between"><span className="text-stone-500">Total Fat</span><span className="font-medium">{fmt(totalNutrition.totalFat)}g</span></div>
                        <div className="flex justify-between"><span className="text-stone-500">Carbs</span><span className="font-medium">{fmt(totalNutrition.totalCarbs)}g</span></div>
                        <div className="flex justify-between"><span className="text-stone-500">Fiber</span><span className="font-medium">{fmt(totalNutrition.dietaryFiber)}g</span></div>
                        <div className="flex justify-between"><span className="text-stone-500">Sodium</span><span className="font-medium">{fmt(totalNutrition.sodium)}mg</span></div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Group Creation Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-emerald-600" />
              Create {groupDialogType === 'ingredient' ? 'Ingredient' : 'Instruction'} Group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-stone-500">
              Group {groupDialogTargetIds.length} {groupDialogType === 'ingredient' ? 'ingredients' : 'steps'} together with a title.
            </p>
            <div>
              <label className="text-xs font-medium text-stone-600 mb-1 block">Group Title</label>
              <Input
                placeholder={groupDialogType === 'ingredient' ? 'e.g., Proteins, Sauces, Vegetables...' : 'e.g., Make the pasta, Prepare the sauce...'}
                value={groupDialogTitle}
                onChange={(e) => setGroupDialogTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGroupDialogConfirm(); }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={handleGroupDialogConfirm} disabled={!groupDialogTitle.trim()}>
                <Check className="w-3.5 h-3.5" />Create Group
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <footer className="border-t bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-stone-400">
          NutriLabel — 100% local, no server required. Data from FDA FoodData Central (USDA).
        </div>
      </footer>
    </div>
  );
}

interface SortableIngredientItemProps {
  ingredient: Ingredient;
  isSelected: boolean;
  isEditing: boolean;
  editDescription: string;
  editAmount: string;
  editUnit: string;
  isLoading: boolean;
  isGrouped: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onRemoveFromGroup?: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditDescription: (v: string) => void;
  onEditAmount: (v: string) => void;
  onEditUnit: (v: string) => void;
}

function SortableIngredientItem({
  ingredient,
  isSelected,
  isEditing,
  editDescription,
  editAmount,
  editUnit,
  isLoading,
  isGrouped,
  onToggleSelect,
  onEdit,
  onRemove,
  onRemoveFromGroup,
  onSaveEdit,
  onCancelEdit,
  onEditDescription,
  onEditAmount,
  onEditUnit,
}: SortableIngredientItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ingredient.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isRecipe = !!ingredient.linkedRecipeId;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center justify-between p-3 bg-white border rounded-lg transition-colors group cursor-pointer ${
          isRecipe ? 'border-blue-200 hover:border-blue-300 bg-blue-50/30' :
          isSelected ? 'border-emerald-400 bg-emerald-50' :
          'border-stone-200 hover:border-emerald-300'
        }`}
        onClick={onEdit}
      >
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 p-0.5 touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="px-1.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0 ml-2">
          <p className={`text-sm font-medium truncate flex items-center gap-1.5 ${isRecipe ? 'text-blue-800' : 'text-stone-800'}`}>
            {isRecipe && <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            {ingredient.name}
            {isRecipe && <Link2 className="w-3 h-3 text-blue-400 shrink-0" />}
          </p>
          <p className={`text-xs mt-0.5 ${isRecipe ? 'text-blue-500' : 'text-stone-400'}`}>
            {isRecipe ? (
              <>{fmt(ingredient.amount)}× recipe · {fmt(ingredient.calories)} cal</>
            ) : (
              <>{fmt(ingredient.amount)}{ingredient.unit} · {fmt(ingredient.calories)} cal</>
            )}
            {ingredient.description && <span className="text-stone-500 ml-1">· {ingredient.description}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <div className="hidden sm:flex gap-2 text-[10px] text-stone-400">
            <span>P: {fmt(ingredient.protein)}g</span>
            <span>F: {fmt(ingredient.totalFat)}g</span>
            <span>C: {fmt(ingredient.totalCarbs)}g</span>
          </div>
          {isGrouped && onRemoveFromGroup && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-300 hover:text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }} title="Remove from group">
              <FolderOpen className="w-3 h-3" />
            </Button>
          )}
          <Pencil className="w-3.5 h-3.5 text-stone-300 group-hover:text-emerald-500 transition-colors" />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {isEditing && (
        <div className="mt-1 p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
          <div>
            <label className="text-xs font-medium text-stone-600 mb-1 block">Description</label>
            <Input placeholder="e.g., diced, organic, finely chopped..." value={editDescription} onChange={(e) => onEditDescription(e.target.value)} className="h-8 text-sm" autoFocus />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-stone-600 mb-1 block">{isRecipe ? 'Multiplier' : 'Quantity'}</label>
              <Input type="number" min="0" step={isRecipe ? '0.1' : '0.1'} value={editAmount} onChange={(e) => onEditAmount(e.target.value)} className="h-8 text-sm" />
            </div>
            {!isRecipe && (
              <div className="w-24">
                <label className="text-xs font-medium text-stone-600 mb-1 block">Unit</label>
                <select value={editUnit} onChange={(e) => onEditUnit(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="g">grams</option><option value="oz">oz</option><option value="cup">cup</option>
                  <option value="tbsp">tbsp</option><option value="tsp">tsp</option><option value="ml">ml</option>
                  <option value="lb">lb</option><option value="whole">whole</option>
                </select>
              </div>
            )}
            {isRecipe && <span className="text-sm text-stone-500 pb-1.5">× recipe</span>}
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8 gap-1" onClick={onSaveEdit} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Save</>}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onCancelEdit}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SortableInstructionStepProps {
  step: InstructionStep;
  stepNumber: number;
  isActive: boolean;
  isSelected: boolean;
  isGrouped: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRemoveFromGroup?: () => void;
}

function SortableInstructionStep({
  step,
  stepNumber,
  isActive,
  isSelected,
  isGrouped,
  onToggleSelect,
  onEdit,
  onDelete,
  onRemoveFromGroup,
}: SortableInstructionStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
        isActive ? 'border-emerald-400 bg-emerald-50' :
        isSelected ? 'border-emerald-400 bg-emerald-50' :
        'border-stone-200 hover:border-emerald-300 hover:bg-stone-50'
      }`}
      onClick={onEdit}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 mt-0.5 p-0.5 touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} className="h-3.5 w-3.5" />
      </div>
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center justify-center mt-0.5">
        {stepNumber}
      </span>
      <p className="flex-1 text-sm text-stone-700 whitespace-pre-wrap">{step.text}</p>
      <div className="flex items-center gap-1">
        {isGrouped && onRemoveFromGroup && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-300 hover:text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }} title="Remove from group">
            <FolderOpen className="w-3 h-3" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

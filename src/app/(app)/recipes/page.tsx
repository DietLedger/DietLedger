'use client';

import React, { Suspense, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRecipeStore } from '@/lib/recipe-store';
import { useBookStore, type CategoryNode } from '@/lib/book-store';
import { getApiClient } from '@/lib/api-client';
import { generateUUID } from '@/lib/utils';
import { type FDAFood, type InstructionStep, type Ingredient, type IngredientGroup, type InstructionGroup, type Recipe } from '@/lib/recipe-store';
import { computeRecipeGL, type GLResult } from '@/lib/glycemic-load';
import { GL_HOVER_KEY } from '@/data/glycemic-index';
import NutritionLabel, { type NutritionData } from '@/components/nutrition-label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
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
  Check,
  Pencil,
  GripVertical,
  FolderOpen,
  Link2,
  Tag,
  Filter,
  ChevronDown,
  ChevronRight,
  Eye,
  Share2,
  Download,
} from 'lucide-react';
import { toCanvas } from 'html-to-image';
import { fmt } from '@/lib/format';
import { useTemplates } from '@/hooks/use-templates';
import { DietaryFilters, applyDietaryFilters } from '@/components/dietary/dietary-filters';
import { useDietaryProfiles } from '@/hooks/use-dietary';
import type { DietaryTag } from '@/lib/types';
import RecipeRenderer from '@/components/recipe-renderer';
import { ShareDialog } from '@/components/recipe/share-dialog';
import { STORAGE_LOCATIONS, STORAGE_LOCATION_META, type StorageLocation } from '@/data/storage-locations';

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

function CategoryTreeItem({ node, selectedId, onSelect, depth }: {
  node: CategoryNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        className={`w-full text-left flex items-center gap-1 px-2 py-1.5 text-xs rounded hover:bg-stone-100 ${
          selectedId === node.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-stone-600'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren && (
          <span
            className="shrink-0 text-stone-400 hover:text-stone-600"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && hasChildren && node.children.map((child) => (
        <CategoryTreeItem
          key={child.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <RecipePage />
    </Suspense>
  );
}

function RecipePage() {
  const searchParams = useSearchParams();
  const {
    recipes,
    activeRecipe,
    isSearching,
    searchResults,
    searchSource,
    isLoading,
    fetchRecipes,
    createRecipe,
    selectRecipe,
    updateRecipe,
    deleteRecipe,
    searchFDA,
    addIngredient,
    addCustomIngredient,
    addRecipeAsIngredient,
    removeIngredient,
    updateIngredient,
    getTotalNutrition,
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

  const {
    categories,
    categoryTree,
    recipeCategories,
    fetchCategories,
    fetchRecipeCategories,
    createCategory,
    deleteCategory,
    assignCategory,
    unassignCategory,
  } = useBookStore();

  const { data: templates = [] } = useTemplates();

  const { profiles: dietaryProfiles, activeProfileId: activeDietaryProfileId } = useDietaryProfiles();
  const activeDietaryProfile = useMemo(
    () => dietaryProfiles.find((p) => p.id === activeDietaryProfileId) ?? null,
    [dietaryProfiles, activeDietaryProfileId]
  );

  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [excludeAllergens, setExcludeAllergens] = useState(false);

  const [selectedRecipeTemplateId, setSelectedRecipeTemplateId] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogRecipeId, setCategoryDialogRecipeId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedParentCategoryId, setSelectedParentCategoryId] = useState<string | null>(null);

  const [newRecipeName, setNewRecipeName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchTab, setSearchTab] = useState<'fda' | 'recipes' | 'custom'>('fda');
  const [selectedFood, setSelectedFood] = useState<FDAFood | null>(null);
  const [ingredientAmount, setIngredientAmount] = useState('100');
  const [ingredientUnit, setIngredientUnit] = useState('g');
  const [selectedRecipeToAdd, setSelectedRecipeToAdd] = useState<Recipe | null>(null);
  const [recipeMultiplier, setRecipeMultiplier] = useState('1');
  const [recipeAddMode, setRecipeAddMode] = useState<'whole' | 'servings'>('whole');
  const [recipeServingsCount, setRecipeServingsCount] = useState('1');
  const [customName, setCustomName] = useState('');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customTotalFat, setCustomTotalFat] = useState('');
  const [customTotalCarbs, setCustomTotalCarbs] = useState('');
  const [customSaturatedFat, setCustomSaturatedFat] = useState('');
  const [customTransFat, setCustomTransFat] = useState('');
  const [customCholesterol, setCustomCholesterol] = useState('');
  const [customSodium, setCustomSodium] = useState('');
  const [customDietaryFiber, setCustomDietaryFiber] = useState('');
  const [customTotalSugars, setCustomTotalSugars] = useState('');
  const [customAddedSugars, setCustomAddedSugars] = useState('');
  const [customVitaminD, setCustomVitaminD] = useState('');
  const [customCalcium, setCustomCalcium] = useState('');
  const [customIron, setCustomIron] = useState('');
  const [customPotassium, setCustomPotassium] = useState('');
  const [customAmount, setCustomAmount] = useState('100');
  const [customUnit, setCustomUnit] = useState('g');
  const [customSaveForReuse, setCustomSaveForReuse] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingServings, setEditingServings] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [servingsValue, setServingsValue] = useState('');
  const [servingNameValue, setServingNameValue] = useState('');
  const [editIngredientId, setEditIngredientId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editUnit, setEditUnit] = useState('g');
  const [editPrepInstructions, setEditPrepInstructions] = useState<string[]>([]);
  const [editStorageLocation, setEditStorageLocation] = useState<string>('');
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

  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);
  const [filteredRecipeIds, setFilteredRecipeIds] = useState<Set<string> | null>(null);
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [collapsedIngredientGroups, setCollapsedIngredientGroups] = useState<Set<string>>(new Set());
  const [collapsedInstructionGroups, setCollapsedInstructionGroups] = useState<Set<string>>(new Set());

  const shiftRef = useRef(false);

  const displayRecipes = useMemo(() => {
    let result: Recipe[] = recipes;
    if (filteredRecipeIds) {
      result = result.filter(r => filteredRecipeIds.has(r.id));
    }
    if (dietaryTags.length > 0 || excludeAllergens) {
      result = applyDietaryFilters(result as any, dietaryTags, excludeAllergens, activeDietaryProfile) as any;
    }
    return result;
  }, [recipes, filteredRecipeIds, dietaryTags, excludeAllergens, activeDietaryProfile]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchRecipes();
    fetchCategories();
  }, [fetchRecipes, fetchCategories]);

  const initialRecipeId = useRef(searchParams.get('recipeId'));
  const nutritionLabelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initialRecipeId.current) {
      selectRecipe(initialRecipeId.current);
      initialRecipeId.current = null;
    }
  }, [selectRecipe]);

  useEffect(() => {
    if (activeRecipe) {
      fetchRecipeCategories(activeRecipe.id);
    }
  }, [activeRecipe?.id, fetchRecipeCategories]);

  useEffect(() => {
    if (!categoryFilterId) {
      setFilteredRecipeIds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const descendantIds = await getApiClient().getCategoryDescendants(categoryFilterId);
      const recipeIdSets = await Promise.all(
        descendantIds.map(id => getApiClient().getRecipesByCategory(id))
      );
      const ids = new Set<string>();
      for (const recs of recipeIdSets) {
        for (const r of recs) ids.add(r.recipeId);
      }
      if (!cancelled) setFilteredRecipeIds(ids);
    })();
    return () => { cancelled = true; };
  }, [categoryFilterId]);

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
    const multiplier = recipeAddMode === 'whole'
      ? (parseFloat(recipeMultiplier) || 1)
      : (parseFloat(recipeServingsCount) || 1) / selectedRecipeToAdd.servings;
    await addRecipeAsIngredient(selectedRecipeToAdd, multiplier);
    setSelectedRecipeToAdd(null);
    setRecipeMultiplier('1');
    setRecipeServingsCount('1');
    setRecipeAddMode('whole');
    setSearchDialogOpen(false);
  }, [selectedRecipeToAdd, recipeMultiplier, recipeAddMode, recipeServingsCount, addRecipeAsIngredient]);

  const handleAddCustomIngredient = useCallback(async () => {
    if (!customName.trim()) return;
    const nutrition = {
      calories: parseFloat(customCalories) || 0,
      totalFat: parseFloat(customTotalFat) || 0,
      saturatedFat: parseFloat(customSaturatedFat) || 0,
      transFat: parseFloat(customTransFat) || 0,
      cholesterol: parseFloat(customCholesterol) || 0,
      sodium: parseFloat(customSodium) || 0,
      totalCarbs: parseFloat(customTotalCarbs) || 0,
      dietaryFiber: parseFloat(customDietaryFiber) || 0,
      totalSugars: parseFloat(customTotalSugars) || 0,
      addedSugars: parseFloat(customAddedSugars) || 0,
      protein: parseFloat(customProtein) || 0,
      vitaminD: parseFloat(customVitaminD) || 0,
      calcium: parseFloat(customCalcium) || 0,
      iron: parseFloat(customIron) || 0,
      potassium: parseFloat(customPotassium) || 0,
    };
    await addCustomIngredient(customName.trim(), nutrition, parseFloat(customAmount) || 100, customUnit);
    if (customSaveForReuse) {
      try {
        await getApiClient().createCustomFood({
          name: customName.trim(),
          calories: parseFloat(customCalories) || 0,
          totalFat: parseFloat(customTotalFat) || 0,
          saturatedFat: parseFloat(customSaturatedFat) || 0,
          transFat: parseFloat(customTransFat) || 0,
          cholesterol: parseFloat(customCholesterol) || 0,
          sodium: parseFloat(customSodium) || 0,
          totalCarbs: parseFloat(customTotalCarbs) || 0,
          dietaryFiber: parseFloat(customDietaryFiber) || 0,
          totalSugars: parseFloat(customTotalSugars) || 0,
          addedSugars: parseFloat(customAddedSugars) || 0,
          protein: parseFloat(customProtein) || 0,
          vitaminD: parseFloat(customVitaminD) || 0,
          calcium: parseFloat(customCalcium) || 0,
          iron: parseFloat(customIron) || 0,
          potassium: parseFloat(customPotassium) || 0,
        });
      } catch {
        // ignore save error
      }
    }
    setCustomName('');
    setCustomCalories('');
    setCustomProtein('');
    setCustomTotalFat('');
    setCustomTotalCarbs('');
    setCustomSaturatedFat('');
    setCustomTransFat('');
    setCustomCholesterol('');
    setCustomSodium('');
    setCustomDietaryFiber('');
    setCustomTotalSugars('');
    setCustomAddedSugars('');
    setCustomVitaminD('');
    setCustomCalcium('');
    setCustomIron('');
    setCustomPotassium('');
    setCustomAmount('100');
    setCustomUnit('g');
    setCustomSaveForReuse(false);
    setSearchDialogOpen(false);
  }, [customName, customCalories, customProtein, customTotalFat, customTotalCarbs, customSaturatedFat, customTransFat, customCholesterol, customSodium, customDietaryFiber, customTotalSugars, customAddedSugars, customVitaminD, customCalcium, customIron, customPotassium, customAmount, customUnit, customSaveForReuse, addCustomIngredient]);

  const handleDeleteRecipe = useCallback(async (id: string) => {
    await deleteRecipe(id);
    setDeleteConfirmId(null);
  }, [deleteRecipe]);

  const handleExportNutritionLabel = useCallback(async () => {
    if (!nutritionLabelRef.current || !activeRecipe) return;
    const wrapper = document.createElement('div');
    wrapper.style.padding = '24px';
    wrapper.style.background = '#ffffff';
    wrapper.style.display = 'inline-block';
    wrapper.appendChild(nutritionLabelRef.current.cloneNode(true));
    document.body.appendChild(wrapper);
    try {
      const canvas = await toCanvas(wrapper, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeName = activeRecipe.name.replace(/\s+/g, '_');
      link.download = `${safeName}_${dateStr}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      document.body.removeChild(wrapper);
    }
  }, [activeRecipe]);

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
      steps.push({ id: generateUUID(), text: stepText.trim(), groupId: null });
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

  const handleSaveIngredientEdit = useCallback(async () => {
    if (!editIngredientId || !activeRecipe) return;
    const ingredient = activeRecipe.ingredients.find((i) => i.id === editIngredientId);
    if (!ingredient) return;
    await updateIngredient(editIngredientId, {
      name: editName,
      description: editDescription,
      amount: parseFloat(editAmount) || ingredient.amount,
      unit: editUnit,
      prepInstructions: editPrepInstructions,
      storageLocation: editStorageLocation,
    });
    setEditIngredientId(null);
  }, [editIngredientId, editName, editDescription, editAmount, editUnit, editPrepInstructions, editStorageLocation, activeRecipe, updateIngredient]);

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

  const estimatedGL: GLResult | null = useMemo(() => {
    if (!activeRecipe) return null;
    return computeRecipeGL(activeRecipe, 1, recipes);
  }, [activeRecipe, recipes]);

  const ingredientSlots = activeRecipe ? computeIngredientSlots(activeRecipe.ingredients, activeRecipe.ingredientGroups) : [];
  const instructionSlots = activeRecipe ? computeInstructionSlots(activeRecipe.instructionSteps, activeRecipe.instructionGroups) : [];
  const recipeTemplates = useMemo(() => templates.filter((t) => t.type === 'recipe'), [templates]);
  const activeRecipeTemplate = useMemo(() => {
    if (selectedRecipeTemplateId) {
      return recipeTemplates.find((t) => t.id === selectedRecipeTemplateId) || null;
    }
    return recipeTemplates[0] || null;
  }, [selectedRecipeTemplateId, recipeTemplates]);
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
    <>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Panel: Recipe List */}
          <div className="lg:col-span-3">
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-600" />My Recipes
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-2 mb-4">
                  <Input placeholder="New recipe name..." value={newRecipeName} onChange={(e) => setNewRecipeName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateRecipe()} className="text-sm h-9" />
                  <Button onClick={handleCreateRecipe} disabled={!newRecipeName.trim() || isLoading} size="sm" className="bg-brand-600 hover:bg-brand-700 shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {categories.length > 0 && (
                  <div className="mb-3">
                    <Popover open={categoryFilterOpen} onOpenChange={setCategoryFilterOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={`w-full justify-start gap-2 text-xs ${categoryFilterId ? 'border-brand-300 bg-brand-50 text-brand-700' : 'text-stone-500'}`}
                        >
                          <Filter className="w-3.5 h-3.5" />
                          {categoryFilterId
                            ? categories.find(c => c.id === categoryFilterId)?.name ?? 'Filter'
                            : 'Filter by category'}
                          {categoryFilterId && (
                            <span
                              role="button"
                              tabIndex={0}
                              className="ml-auto hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); setCategoryFilterId(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setCategoryFilterId(null); } }}
                            >
                              <X className="w-3 h-3" />
                            </span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-1" align="start">
                        <button
                          className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-stone-100 ${!categoryFilterId ? 'bg-brand-50 text-brand-700 font-medium' : 'text-stone-600'}`}
                          onClick={() => { setCategoryFilterId(null); setCategoryFilterOpen(false); }}
                        >
                          All categories
                        </button>
                        {categoryTree.map((node) => (
                          <CategoryTreeItem
                            key={node.id}
                            node={node}
                            selectedId={categoryFilterId}
                            onSelect={(id) => { setCategoryFilterId(id); setCategoryFilterOpen(false); }}
                            depth={0}
                          />
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                <div className="mb-3">
                  <DietaryFilters
                    activeTags={dietaryTags}
                    onTagsChange={setDietaryTags}
                    excludeAllergens={excludeAllergens}
                    onExcludeAllergensChange={setExcludeAllergens}
                  />
                </div>
                <ScrollArea className="max-h-[calc(100vh-280px)]">
                  <div className="space-y-1.5">
                    {displayRecipes.length === 0 ? (
                      <p className="text-xs text-stone-400 text-center py-8">
                        {categoryFilterId ? 'No recipes in this category' : 'No recipes yet. Create one above!'}
                      </p>
                    ) : (
                      displayRecipes.map((recipe) => (
                        <div
                          key={recipe.id}
                          className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all text-sm ${
                            activeRecipe?.id === recipe.id
                              ? 'bg-brand-50 border border-brand-200 text-brand-900 font-medium'
                              : 'hover:bg-stone-100 text-stone-600'
                          }`}
                          onClick={() => selectRecipe(recipe.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium text-sm">{recipe.name}</div>
                            <div className="text-xs text-stone-400 mt-0.5">
                              {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''} · {recipe.servings} {recipe.servingName || 'serving'}
                            </div>
                            {(() => {
                              const cats = recipeCategories.get(recipe.id);
                              if (!cats || cats.length === 0) return null;
                              return (
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {cats.map((rc) => {
                                    const cat = categories.find((c) => c.id === rc.categoryId);
                                    if (!cat) return null;
                                    return (
                                      <Badge key={rc.id} variant="outline" className="text-[9px] h-4 px-1 gap-0.5 bg-brand-50 text-brand-700 border-brand-200">
                                        <Tag className="w-2 h-2" />{cat.name}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              );
                            })()}
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
                    <div className="flex-1">
                      {editingName ? (
                        <div className="flex gap-2">
                          <Input value={nameValue} onChange={(e) => setNameValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleUpdateName()} onBlur={handleUpdateName} autoFocus className="text-lg font-bold h-9" />
                        </div>
                      ) : (
                        <h2 className="text-lg font-bold text-stone-900 cursor-pointer hover:text-brand-700 transition-colors" onClick={() => { setNameValue(activeRecipe.name); setEditingName(true); }} title="Click to edit">
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
                        <p className="text-sm text-stone-500 mt-1 cursor-pointer hover:text-brand-600 transition-colors" onClick={() => { setServingsValue(String(activeRecipe.servings)); setServingNameValue(activeRecipe.servingName || 'serving'); setEditingServings(true); }} title="Click to edit">
                          {activeRecipe.servings} {activeRecipe.servingName || 'serving'} · Click to edit
                        </p>
                       )}
                       <div className="flex items-center gap-2 mt-1.5">
                         <span className="text-xs text-stone-500">Leftovers:</span>
                         <select
                           value={(activeRecipe as any).leftoverStorage || ''}
                           onChange={(e) => updateRecipe({ leftoverStorage: e.target.value || undefined } as any)}
                           className="h-6 rounded-md border border-input bg-background px-2 text-xs"
                         >
                           <option value="">Not set</option>
                           {STORAGE_LOCATIONS.map((loc) => (
                             <option key={loc} value={loc}>{STORAGE_LOCATION_META[loc].icon} {loc}</option>
                           ))}
                         </select>
                        </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => {
                            setCategoryDialogRecipeId(activeRecipe.id);
                            setCategoryDialogOpen(true);
                          }}
                        >
                          <Tag className="w-3.5 h-3.5" />Categories
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => setShareDialogOpen(true)}
                        >
                          <Share2 className="w-3.5 h-3.5" />Share
                        </Button>
                        <Button className="bg-brand-600 hover:bg-brand-700 gap-1 text-xs" size="sm" onClick={() => {
                          setSearchDialogOpen(true);
                          setSelectedFood(null);
                          setSelectedRecipeToAdd(null);
                          setRecipeMultiplier('1');
                          setRecipeAddMode('whole');
                          setRecipeServingsCount('1');
                          setSearchTab('fda');
                        }}>
                          <Search className="w-3.5 h-3.5" />Add Ingredient
                        </Button>
                       </div>
                     </div>
                </CardHeader>

                <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
                       <DialogContent className="sm:max-w-[540px] max-h-[80vh] flex flex-col overflow-hidden">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Search className="w-4 h-4 text-brand-600" />Add Ingredient
                          </DialogTitle>
                        </DialogHeader>
                        <Tabs value={searchTab} onValueChange={(v) => setSearchTab(v as 'fda' | 'recipes' | 'custom')} className="mt-2 flex-1 flex flex-col min-h-0">
                          <TabsList className="w-full flex-shrink-0">
                            <TabsTrigger value="fda" className="flex-1">Food Database</TabsTrigger>
                            <TabsTrigger value="recipes" className="flex-1">My Recipes</TabsTrigger>
                            <TabsTrigger value="custom" className="flex-1">Custom</TabsTrigger>
                          </TabsList>

                          <TabsContent value="fda" className="flex-1 flex flex-col min-h-0 gap-3 mt-4 overflow-hidden">
                            {searchSource === 'fallback' && (
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex-shrink-0">
                                <strong>Note:</strong> Network API is currently rate-limited. Showing results from built-in food database.
                              </div>
                            )}
                            {searchSource === 'local' && (
                              <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-xs text-brand-800 flex-shrink-0">
                                Results from <strong>local database</strong> — no API call needed.
                              </div>
                            )}
                            {searchSource && (
                              <Badge variant="outline" className={`text-[10px] h-5 gap-1 flex-shrink-0 w-fit ${searchSource === 'local' ? 'bg-brand-100 text-brand-700 border-brand-200' : searchSource === 'fda' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                {searchSource === 'local' ? 'Local DB' : searchSource === 'fda' ? 'Network' : 'Fallback'}
                              </Badge>
                            )}
                            <div className="flex gap-2 flex-shrink-0">
                              <Input placeholder="Search foods (e.g., chicken breast, rice)..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchFDA()} className="flex-1" />
                              <Button onClick={handleSearchFDA} disabled={isSearching || !searchQuery.trim()} className="bg-brand-600 hover:bg-brand-700">
                                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                              </Button>
                            </div>
                            {searchResults.length > 0 && (
                              <div className="flex-1 min-h-0 overflow-y-auto">
                                <div className="space-y-1">
                                  {searchResults.map((food) => (
                                    <div key={food.fdcId} className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedFood?.fdcId === food.fdcId ? 'border-brand-400 bg-brand-50' : 'border-stone-200 hover:border-brand-200 hover:bg-stone-50'}`} onClick={() => { setSelectedFood(food); setIngredientAmount('100'); setIngredientUnit(food.servingSizeUnit || 'g'); }}>
                                      <div className="font-medium text-sm text-stone-900">{food.description}</div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-[10px] h-5">{food.dataType}</Badge>
                                        {food.brandOwner && <span className="text-xs text-stone-400">{food.brandOwner}</span>}
                                        <span className="text-xs text-stone-400 ml-auto">{fmt(food.nutrients.calories)} cal per 100{food.servingSizeUnit || 'g'}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {searchResults.length === 0 && !isSearching && searchQuery && (
                              <p className="text-sm text-stone-400 text-center py-6">Click search to find foods</p>
                            )}
                            {selectedFood && (
                              <div className="border-t pt-4 space-y-3 flex-shrink-0">
                                <div className="bg-brand-50 p-3 rounded-lg">
                                  <p className="font-medium text-sm text-brand-900">{selectedFood.description}</p>
                                  <p className="text-xs text-brand-700 mt-1">
                                    {fmt(selectedFood.nutrients.calories)} cal · {fmt(selectedFood.nutrients.protein)}g protein · {fmt(selectedFood.nutrients.totalFat)}g fat · {fmt(selectedFood.nutrients.totalCarbs)}g carbs
                                    <span className="text-brand-500"> per 100{selectedFood.servingSizeUnit || 'g'}</span>
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
                                  <Button onClick={handleAddIngredient} disabled={!ingredientAmount || isLoading} className="bg-brand-600 hover:bg-brand-700 h-9">
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="recipes" className="flex-1 flex flex-col min-h-0 mt-4 overflow-hidden">
                            <div className="flex-1 min-h-0 overflow-y-auto">
                              <div className="space-y-1">
                                {recipes.filter(r => r.id !== activeRecipe?.id).length === 0 ? (
                                  <p className="text-sm text-stone-400 text-center py-6">No other recipes to add</p>
                                ) : (
                                  recipes.filter(r => r.id !== activeRecipe?.id).map(recipe => (
                                    <div key={recipe.id} className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedRecipeToAdd?.id === recipe.id ? 'border-brand-400 bg-brand-50' : 'border-stone-200 hover:border-brand-200 hover:bg-stone-50'}`} onClick={() => { setSelectedRecipeToAdd(recipe); setRecipeMultiplier('1'); }}>
                                      <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-brand-600" />
                                        <span className="font-medium text-sm text-stone-900">{recipe.name}</span>
                                      </div>
                                      <div className="text-xs text-stone-400 mt-1 ml-6">
                                        {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''} · {fmt(recipeTotalCalories(recipe.ingredients))} cal total
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                            {selectedRecipeToAdd && (
                              <div className="border-t pt-4 space-y-3">
                                <div className="bg-brand-50 p-3 rounded-lg">
                                  <p className="font-medium text-sm text-brand-900 flex items-center gap-2">
                                    <BookOpen className="w-3.5 h-3.5" />{selectedRecipeToAdd.name}
                                  </p>
                                  <p className="text-xs text-brand-700 mt-1">
                                    {fmt(recipeTotalCalories(selectedRecipeToAdd.ingredients))} cal total · {selectedRecipeToAdd.servings} {selectedRecipeToAdd.servingName || 'servings'}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant={recipeAddMode === 'whole' ? 'default' : 'outline'} className={recipeAddMode === 'whole' ? 'bg-brand-600 hover:bg-brand-700 h-8 text-xs' : 'h-8 text-xs'} onClick={() => setRecipeAddMode('whole')}>
                                    Whole Recipe
                                  </Button>
                                  <Button size="sm" variant={recipeAddMode === 'servings' ? 'default' : 'outline'} className={recipeAddMode === 'servings' ? 'bg-brand-600 hover:bg-brand-700 h-8 text-xs' : 'h-8 text-xs'} onClick={() => setRecipeAddMode('servings')}>
                                    By Servings
                                  </Button>
                                </div>
                                {recipeAddMode === 'whole' ? (
                                  <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                      <label className="text-xs font-medium text-stone-600 mb-1 block">Multiplier</label>
                                      <Input type="number" min="0.1" step="0.1" value={recipeMultiplier} onChange={(e) => setRecipeMultiplier(e.target.value)} className="h-9" />
                                    </div>
                                    <span className="text-sm text-stone-500 pb-2">× recipe</span>
                                    <Button onClick={handleAddRecipeAsIngredient} disabled={isLoading} className="bg-brand-600 hover:bg-brand-700 h-9">
                                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                      <label className="text-xs font-medium text-stone-600 mb-1 block">Servings</label>
                                      <Input type="number" min="0.1" step="0.5" value={recipeServingsCount} onChange={(e) => setRecipeServingsCount(e.target.value)} className="h-9" />
                                    </div>
                                    <span className="text-sm text-stone-500 pb-2">{selectedRecipeToAdd.servingName || 'servings'} (recipe makes {selectedRecipeToAdd.servings})</span>
                                    <Button onClick={handleAddRecipeAsIngredient} disabled={isLoading} className="bg-brand-600 hover:bg-brand-700 h-9">
                                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="custom" className="flex-1 flex flex-col min-h-0 mt-4 overflow-hidden">
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                              <div>
                                <label className="text-xs font-medium text-stone-600 mb-1 block">Ingredient Name</label>
                                <Input placeholder="e.g., My Spice Blend..." value={customName} onChange={(e) => setCustomName(e.target.value)} className="h-9" autoFocus />
                              </div>
                              <p className="text-xs text-stone-400">Enter nutrition facts per 100{customUnit || 'g'}. These will be scaled by the amount you specify.</p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Calories</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customCalories} onChange={(e) => setCustomCalories(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Protein (g)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customProtein} onChange={(e) => setCustomProtein(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Total Fat (g)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customTotalFat} onChange={(e) => setCustomTotalFat(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Total Carbs (g)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customTotalCarbs} onChange={(e) => setCustomTotalCarbs(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Saturated Fat (g)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customSaturatedFat} onChange={(e) => setCustomSaturatedFat(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Trans Fat (g)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customTransFat} onChange={(e) => setCustomTransFat(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Cholesterol (mg)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customCholesterol} onChange={(e) => setCustomCholesterol(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Sodium (mg)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customSodium} onChange={(e) => setCustomSodium(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Dietary Fiber (g)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customDietaryFiber} onChange={(e) => setCustomDietaryFiber(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Total Sugars (g)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customTotalSugars} onChange={(e) => setCustomTotalSugars(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Added Sugars (g)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customAddedSugars} onChange={(e) => setCustomAddedSugars(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Vitamin D (mcg)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customVitaminD} onChange={(e) => setCustomVitaminD(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Calcium (mg)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customCalcium} onChange={(e) => setCustomCalcium(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Iron (mg)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customIron} onChange={(e) => setCustomIron(e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div>
                                  <label className="text-[11px] text-stone-500 mb-0.5 block">Potassium (mg)</label>
                                  <Input type="number" min="0" step="0.1" placeholder="0" value={customPotassium} onChange={(e) => setCustomPotassium(e.target.value)} className="h-8 text-sm" />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 border-t pt-2">
                                <input type="checkbox" id="customSaveForReuse" checked={customSaveForReuse} onChange={(e) => setCustomSaveForReuse(e.target.checked)} className="rounded border-stone-300" />
                                <label htmlFor="customSaveForReuse" className="text-xs text-stone-500">Save to custom foods for reuse</label>
                              </div>
                              <div className="flex gap-3 items-end border-t pt-3">
                                <div className="flex-1">
                                  <label className="text-xs font-medium text-stone-600 mb-1 block">Amount</label>
                                  <Input type="number" min="0" step="0.1" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} className="h-9" />
                                </div>
                                <div className="w-24">
                                  <label className="text-xs font-medium text-stone-600 mb-1 block">Unit</label>
                                  <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                                    <option value="g">grams</option><option value="oz">oz</option><option value="cup">cup</option>
                                    <option value="tbsp">tbsp</option><option value="tsp">tsp</option><option value="ml">ml</option>
                                    <option value="lb">lb</option><option value="whole">whole</option>
                                  </select>
                                </div>
                                <Button onClick={handleAddCustomIngredient} disabled={!customName.trim() || isLoading} className="bg-brand-600 hover:bg-brand-700 h-9">
                                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
                                </Button>
                              </div>
                            </div>
                          </TabsContent>
                        </Tabs>
                       </DialogContent>
                     </Dialog>

                <CardContent className="pt-0">
                  <Separator className="mb-4" />

                  {/* Ingredients List */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                        <UtensilsCrossed className="w-4 h-4 text-brand-600" />Ingredients
                        <Badge variant="secondary" className="text-[10px] h-5 ml-1">{activeRecipe.ingredients.length}</Badge>
                      </h3>
                      {selectedIngredientIds.length >= 2 && (
                        <Button size="sm" className="h-7 text-xs gap-1 bg-brand-600 hover:bg-brand-700" onClick={handleGroupSelectedIngredients}>
                          <FolderOpen className="w-3.5 h-3.5" />Group ({selectedIngredientIds.length})
                        </Button>
                      )}
                    </div>
                    {activeRecipe.ingredients.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-stone-200 rounded-lg">
                        <Salad className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                        <p className="text-sm text-stone-400">No ingredients yet</p>
                        <p className="text-xs text-stone-300 mt-1">Click &quot;Add Ingredient&quot; to search the food database or add a recipe</p>
                      </div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleIngredientDragEnd}>
                        <SortableContext items={activeRecipe.ingredients.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1.5">
                            {ingredientSlots.map((slot) => {
                              if (slot.type === 'group') {
                                const isEditingThisGroup = editingGroupId === slot.group.id && editingGroupType === 'ingredient';
                                const isCollapsed = collapsedIngredientGroups.has(slot.group.id);
                                return (
                                  <div key={slot.group.id} className="border border-brand-200 rounded-lg overflow-hidden bg-brand-50/30">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border-b border-brand-200">
                                      <button
                                        className="text-brand-600 hover:text-brand-800 shrink-0"
                                        onClick={() => {
                                          setCollapsedIngredientGroups((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(slot.group.id)) next.delete(slot.group.id);
                                            else next.add(slot.group.id);
                                            return next;
                                          });
                                        }}
                                      >
                                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      </button>
                                      <FolderOpen className="w-3.5 h-3.5 text-brand-600" />
                                      {isEditingThisGroup ? (
                                        <Input value={editingGroupTitleValue} onChange={(e) => setEditingGroupTitleValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleFinishEditGroupTitle(); if (e.key === 'Escape') setEditingGroupId(null); }} onBlur={handleFinishEditGroupTitle} autoFocus className="h-6 text-sm flex-1 bg-white" />
                                      ) : (
                                        <span className="text-sm font-medium text-brand-800 flex-1 cursor-pointer hover:text-brand-600" onClick={() => handleStartEditGroupTitle(slot.group.id, slot.group.title, 'ingredient')}>
                                          {slot.group.title}
                                        </span>
                                      )}
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-400 hover:text-destructive" onClick={() => removeIngredientGroup(slot.group.id)}>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    {!isCollapsed && (
                                    <div className="p-1.5 space-y-1.5">
                                      {slot.items.map((ingredient) => (
                                        <SortableIngredientItem
                                          key={ingredient.id}
                                          ingredient={ingredient}
                                          isSelected={selectedIngredientIds.includes(ingredient.id)}
                                           isEditing={editIngredientId === ingredient.id}
                                           editName={editName}
                                           editDescription={editDescription}
                                          editAmount={editAmount}
                                          editUnit={editUnit}
                                          isLoading={isLoading}
                                          isGrouped
                                          onToggleSelect={() => toggleIngredientSelect(ingredient.id)}
                                           onEdit={() => { setEditIngredientId(ingredient.id); setEditName(ingredient.name); setEditDescription(ingredient.description || ''); setEditAmount(String(ingredient.amount)); setEditUnit(ingredient.unit); setEditPrepInstructions(ingredient.prepInstructions || []); setEditStorageLocation((ingredient as any).storageLocation || ''); }}
                                            onRemove={() => removeIngredient(ingredient.id)}
                                            onRemoveFromGroup={() => moveIngredientToGroup(ingredient.id, null)}
                                            onSaveEdit={handleSaveIngredientEdit}
                                            onCancelEdit={() => setEditIngredientId(null)}
                                            onEditName={setEditName}
                                           onEditDescription={setEditDescription}
                                           onEditAmount={setEditAmount}
                                           onEditUnit={setEditUnit}
                                           prepInstructions={editPrepInstructions}
                                           onAddPrepInstruction={() => setEditPrepInstructions((prev) => [...prev, ''])}
                                           onRemovePrepInstruction={(idx) => setEditPrepInstructions((prev) => prev.filter((_, i) => i !== idx))}
                                           onUpdatePrepInstruction={(idx, val) => setEditPrepInstructions((prev) => prev.map((p, i) => i === idx ? val : p))}
                                           editStorageLocation={editStorageLocation}
                                           onEditStorageLocation={setEditStorageLocation}
                                        />
                                      ))}
                                    </div>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <SortableIngredientItem
                                  key={slot.ingredient.id}
                                  ingredient={slot.ingredient}
                                  isSelected={selectedIngredientIds.includes(slot.ingredient.id)}
                                  isEditing={editIngredientId === slot.ingredient.id}
                                  editName={editName}
                                  editDescription={editDescription}
                                  editAmount={editAmount}
                                  editUnit={editUnit}
                                  isLoading={isLoading}
                                  isGrouped={false}
                                  onToggleSelect={() => toggleIngredientSelect(slot.ingredient.id)}
                                  onEdit={() => { setEditIngredientId(slot.ingredient.id); setEditName(slot.ingredient.name); setEditDescription(slot.ingredient.description || ''); setEditAmount(String(slot.ingredient.amount)); setEditUnit(slot.ingredient.unit); setEditPrepInstructions(slot.ingredient.prepInstructions || []); setEditStorageLocation((slot.ingredient as any).storageLocation || ''); }}
                                  onRemove={() => removeIngredient(slot.ingredient.id)}
                                  onSaveEdit={handleSaveIngredientEdit}
                                  onCancelEdit={() => setEditIngredientId(null)}
                                  onEditName={setEditName}
                                  onEditDescription={setEditDescription}
                                  onEditAmount={setEditAmount}
                                  onEditUnit={setEditUnit}
                                  prepInstructions={editPrepInstructions}
                                  onAddPrepInstruction={() => setEditPrepInstructions((prev) => [...prev, ''])}
                                  onRemovePrepInstruction={(idx) => setEditPrepInstructions((prev) => prev.filter((_, i) => i !== idx))}
                                  onUpdatePrepInstruction={(idx, val) => setEditPrepInstructions((prev) => prev.map((p, i) => i === idx ? val : p))}
                                  editStorageLocation={editStorageLocation}
                                  onEditStorageLocation={setEditStorageLocation}
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
                        <Button size="sm" className="h-7 text-xs gap-1 bg-brand-600 hover:bg-brand-700" onClick={handleGroupSelectedSteps}>
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
                                const isCollapsed = collapsedInstructionGroups.has(slot.group.id);
                                return (
                                  <div key={slot.group.id} className="border border-brand-200 rounded-lg overflow-hidden bg-brand-50/30">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 border-b border-brand-200">
                                      <button
                                        className="text-brand-600 hover:text-brand-800 shrink-0"
                                        onClick={() => {
                                          setCollapsedInstructionGroups((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(slot.group.id)) next.delete(slot.group.id);
                                            else next.add(slot.group.id);
                                            return next;
                                          });
                                        }}
                                      >
                                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      </button>
                                      <FolderOpen className="w-3.5 h-3.5 text-brand-600" />
                                      {isEditingThisGroup ? (
                                        <Input value={editingGroupTitleValue} onChange={(e) => setEditingGroupTitleValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleFinishEditGroupTitle(); if (e.key === 'Escape') setEditingGroupId(null); }} onBlur={handleFinishEditGroupTitle} autoFocus className="h-6 text-sm flex-1 bg-white" />
                                      ) : (
                                        <span className="text-sm font-medium text-brand-800 flex-1 cursor-pointer hover:text-brand-600" onClick={() => handleStartEditGroupTitle(slot.group.id, slot.group.title, 'instruction')}>
                                          {slot.group.title}
                                        </span>
                                      )}
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-400 hover:text-destructive" onClick={() => removeInstructionGroup(slot.group.id)}>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    {!isCollapsed && (
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
                                    )}
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
                        <Button onClick={handleSaveStep} disabled={!stepText.trim() || isLoading} className="bg-brand-600 hover:bg-brand-700 gap-1 text-sm" size="sm">
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
                    <div className="mt-4 p-3 bg-brand-50 rounded-lg border border-brand-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-brand-800">Total Recipe Nutrition</span>
                        <div className="flex gap-3 text-brand-700">
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

          {/* Right Panel: Nutrition Label + Preview Button */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-6">
              <Card className="border-stone-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                    <Salad className="w-4 h-4 text-brand-600" />Nutrition Facts Label
                  </CardTitle>
                  <p className="text-xs text-stone-400">Nutrition label auto-generated from your ingredients</p>
                  {activeRecipe && recipeTemplates.length > 0 && (
                    <Button
                      className="w-full mt-2 bg-brand-600 hover:bg-brand-700 gap-2"
                      onClick={() => setPreviewDialogOpen(true)}
                    >
                      <Eye className="w-4 h-4" />Preview Recipe
                    </Button>
                  )}
                  {activeRecipe && (
                    <Button
                      variant="outline"
                      className="w-full mt-2 gap-2"
                      onClick={handleExportNutritionLabel}
                    >
                      <Download className="w-4 h-4" />Export Nutrition Label
                    </Button>
                  )}
                  {activeRecipe && estimatedGL && (
                    <div className="flex items-center gap-2 mt-3" title={`The Estimated Glycemic Load for this recipe is ${estimatedGL.category} (${estimatedGL.gl})${GL_HOVER_KEY}`}>
                      <span className="text-xs text-stone-600">Estimated Glycemic Load:</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${estimatedGL.colorClass}`}>
                        {estimatedGL.category} ({estimatedGL.gl})
                      </span>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex justify-center" ref={nutritionLabelRef}>
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

      {/* Full-Screen Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] w-full h-full p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-white shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-600" />Recipe Preview
              </h2>
              <select
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                value={activeRecipeTemplate?.id || ''}
                onChange={(e) => setSelectedRecipeTemplateId(e.target.value || null)}
              >
                {recipeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {activeRecipeTemplate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setPreviewDialogOpen(false);
                    window.location.href = `/settings/templates/new?from=${activeRecipeTemplate.id}`;
                  }}
                >
                  <Plus className="w-3 h-3" />Add Template
                </Button>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewDialogOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto bg-stone-100 p-6">
            <div className="flex justify-center">
              {activeRecipe && activeRecipeTemplate ? (
                <div className="bg-white shadow-lg" style={{ maxWidth: 800 }}>
                  <RecipeRenderer
                    recipe={{
                      name: activeRecipe.name,
                      servings: activeRecipe.servings,
                      servingName: activeRecipe.servingName,
                      ingredients: activeRecipe.ingredients.map((i) => ({
                        id: i.id,
                        name: i.name,
                        amount: i.amount,
                        unit: i.unit,
                        description: i.description,
                        groupId: i.groupId,
                      })),
                      ingredientGroups: activeRecipe.ingredientGroups,
                      instructionSteps: activeRecipe.instructionSteps,
                      instructionGroups: activeRecipe.instructionGroups,
                    }}
                    template={activeRecipeTemplate}
                    nutritionData={activeRecipe.servings > 1 ? perServingNutrition : nutritionData}
                  />
                </div>
              ) : (
                <p className="text-sm text-stone-400">No template available.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Creation Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-brand-600" />
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
              <Button size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1" onClick={handleGroupDialogConfirm} disabled={!groupDialogTitle.trim()}>
                <Check className="w-3.5 h-3.5" />Create Group
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Assignment Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={(open) => { setCategoryDialogOpen(open); if (!open) { setNewCategoryName(''); setSelectedParentCategoryId(null); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-600" />Manage Categories
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder={selectedParentCategoryId ? `New child category...` : `New category name...`}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && newCategoryName.trim()) {
                  const parentId = selectedParentCategoryId || null;
                  const cat = await createCategory(newCategoryName.trim(), parentId);
                  setNewCategoryName('');
                  setSelectedParentCategoryId(null);
                  if (categoryDialogRecipeId) await assignCategory(categoryDialogRecipeId, cat.id);
                }
              }}
              className="flex-1 h-9"
            />
            {selectedParentCategoryId && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-xs gap-1 shrink-0"
                onClick={() => setSelectedParentCategoryId(null)}
              >
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              className="h-9 bg-brand-600 hover:bg-brand-700 gap-1"
              disabled={!newCategoryName.trim()}
              onClick={async () => {
                const parentId = selectedParentCategoryId || null;
                const cat = await createCategory(newCategoryName.trim(), parentId);
                setNewCategoryName('');
                setSelectedParentCategoryId(null);
                if (categoryDialogRecipeId) await assignCategory(categoryDialogRecipeId, cat.id);
              }}
            >
              <Plus className="w-3.5 h-3.5" />{selectedParentCategoryId ? 'Add Child' : 'Add'}
            </Button>
          </div>
          <div className="space-y-0.5 max-h-[340px] overflow-y-auto">
            {categoryTree.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-4">
                No categories yet. Create one above.
              </p>
            ) : (
              categoryTree.map((node) => (
                <CategoryTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  recipeId={categoryDialogRecipeId}
                  recipeCategories={recipeCategories}
                  selectedId={selectedParentCategoryId}
                  onSelect={setSelectedParentCategoryId}
                  onAssign={assignCategory}
                  onUnassign={unassignCategory}
                  onDelete={deleteCategory}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {activeRecipe && (
        <ShareDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          recipe={activeRecipe as any}
        />
      )}
    </>
  );
}

interface CategoryTreeNodeProps {
  node: { id: string; name: string; children: CategoryTreeNodeProps['node'][] };
  depth: number;
  recipeId: string | null;
  recipeCategories: Map<string, { categoryId: string }[]>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAssign: (recipeId: string, categoryId: string) => Promise<void>;
  onUnassign: (recipeId: string, categoryId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function countDescendants(node: CategoryTreeNodeProps['node']): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}

function CategoryTreeNode({ node, depth, recipeId, recipeCategories, selectedId, onSelect, onAssign, onUnassign, onDelete }: CategoryTreeNodeProps) {
  const isAssigned = recipeId
    ? (recipeCategories.get(recipeId) || []).some((rc) => rc.categoryId === node.id)
    : false;
  const isSelected = selectedId === node.id;
  const childCount = countDescendants(node);

  return (
    <>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer group ${isSelected ? 'bg-brand-100 ring-1 ring-brand-300' : 'hover:bg-stone-50'}`}
        onClick={() => onSelect(isSelected ? null : node.id)}
      >
        <div style={{ paddingLeft: depth * 16 }}>
          <Checkbox
            checked={isAssigned}
            onCheckedChange={async (checked) => {
              if (!recipeId) return;
              if (checked) await onAssign(recipeId, node.id);
              else await onUnassign(recipeId, node.id);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <span className="text-sm text-stone-700 flex-1 truncate">{node.name}</span>
        {isSelected && (
          <span className="text-[10px] text-brand-600 font-medium shrink-0">Add child ↵</span>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-stone-400 hover:text-red-500 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{node.name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                {childCount > 0
                  ? `This will also delete ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'}. `
                  : ''}
                Recipes in this category will not be deleted. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={async () => {
                  await onDelete(node.id);
                  if (isSelected) onSelect(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {node.children.map((child) => (
        <CategoryTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          recipeId={recipeId}
          recipeCategories={recipeCategories}
          selectedId={selectedId}
          onSelect={onSelect}
          onAssign={onAssign}
          onUnassign={onUnassign}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

interface SortableIngredientItemProps {
  ingredient: Ingredient;
  isSelected: boolean;
  isEditing: boolean;
  editName: string;
  editDescription: string;
  editAmount: string;
  editUnit: string;
  isLoading: boolean;
  isGrouped: boolean;
  prepInstructions: string[];
  editStorageLocation: string;
  onToggleSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onRemoveFromGroup?: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditName: (v: string) => void;
  onEditDescription: (v: string) => void;
  onEditAmount: (v: string) => void;
  onEditUnit: (v: string) => void;
  onAddPrepInstruction: () => void;
  onRemovePrepInstruction: (idx: number) => void;
  onUpdatePrepInstruction: (idx: number, value: string) => void;
  onEditStorageLocation: (v: string) => void;
}

function SortableIngredientItem({
  ingredient,
  isSelected,
  isEditing,
  editName,
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
  onEditName,
  onEditDescription,
  onEditAmount,
  onEditUnit,
  prepInstructions,
  onAddPrepInstruction,
  onRemovePrepInstruction,
  onUpdatePrepInstruction,
  editStorageLocation,
  onEditStorageLocation,
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
          isSelected ? 'border-brand-400 bg-brand-50' :
          'border-stone-200 hover:border-brand-300'
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
            {(ingredient as any).storageLocation && STORAGE_LOCATION_META[(ingredient as any).storageLocation as StorageLocation] && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 text-stone-500">
                {STORAGE_LOCATION_META[(ingredient as any).storageLocation as StorageLocation].icon} {(ingredient as any).storageLocation}
              </span>
            )}
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
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-300 hover:text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }} title="Remove from group">
              <FolderOpen className="w-3 h-3" />
            </Button>
          )}
          <Pencil className="w-3.5 h-3.5 text-stone-300 group-hover:text-brand-500 transition-colors" />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {isEditing && (
        <div className="mt-1 p-3 bg-brand-50 border border-brand-200 rounded-lg space-y-3">
          <div>
            <label className="text-xs font-medium text-stone-600 mb-1 block">Name</label>
            <Input placeholder={ingredient.name} value={editName} onChange={(e) => onEditName(e.target.value)} className="h-8 text-sm" autoFocus />
          </div>
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
            <Button size="sm" className="bg-brand-600 hover:bg-brand-700 h-8 gap-1" onClick={onSaveEdit} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Save</>}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onCancelEdit}>Cancel</Button>
          </div>
          <div className="border-t border-brand-200 pt-2 mt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-stone-600">Prep Instructions</label>
              <Button variant="ghost" size="sm" className="h-5 text-xs text-brand-600 hover:text-brand-700" onClick={onAddPrepInstruction}>
                <Plus className="w-3 h-3 mr-1" />Add
              </Button>
            </div>
            {prepInstructions.length === 0 && (
              <p className="text-xs text-stone-400">No prep instructions</p>
            )}
            {prepInstructions.map((instr, idx) => (
              <div key={idx} className="flex items-center gap-1.5 mb-1.5">
                <Input
                  value={instr}
                  placeholder="e.g., Dice into 1/4 inch cubes..."
                  onChange={(e) => onUpdatePrepInstruction(idx, e.target.value)}
                  className="h-7 text-xs flex-1"
                />
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-400 hover:text-red-500" onClick={() => onRemovePrepInstruction(idx)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="border-t border-brand-200 pt-2 mt-1">
            <label className="text-xs font-medium text-stone-600 mb-1 block">Store in</label>
            <select
              value={editStorageLocation}
              onChange={(e) => onEditStorageLocation(e.target.value)}
              className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Not set</option>
              {STORAGE_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>{STORAGE_LOCATION_META[loc].icon} {loc}</option>
              ))}
            </select>
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
        isActive ? 'border-brand-400 bg-brand-50' :
        isSelected ? 'border-brand-400 bg-brand-50' :
        'border-stone-200 hover:border-brand-300 hover:bg-stone-50'
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
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center mt-0.5">
        {stepNumber}
      </span>
      <p className="flex-1 text-sm text-stone-700 whitespace-pre-wrap">{step.text}</p>
      <div className="flex items-center gap-1">
        {isGrouped && onRemoveFromGroup && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-300 hover:text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }} title="Remove from group">
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

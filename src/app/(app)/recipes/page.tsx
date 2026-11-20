'use client';

import React, { Suspense, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useRecipes,
  useRecipe,
  useCreateRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useAddIngredient,
  useUpdateIngredient,
  useFoodStorageDefaults,
  useFoodStorageDefaultLookup,
  defaultLocationForFood,
  useRemoveIngredient,
  useReorderIngredients,
  useUpdateRecipeGroups,
  buildIngredientData,
  buildIngredientRematchUpdate,
  buildCustomIngredientData,
  buildRecipeAsIngredientData,
  buildRescaledIngredientUpdate,
  buildInstructionUpdate,
  computeIngredientGroupUpdate,
  computeRemoveIngredientGroup,
  computeRenameIngredientGroup,
  computeMoveIngredientToGroup,
  computeInstructionGroupUpdate,
  computeRemoveInstructionGroup,
  computeRenameInstructionGroup,
  computeMoveInstructionToGroup,
  type FDAFood,
  type InstructionStep,
  type Ingredient,
  type IngredientGroup,
  type InstructionGroup,
  type Recipe,
} from '@/hooks/use-recipes';
import { useCategories, useRecipeCategories, useCreateCategory, useDeleteCategory, useAssignCategory, useUnassignCategory, type CategoryNode } from '@/hooks/use-categories';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { downloadRecipeBundle, safeBundleFilename, summarizeRecipeBundleImport } from '@/lib/recipe-bundles';
import { ImportZipButton } from '@/components/import-zip-button';
import { useRecipeImport } from '@/components/recipe/recipe-import-workflow';
import { markdownDraftToBundle } from '@/lib/recipe-import-bundle';
import Link from 'next/link';
import { generateUUID } from '@/lib/utils';
import { recipeNutrition, recipeMissingNutrients, emptyNutrition, serializeInstructions, type NutrientKeys } from '@/lib/recipe-types';
import { searchFDAFoods } from '@/lib/fda-client';
import { hasMeaningfulNutrition } from '@/lib/food-eligibility';
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
  Clock,
} from 'lucide-react';
import { toCanvas } from 'html-to-image';
import { fmt } from '@/lib/format';
import { useTemplates } from '@/hooks/use-templates';
import { DietaryFilters, applyDietaryFilters } from '@/components/dietary/dietary-filters';
import { useDietaryProfiles, useDietaryRecipeAssessments, useRestoreDiabetesAwareProfile } from '@/hooks/use-dietary';
import { filterByNutritionAssessment } from '@/lib/dietary-rules';
import type { DietaryTag } from '@/lib/types';
import RecipeRenderer from '@/components/recipe-renderer';
import { ShareDialog } from '@/components/recipe/share-dialog';
import { CustomNutritionEditor } from '@/components/recipe/custom-nutrition-editor';
import { ScalingControls } from '@/components/recipe/scaling-controls';
import { RecipeImportDialog } from '@/components/recipe/recipe-import-dialog';
import { cloneImportDraft, isImportDraftReady, parseSeedRecipeMarkdown, resetImportDraft, type ImportRecipeDraft } from '@/lib/recipe-import';
import { STORAGE_LOCATIONS, STORAGE_LOCATION_META } from '@/data/storage-locations';
import { StorageDefaultControl } from '@/components/recipe/storage-default-control';
import { IngredientStorageTag } from '@/components/recipe/ingredient-storage-tag';
import { IngredientMatchEditor } from '@/components/recipe/ingredient-match-editor';
import { RecipeTransferStatus } from '@/components/recipe/recipe-transfer-status';

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

function recipeTotalCalories(recipe: Recipe): number {
  return recipeNutrition(recipe).calories;
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
  const { importFile, importBundle, decisionDialog } = useRecipeImport();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: recipes = [], isFetching: recipesRefreshing, isError: recipesError } = useRecipes();
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(searchParams.get('recipeId'));
  const { data: activeRecipe } = useRecipe(activeRecipeId ?? '');

  const createRecipeMutation = useCreateRecipe();
  const updateRecipeMutation = useUpdateRecipe();
  const deleteRecipeMutation = useDeleteRecipe();
  const addIngredientMutation = useAddIngredient();
  const updateIngredientMutation = useUpdateIngredient();
  useFoodStorageDefaults();
  const lookupFoodStorageDefaults = useFoodStorageDefaultLookup();
  const removeIngredientMutation = useRemoveIngredient();
  const reorderIngredientsMutation = useReorderIngredients();
  const updateGroupsMutation = useUpdateRecipeGroups();

  const isMutating =
    createRecipeMutation.isPending ||
    updateRecipeMutation.isPending ||
    deleteRecipeMutation.isPending ||
    addIngredientMutation.isPending ||
    updateIngredientMutation.isPending ||
    removeIngredientMutation.isPending ||
    reorderIngredientsMutation.isPending ||
    updateGroupsMutation.isPending;

  const { categories, categoryTree } = useCategories();
  const createCategoryMutation = useCreateCategory();
  const deleteCategoryMutation = useDeleteCategory();
  const assignCategoryMutation = useAssignCategory();
  const unassignCategoryMutation = useUnassignCategory();

  const { data: templates = [] } = useTemplates();

  const { profiles: dietaryProfiles, activeProfileId: activeDietaryProfileId, isError: dietaryProfilesError, isFetching: dietaryProfilesRefreshing } = useDietaryProfiles();
  const activeDietaryProfile = useMemo(
    () => dietaryProfiles.find((p) => p.id === activeDietaryProfileId) ?? null,
    [dietaryProfiles, activeDietaryProfileId]
  );

  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [excludeAllergens, setExcludeAllergens] = useState(false);
  const [diabetesProfileId, setDiabetesProfileId] = useState<string | null>(null);
  const restoreDiabetesProfile = useRestoreDiabetesAwareProfile();
  const [diabetesRestoreRequested, setDiabetesRestoreRequested] = useState(false);
  const restoreSelectionGeneration = useRef(0);
  useEffect(() => () => { restoreSelectionGeneration.current++; }, []);
  const diabetesProfile = dietaryProfiles.find(p => p.id === diabetesProfileId && p.dietaryTags.includes('diabetesAware')) ?? null;
  const diabetesAssessments = useDietaryRecipeAssessments(diabetesProfile, recipes);
  const diabetesFilterRequested = !!diabetesProfileId || diabetesRestoreRequested;
  const assessmentError = !!diabetesProfileId && (recipesError || dietaryProfilesError ||
    (!diabetesProfile && !dietaryProfilesRefreshing) || (!!diabetesProfile && diabetesAssessments.isError));
  const restoreError = restoreDiabetesProfile.isError;
  const assessmentPending = restoreDiabetesProfile.isPending || (!!diabetesProfileId && !assessmentError &&
    (!diabetesProfile || diabetesAssessments.isPending || diabetesAssessments.isFetching || recipesRefreshing || dietaryProfilesRefreshing));
  const assessedRecipeIds = new Set(diabetesAssessments.data?.filter(a => a.status !== 'notAssessed').map(a => a.recipeId));
  const notAssessedCount = diabetesAssessments.data
    ? recipes.filter(recipe => !assessedRecipeIds.has(recipe.id)).length
    : 0;

  const [selectedRecipeTemplateId, setSelectedRecipeTemplateId] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogRecipeId, setCategoryDialogRecipeId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedParentCategoryId, setSelectedParentCategoryId] = useState<string | null>(null);

  const [newRecipeName, setNewRecipeName] = useState('');
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
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
  const [ingredientSaveStatus, setIngredientSaveStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [foodSelectionError, setFoodSelectionError] = useState('');
  const [isAddingFood, setIsAddingFood] = useState(false);
  const addingFoodRef = useRef(false);
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
    const normalizedSearch = recipeSearchQuery.trim().toLowerCase();
    if (normalizedSearch) {
      result = result.filter((recipe) => {
        const searchableText = [
          recipe.name,
          recipe.servingName,
          ...recipe.ingredients.map((ingredient) => ingredient.name),
          ...recipe.instructionSteps.map((step) => step.text),
        ].join(' ').toLowerCase();
        return searchableText.includes(normalizedSearch);
      });
    }
    if (filteredRecipeIds) {
      result = result.filter(r => filteredRecipeIds.has(r.id));
    }
    if (dietaryTags.length > 0 || excludeAllergens) {
      result = applyDietaryFilters(result as any, dietaryTags, excludeAllergens, activeDietaryProfile) as any;
    }
    if (diabetesFilterRequested) {
      result = !diabetesProfile || assessmentPending || assessmentError
        ? []
        : filterByNutritionAssessment(result, diabetesAssessments.data, diabetesProfile);
    }
    return result;
  }, [recipes, recipeSearchQuery, filteredRecipeIds, dietaryTags, excludeAllergens, activeDietaryProfile, diabetesFilterRequested, diabetesProfile, assessmentPending, assessmentError, diabetesAssessments.data]);

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FDAFood[]>([]);
  const [searchSource, setSearchSource] = useState<'fda' | 'fallback' | 'local' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const nutritionLabelRef = useRef<HTMLDivElement>(null);

  const { data: recipeCategoriesArray = [] } = useRecipeCategories(activeRecipe?.id ?? '');
  const recipeCategories = useMemo(() => {
    if (!activeRecipe?.id) return new Map<string, { categoryId: string; id: string }[]>();
    return new Map([[activeRecipe.id, recipeCategoriesArray.map(rc => ({ categoryId: rc.categoryId, id: rc.id }))]]);
  }, [activeRecipe?.id, recipeCategoriesArray]);

  useEffect(() => {
    if (!categoryFilterId) {
      setFilteredRecipeIds(null);
      return;
    }
    let cancelled = false;
    const api = getApiClient();
    (async () => {
      const descendantIds = await api.getCategoryDescendants(categoryFilterId);
      const recipeIdSets = await Promise.all(
        descendantIds.map(id => api.getRecipesByCategory(id))
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
  const [importing, setImporting] = useState(false);
  const [markdownImportOpen, setMarkdownImportOpen] = useState(false);
  const [markdownImportDrafts, setMarkdownImportDrafts] = useState<ImportRecipeDraft[]>([]);
  const [markdownImportIndex, setMarkdownImportIndex] = useState(0);
  const [markdownImportSaving, setMarkdownImportSaving] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const handleExportRecipe = useCallback(async (recipeId: string, name: string) => {
    setTransferStatus(null);
    setExportingId(recipeId);
    try {
      const bundle = await getApiClient().exportRecipeBundle({ recipeIds: [recipeId] });
      downloadRecipeBundle(bundle, safeBundleFilename(name, 'recipe'));
    } catch (e) {
      setTransferStatus({ kind: 'err', msg: `Export failed: ${e instanceof Error ? e.message : 'error'}` });
    } finally {
      setExportingId(null);
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    setImporting(true);
    setTransferStatus(null);
    try {
      const result = await importFile(file);
      setTransferStatus({ kind: 'ok', msg: summarizeRecipeBundleImport(result) });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
    } catch (e) {
      setTransferStatus({ kind: 'err', msg: `Import failed: ${e instanceof Error ? e.message : 'error'}` });
    } finally {
      setImporting(false);
    }
  }, [queryClient, importFile]);

  const handleMarkdownImportFiles = useCallback(async (files: File[]) => {
    setImporting(true);
    setTransferStatus(null);
    try {
      const markdownFiles = files.filter((file) => {
        const path = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, '/');
        return /\.md$/i.test(file.name) && !path.includes('seed-recipes/dist/') && !path.includes('/dist/');
      });
      if (markdownFiles.length === 0) {
        setTransferStatus({ kind: 'err', msg: 'No supported markdown recipe files selected.' });
        return;
      }
      const drafts = await Promise.all(markdownFiles.map(async (file) => parseSeedRecipeMarkdown(await file.text(), file.name)));
      setMarkdownImportDrafts(drafts);
      setMarkdownImportIndex(0);
      setMarkdownImportOpen(true);
      if (markdownFiles.length !== files.length) {
        setTransferStatus({ kind: 'ok', msg: `Queued ${drafts.length} markdown recipe${drafts.length === 1 ? '' : 's'}; ignored unsupported/dist files.` });
      }
    } catch (e) {
      setTransferStatus({ kind: 'err', msg: `Markdown import failed: ${e instanceof Error ? e.message : 'error'}` });
    } finally {
      setImporting(false);
    }
  }, []);

  const removeCurrentMarkdownDraft = useCallback((message?: string) => {
    setMarkdownImportDrafts((prev) => {
      const next = prev.filter((_, index) => index !== markdownImportIndex);
      if (next.length === 0) {
        setMarkdownImportOpen(false);
        setMarkdownImportIndex(0);
        if (message) setTransferStatus({ kind: 'ok', msg: message });
        return [];
      }
      setMarkdownImportIndex((idx) => Math.min(idx, next.length - 1));
      return next;
    });
  }, [markdownImportIndex]);

  const handleMarkdownDraftChange = useCallback((index: number, draft: ImportRecipeDraft) => {
    setMarkdownImportDrafts((prev) => prev.map((item, idx) => idx === index ? cloneImportDraft(draft) : item));
  }, []);

  const handleUndoMarkdownDraft = useCallback(() => {
    setMarkdownImportDrafts((prev) => prev.map((draft, index) => index === markdownImportIndex ? resetImportDraft(draft) : draft));
  }, [markdownImportIndex]);

  const handleSkipMarkdownDraft = useCallback(() => {
    removeCurrentMarkdownDraft('Skipped recipe import.');
  }, [removeCurrentMarkdownDraft]);

  const handleSaveMarkdownDraft = useCallback(async () => {
    const draft = markdownImportDrafts[markdownImportIndex];
    if (!draft || !isImportDraftReady(draft)) return;
    setMarkdownImportSaving(true);
    setTransferStatus(null);
    try {
      const customFoods = draft.ingredients.some(ingredient => ingredient.matchedFood?.customFoodId)
        ? await getApiClient().getCustomFoods() : [];
      const result = await importBundle(markdownDraftToBundle(draft, customFoods));
      removeCurrentMarkdownDraft(`Import result for ${draft.title}: ${summarizeRecipeBundleImport(result)}`);
    } catch (e) {
      setTransferStatus({ kind: 'err', msg: `Markdown import save failed: ${e instanceof Error ? e.message : 'error'}` });
    } finally {
      setMarkdownImportSaving(false);
    }
  }, [markdownImportDrafts, markdownImportIndex, importBundle, removeCurrentMarkdownDraft]);

  const handleCreateRecipe = useCallback(async () => {
    if (!newRecipeName.trim()) return;
    const recipe = await createRecipeMutation.mutateAsync(newRecipeName.trim());
    setActiveRecipeId(recipe.id);
    setNewRecipeName('');
  }, [newRecipeName, createRecipeMutation]);

  const handleSearchFDA = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSearchSource(null);
    try {
      const result = await searchFDAFoods(searchQuery.trim());
      let customFoods: FDAFood[] = [];
      try {
        const api = getApiClient();
        const allCustom = await api.getCustomFoods();
        const q = searchQuery.trim().toLowerCase();
        customFoods = allCustom
          .filter((f) => f.name.toLowerCase().includes(q) && hasMeaningfulNutrition(f))
          .map((f) => ({
            fdcId: -2,
            customFoodId: f.id,
            description: f.name,
            brandOwner: null as string | null,
            dataType: 'Custom',
            servingSize: 100,
            servingSizeUnit: 'g',
            nutrients: {
              calories: f.calories, totalFat: f.totalFat, saturatedFat: f.saturatedFat,
              transFat: f.transFat, cholesterol: f.cholesterol, sodium: f.sodium,
              totalCarbs: f.totalCarbs, dietaryFiber: f.dietaryFiber, totalSugars: f.totalSugars,
              addedSugars: f.addedSugars, protein: f.protein, vitaminD: f.vitaminD,
              calcium: f.calcium, iron: f.iron, potassium: f.potassium,
            },
          }));
      } catch {}
      const allFoods = [...customFoods, ...result.foods.map((r) => ({ ...r }))].filter((food) => hasMeaningfulNutrition(food.nutrients));
      setSearchResults(allFoods);
      setSearchSource(customFoods.length > 0 && result.foods.length === 0 ? 'local' : result.source === 'fallback' ? 'fallback' : result.source === 'local' ? 'local' : 'fda');
    } catch {
      setSearchResults([]);
      setSearchSource(null);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleRematchIngredient = useCallback(async (ingredient: Ingredient, food: FDAFood, amount: number, unit: string) => {
    if (!activeRecipeId || ingredient.linkedRecipeId) return;
    const previousEditLocation = editStorageLocation;
    const defaults = await lookupFoodStorageDefaults();
    const nextLocation = defaultLocationForFood(food, defaults);
    await updateIngredientMutation.mutateAsync({
      recipeId: activeRecipeId,
      ingredientId: ingredient.id,
      data: buildIngredientRematchUpdate(ingredient, food, nextLocation, amount, unit),
    });
    if (editIngredientId === ingredient.id && !ingredient.storageLocation && nextLocation) {
      setEditStorageLocation(current => current === previousEditLocation ? nextLocation : current);
    }
  }, [activeRecipeId, updateIngredientMutation, lookupFoodStorageDefaults, editIngredientId, editStorageLocation]);

  const handleSaveIngredientStorageLocation = useCallback(async (ingredient: Ingredient, location: string) => {
    if (!activeRecipeId || ingredient.linkedRecipeId) throw new Error('This ingredient cannot be updated.');
    await updateIngredientMutation.mutateAsync({
      recipeId: activeRecipeId,
      ingredientId: ingredient.id,
      data: buildRescaledIngredientUpdate(ingredient, { storageLocation: location }),
    });
  }, [activeRecipeId, updateIngredientMutation]);

  const handleAddIngredient = useCallback(async () => {
    if (!selectedFood || !ingredientAmount || !activeRecipeId || addingFoodRef.current) return;
    addingFoodRef.current = true;
    setIsAddingFood(true);
    setFoodSelectionError('');
    try {
      const defaults = await lookupFoodStorageDefaults();
      const ingredientData = buildIngredientData(selectedFood, parseFloat(ingredientAmount), ingredientUnit, defaultLocationForFood(selectedFood, defaults));
      await addIngredientMutation.mutateAsync({ recipeId: activeRecipeId, ingredient: ingredientData });
      setSelectedFood(null);
      setIngredientAmount('100');
      setIngredientUnit('g');
      setSearchDialogOpen(false);
    } catch (error) {
      setFoodSelectionError(`Could not add ingredient: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      addingFoodRef.current = false;
      setIsAddingFood(false);
    }
  }, [selectedFood, ingredientAmount, ingredientUnit, activeRecipeId, addIngredientMutation, lookupFoodStorageDefaults]);

  const handleAddRecipeAsIngredient = useCallback(async () => {
    if (!selectedRecipeToAdd || !activeRecipeId) return;
    const multiplier = recipeAddMode === 'whole'
      ? (parseFloat(recipeMultiplier) || 1)
      : (parseFloat(recipeServingsCount) || 1) / selectedRecipeToAdd.servings;
    const ingredientData = buildRecipeAsIngredientData(selectedRecipeToAdd, multiplier);
    await addIngredientMutation.mutateAsync({ recipeId: activeRecipeId, ingredient: ingredientData });
    setSelectedRecipeToAdd(null);
    setRecipeMultiplier('1');
    setRecipeServingsCount('1');
    setRecipeAddMode('whole');
    setSearchDialogOpen(false);
  }, [selectedRecipeToAdd, recipeMultiplier, recipeAddMode, recipeServingsCount, activeRecipeId, addIngredientMutation]);

  const handleAddCustomIngredient = useCallback(async () => {
    if (!customName.trim() || !activeRecipeId) return;
    const nutrition = {
      calories: parseFloat(customCalories) || 0, totalFat: parseFloat(customTotalFat) || 0,
      saturatedFat: parseFloat(customSaturatedFat) || 0, transFat: parseFloat(customTransFat) || 0,
      cholesterol: parseFloat(customCholesterol) || 0, sodium: parseFloat(customSodium) || 0,
      totalCarbs: parseFloat(customTotalCarbs) || 0, dietaryFiber: parseFloat(customDietaryFiber) || 0,
      totalSugars: parseFloat(customTotalSugars) || 0, addedSugars: parseFloat(customAddedSugars) || 0,
      protein: parseFloat(customProtein) || 0, vitaminD: parseFloat(customVitaminD) || 0,
      calcium: parseFloat(customCalcium) || 0, iron: parseFloat(customIron) || 0,
      potassium: parseFloat(customPotassium) || 0,
    };
    const ingredientData = buildCustomIngredientData(customName.trim(), nutrition, parseFloat(customAmount) || 100, customUnit);
    await addIngredientMutation.mutateAsync({ recipeId: activeRecipeId, ingredient: ingredientData });
    if (customSaveForReuse) {
      try {
        await getApiClient().createCustomFood({
          name: customName.trim(), ...nutrition,
        });
      } catch {}
    }
    setCustomName(''); setCustomCalories(''); setCustomProtein(''); setCustomTotalFat('');
    setCustomTotalCarbs(''); setCustomSaturatedFat(''); setCustomTransFat(''); setCustomCholesterol('');
    setCustomSodium(''); setCustomDietaryFiber(''); setCustomTotalSugars(''); setCustomAddedSugars('');
    setCustomVitaminD(''); setCustomCalcium(''); setCustomIron(''); setCustomPotassium('');
    setCustomAmount('100'); setCustomUnit('g'); setCustomSaveForReuse(false); setSearchDialogOpen(false);
  }, [customName, customCalories, customProtein, customTotalFat, customTotalCarbs, customSaturatedFat, customTransFat, customCholesterol, customSodium, customDietaryFiber, customTotalSugars, customAddedSugars, customVitaminD, customCalcium, customIron, customPotassium, customAmount, customUnit, customSaveForReuse, activeRecipeId, addIngredientMutation]);

  const handleDeleteRecipe = useCallback(async (id: string) => {
    await deleteRecipeMutation.mutateAsync(id);
    if (activeRecipeId === id) setActiveRecipeId(null);
    setDeleteConfirmId(null);
  }, [deleteRecipeMutation, activeRecipeId]);

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
    if (!activeRecipe || !activeRecipeId || !nameValue.trim()) {
      setEditingName(false);
      return;
    }
    await updateRecipeMutation.mutateAsync({ id: activeRecipeId, data: { name: nameValue.trim() } });
    setEditingName(false);
  }, [activeRecipe, activeRecipeId, nameValue, updateRecipeMutation]);

  const handleUpdateServings = useCallback(async () => {
    if (!activeRecipe || !activeRecipeId || !servingsValue) {
      setEditingServings(false);
      return;
    }
    await updateRecipeMutation.mutateAsync({ id: activeRecipeId, data: { servings: parseInt(servingsValue) || 1, servingName: servingNameValue.trim() || 'serving' } });
    setEditingServings(false);
  }, [activeRecipe, activeRecipeId, servingsValue, servingNameValue, updateRecipeMutation]);

  const handleSaveStep = useCallback(async () => {
    if (!activeRecipe || !activeRecipeId || !stepText.trim()) return;
    const steps = [...activeRecipe.instructionSteps];
    if (editingStepId) {
      const idx = steps.findIndex((s) => s.id === editingStepId);
      if (idx !== -1) steps[idx] = { ...steps[idx], text: stepText.trim() };
    } else {
      steps.push({ id: generateUUID(), text: stepText.trim(), groupId: null });
    }
    await updateRecipeMutation.mutateAsync({ id: activeRecipeId, data: buildInstructionUpdate(activeRecipe, { instructionSteps: steps }) });
    setStepText('');
    setEditingStepId(null);
  }, [activeRecipe, activeRecipeId, stepText, editingStepId, updateRecipeMutation]);

  const handleDeleteStep = useCallback(async (stepId: string) => {
    if (!activeRecipe || !activeRecipeId) return;
    const steps = activeRecipe.instructionSteps.filter((s) => s.id !== stepId);
    await updateRecipeMutation.mutateAsync({ id: activeRecipeId, data: buildInstructionUpdate(activeRecipe, { instructionSteps: steps }) });
    if (editingStepId === stepId) {
      setEditingStepId(null);
      setStepText('');
    }
  }, [activeRecipe, activeRecipeId, editingStepId, updateRecipeMutation]);

  const handleEditStep = useCallback((step: InstructionStep) => {
    setEditingStepId(step.id);
    setStepText(step.text);
  }, []);

  const handleSaveIngredientEdit = useCallback(async () => {
    if (!editIngredientId || !activeRecipe || !activeRecipeId) return;
    const ingredient = activeRecipe.ingredients.find((i) => i.id === editIngredientId);
    if (!ingredient) return;
    const updateData = buildRescaledIngredientUpdate(ingredient, {
      name: editName,
      description: editDescription,
      amount: parseFloat(editAmount) || ingredient.amount,
      unit: editUnit,
      prepInstructions: editPrepInstructions,
      storageLocation: editStorageLocation,
    });
    setIngredientSaveStatus(null);
    try {
      await updateIngredientMutation.mutateAsync({ recipeId: activeRecipeId, ingredientId: editIngredientId, data: updateData as any });
      setEditIngredientId(null);
      setIngredientSaveStatus({ kind: 'ok', message: 'Ingredient saved.' });
    } catch (error) {
      setIngredientSaveStatus({ kind: 'err', message: `Ingredient save failed: ${error instanceof Error ? error.message : 'Please try again.'}` });
    }
  }, [editIngredientId, editName, editDescription, editAmount, editUnit, editPrepInstructions, editStorageLocation, activeRecipe, activeRecipeId, updateIngredientMutation]);

  const handleIngredientDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeRecipe || !activeRecipeId) return;

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
    const ingredients = [...activeRecipe.ingredients];
    const [moved] = ingredients.splice(oldIndex, 1);
    ingredients.splice(newIndex, 0, moved);
    reorderIngredientsMutation.mutate({ recipeId: activeRecipeId, ingredients });
  }, [activeRecipe, activeRecipeId, reorderIngredientsMutation]);

  const handleInstructionDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeRecipe || !activeRecipeId) return;

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
    const steps = [...activeRecipe.instructionSteps];
    const [moved] = steps.splice(oldIndex, 1);
    steps.splice(newIndex, 0, moved);
    updateRecipeMutation.mutate({ id: activeRecipeId, data: buildInstructionUpdate(activeRecipe, { instructionSteps: steps }) });
  }, [activeRecipe, activeRecipeId, updateRecipeMutation]);

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
    if (!groupDialogTitle.trim() || !activeRecipe || !activeRecipeId) return;
    if (groupDialogType === 'ingredient') {
      const { ingredients, ingredientGroups } = computeIngredientGroupUpdate(activeRecipe, groupDialogTargetIds, groupDialogTitle.trim());
      await updateGroupsMutation.mutateAsync({ recipeId: activeRecipeId, ingredients, ingredientGroups });
      setSelectedIngredientIds([]);
    } else {
      const { instructionSteps, instructionGroups } = computeInstructionGroupUpdate(activeRecipe, groupDialogTargetIds, groupDialogTitle.trim());
      await updateRecipeMutation.mutateAsync({ id: activeRecipeId, data: buildInstructionUpdate(activeRecipe, { instructionSteps, instructionGroups }) });
      setSelectedStepIds([]);
    }
    setGroupDialogOpen(false);
    setGroupDialogTitle('');
    setGroupDialogTargetIds([]);
  }, [groupDialogTitle, groupDialogType, groupDialogTargetIds, activeRecipe, activeRecipeId, updateGroupsMutation, updateRecipeMutation]);

  const handleStartEditGroupTitle = useCallback((groupId: string, currentTitle: string, type: 'ingredient' | 'instruction') => {
    setEditingGroupId(groupId);
    setEditingGroupTitleValue(currentTitle);
    setEditingGroupType(type);
  }, []);

  const handleFinishEditGroupTitle = useCallback(async () => {
    if (!editingGroupId || !editingGroupTitleValue.trim() || !activeRecipe || !activeRecipeId) {
      setEditingGroupId(null);
      return;
    }
    if (editingGroupType === 'ingredient') {
      const ingredientGroups = computeRenameIngredientGroup(activeRecipe, editingGroupId, editingGroupTitleValue.trim());
      await updateGroupsMutation.mutateAsync({ recipeId: activeRecipeId, ingredientGroups });
    } else {
      const instructionGroups = computeRenameInstructionGroup(activeRecipe, editingGroupId, editingGroupTitleValue.trim());
      await updateRecipeMutation.mutateAsync({ id: activeRecipeId, data: buildInstructionUpdate(activeRecipe, { instructionGroups }) });
    }
    setEditingGroupId(null);
  }, [editingGroupId, editingGroupTitleValue, editingGroupType, activeRecipe, activeRecipeId, updateGroupsMutation, updateRecipeMutation]);

  const totalNutrition = activeRecipe
    ? recipeNutrition(activeRecipe)
    : emptyNutrition();

  const nutritionData: NutritionData = {
    servings: activeRecipe?.servings || 1,
    missingNutrients: activeRecipe ? recipeMissingNutrients(activeRecipe) : [],
    customNutrition: activeRecipe?.customNutrition,
    ...totalNutrition,
  };

  const perServingNutrition: NutritionData = {
    missingNutrients: activeRecipe ? recipeMissingNutrients(activeRecipe) : [],
    customNutrition: activeRecipe?.customNutrition,
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
      {decisionDialog}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Panel: Recipe List */}
          <div className="lg:col-span-3">
            <Card className="border-stone-200 shadow-sm h-[calc(100vh-154px)] flex flex-col overflow-hidden">
              <CardHeader className="pb-3 shrink-0">
                <div className="space-y-2">
                  <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-brand-600" />My Recipes
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <ImportZipButton onFile={handleImport} busy={importing} label="Bundle" />
                    <ImportZipButton
                      onFiles={handleMarkdownImportFiles}
                      busy={importing}
                      accept=".md,text/markdown,text/plain"
                      label="Recipes"
                      multiple
                    />
                  </div>
                </div>
                <Link href="/recipes/quarantine" className="text-xs underline">Recipe quarantine</Link>
                <RecipeTransferStatus status={transferStatus} />
              </CardHeader>
              <CardContent className="pt-0 flex-1 min-h-0 flex flex-col">
                <div className="flex gap-2 mb-4 shrink-0">
                  <Input placeholder="New recipe name..." value={newRecipeName} onChange={(e) => setNewRecipeName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateRecipe()} className="text-sm h-9" />
                  <Button onClick={handleCreateRecipe} disabled={!newRecipeName.trim() || isMutating} size="sm" className="bg-brand-600 hover:bg-brand-700 shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                  <Input
                    aria-label="Search recipes"
                    placeholder="Search recipes..."
                    value={recipeSearchQuery}
                    onChange={(e) => setRecipeSearchQuery(e.target.value)}
                    className="h-9 pl-8 pr-8 text-sm"
                  />
                  {recipeSearchQuery && (
                    <button
                      type="button"
                      aria-label="Clear recipe search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                      onClick={() => setRecipeSearchQuery('')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
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
                    diabetesProfileId={diabetesProfileId}
                    onDiabetesProfileChange={id => {
                      restoreSelectionGeneration.current++;
                      restoreDiabetesProfile.reset();
                      setDiabetesRestoreRequested(false);
                      setDiabetesProfileId(id);
                    }}
                    onRestoreDiabetesProfile={() => {
                      const generation = ++restoreSelectionGeneration.current;
                      setDiabetesRestoreRequested(true);
                      restoreDiabetesProfile.mutate(undefined, { onSuccess: profile => {
                        if (generation === restoreSelectionGeneration.current) {
                          setDiabetesRestoreRequested(false);
                          setDiabetesProfileId(profile.id);
                        }
                      } });
                    }}
                    diabetesProfileRestorePending={restoreDiabetesProfile.isPending}
                    diabetesFilterRequested={diabetesFilterRequested}
                  />
                </div>
                {dietaryProfilesError && <p role="alert" className="text-xs text-destructive mb-2">Dietary profiles unavailable; configured restrictions could not be loaded.</p>}
                {restoreError && <p role="alert" className="text-xs text-destructive mb-2">Unable to restore the Diabetic filter. Please try again.</p>}
                {assessmentError && <p role="alert" className="text-xs text-destructive mb-2">Nutrition assessment unavailable; matches cannot be verified.</p>}
                {diabetesProfile && !assessmentPending && !assessmentError && notAssessedCount > 0 && <p role="status" className="text-xs mb-2">{notAssessedCount} recipe(s) not assessed and excluded from matches: required nutrition is missing, data is invalid, or no recipe-level targets are configured.</p>}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="space-y-1.5 pr-2">
                    {displayRecipes.length === 0 ? (
                      <p role={assessmentPending ? 'status' : undefined} className="text-xs text-stone-400 text-center py-8">
                        {restoreError
                          ? 'Diabetic filter is unavailable.'
                          : diabetesFilterRequested
                          ? assessmentPending
                            ? 'Checking configured nutrition targets...'
                            : assessmentError
                              ? 'Matches are unavailable.'
                              : 'No recipes match the configured nutrition targets'
                          : recipeSearchQuery.trim()
                          ? 'No recipes match your search'
                          : categoryFilterId
                            ? 'No recipes in this category'
                            : 'No recipes yet. Create one above!'}
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
                          onClick={() => setActiveRecipeId(recipe.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="min-w-0 whitespace-normal break-words font-medium text-sm">{recipe.name}</div>
                            <div className="text-xs text-stone-400 mt-0.5">
                              {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''} · {recipe.servings} servings · {fmt(recipeTotalCalories(recipe))} cal total
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
                            <div className="flex items-center gap-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-brand-600" title="Export recipe" disabled={exportingId === recipe.id} onClick={(e) => { e.stopPropagation(); handleExportRecipe(recipe.id, recipe.name); }}>
                                {exportingId === recipe.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(recipe.id); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
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
              <Card className="border-stone-200 shadow-sm h-[calc(100vh-154px)] flex flex-col overflow-hidden">
                <CardHeader className="pb-4 shrink-0">
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
                          {activeRecipe.customNutrition ? `${activeRecipe.servings} servings · ${activeRecipe.servingName}` : `${activeRecipe.servings} ${activeRecipe.servingName || 'serving'}`} · Click to edit
                        </p>
                       )}
                        {(activeRecipe.prepTime || activeRecipe.cookTime) && (
                          <p className="text-xs text-stone-500 mt-1">
                            <Clock className="w-3 h-3 inline mr-1 -mt-0.5 text-stone-400" />
                            {[
                              activeRecipe.prepTime && `Prep: ${activeRecipe.prepTime}`,
                              activeRecipe.cookTime && `Cook: ${activeRecipe.cookTime}`,
                            ].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-stone-500">Leftovers:</span>
                         <select
                           value={(activeRecipe as any).leftoverStorage || ''}
                            onChange={(e) => activeRecipeId && updateRecipeMutation.mutate({ id: activeRecipeId, data: { leftoverStorage: e.target.value || undefined } })}
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
                                <strong>No matches</strong> in the local database or via USDA. Showing built-in sample foods. Add a USDA API key in Settings for live lookups.
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
                                    <div key={food.customFoodId ?? food.fdcId} className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedFood?.customFoodId === food.customFoodId && selectedFood?.fdcId === food.fdcId ? 'border-brand-400 bg-brand-50' : 'border-stone-200 hover:border-brand-200 hover:bg-stone-50'}`} onClick={() => { if (isAddingFood) return; setSelectedFood(food); setIngredientAmount('100'); setIngredientUnit(food.servingSizeUnit || 'g'); }}>
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
                                {foodSelectionError && <p role="alert" className="text-xs text-destructive">{foodSelectionError}</p>}
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
                                  <Button onClick={handleAddIngredient} disabled={!ingredientAmount || isMutating || isAddingFood} className="bg-brand-600 hover:bg-brand-700 h-9">
                                    {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
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
                                        {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''} · {fmt(recipeTotalCalories(recipe))} cal total
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
                                    {fmt(recipeTotalCalories(selectedRecipeToAdd))} cal total · {selectedRecipeToAdd.servings} servings · {selectedRecipeToAdd.servingName || 'servings'}
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
                                    <Button onClick={handleAddRecipeAsIngredient} disabled={isMutating} className="bg-brand-600 hover:bg-brand-700 h-9">
                                      {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                      <label className="text-xs font-medium text-stone-600 mb-1 block">Servings</label>
                                      <Input type="number" min="0.1" step="0.5" value={recipeServingsCount} onChange={(e) => setRecipeServingsCount(e.target.value)} className="h-9" />
                                    </div>
                                    <span className="text-sm text-stone-500 pb-2">{selectedRecipeToAdd.servingName || 'servings'} (recipe makes {selectedRecipeToAdd.servings})</span>
                                    <Button onClick={handleAddRecipeAsIngredient} disabled={isMutating} className="bg-brand-600 hover:bg-brand-700 h-9">
                                      {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
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
                                <Button onClick={handleAddCustomIngredient} disabled={!customName.trim() || isMutating} className="bg-brand-600 hover:bg-brand-700 h-9">
                                  {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
                                </Button>
                              </div>
                            </div>
                          </TabsContent>
                        </Tabs>
                       </DialogContent>
                     </Dialog>

                <CardContent className="pt-0 flex-1 min-h-0 overflow-y-auto">
                  <Separator className="mb-4" />
                  <div className="mb-4 space-y-3">
                    <CustomNutritionEditor key={activeRecipe.id} recipe={activeRecipe} onSave={data => updateRecipeMutation.mutateAsync({ id: activeRecipe.id, data })} />
                    <details><summary className="cursor-pointer text-sm">Scale full recipe</summary>
                      <ScalingControls key={activeRecipe.id} recipe={{ ...activeRecipe, totalCalories: totalNutrition.calories }} onApplyScale={scaled => {
                        const ingredients = activeRecipe.ingredients.map(ingredient => {
                          const next = scaled.ingredients.find(item => item.id === ingredient.id);
                          return next ? { ...ingredient, ...buildRescaledIngredientUpdate(ingredient, { amount: next.scaledAmount, unit: next.scaledUnit }) } : ingredient;
                        });
                        updateRecipeMutation.mutate({ id: activeRecipe.id, data: { servings: Math.max(1, scaled.servings), ingredients, ...(scaled.customNutrition ? { customNutrition: scaled.customNutrition } : {}) } });
                      }} />
                    </details>
                    {updateRecipeMutation.isError && <p role="alert" className="text-sm text-destructive">Could not save recipe changes.</p>}
                  </div>

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
                    {ingredientSaveStatus?.kind === 'ok' && <p role="status" className="text-xs text-brand-700 mb-2">{ingredientSaveStatus.message}</p>}
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
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-400 hover:text-destructive" onClick={() => { if (activeRecipe && activeRecipeId) { const r = computeRemoveIngredientGroup(activeRecipe, slot.group.id); updateGroupsMutation.mutate({ recipeId: activeRecipeId, ...r }); } }}>
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
                                          isMutating={isMutating}
                                          ingredientSaveError={ingredientSaveStatus?.kind === 'err' && editIngredientId === ingredient.id ? ingredientSaveStatus.message : null}
                                          isGrouped
                                          onToggleSelect={() => toggleIngredientSelect(ingredient.id)}
                                           onEdit={() => { setIngredientSaveStatus(null); setEditIngredientId(ingredient.id); setEditName(ingredient.name); setEditDescription(ingredient.description || ''); setEditAmount(String(ingredient.amount)); setEditUnit(ingredient.unit.trim() || 'g'); setEditPrepInstructions(ingredient.prepInstructions || []); setEditStorageLocation((ingredient as any).storageLocation || ''); }}
                                            onRemove={() => removeIngredientMutation.mutate({ recipeId: activeRecipeId!, ingredientId: ingredient.id })}
                                            onRemoveFromGroup={() => { if (activeRecipe && activeRecipeId) { const ings = computeMoveIngredientToGroup(activeRecipe, ingredient.id, null); updateGroupsMutation.mutate({ recipeId: activeRecipeId, ingredients: ings }); } }}
                                            onSaveEdit={handleSaveIngredientEdit}
                                            onRematch={(food, amount, unit) => handleRematchIngredient(ingredient, food, amount, unit)}
                                            onSaveIngredientStorageLocation={(location) => handleSaveIngredientStorageLocation(ingredient, location)}
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
                                  isMutating={isMutating}
                                  ingredientSaveError={ingredientSaveStatus?.kind === 'err' && editIngredientId === slot.ingredient.id ? ingredientSaveStatus.message : null}
                                  isGrouped={false}
                                  onToggleSelect={() => toggleIngredientSelect(slot.ingredient.id)}
                                  onEdit={() => { setIngredientSaveStatus(null); setEditIngredientId(slot.ingredient.id); setEditName(slot.ingredient.name); setEditDescription(slot.ingredient.description || ''); setEditAmount(String(slot.ingredient.amount)); setEditUnit(slot.ingredient.unit.trim() || 'g'); setEditPrepInstructions(slot.ingredient.prepInstructions || []); setEditStorageLocation((slot.ingredient as any).storageLocation || ''); }}
                                  onRemove={() => removeIngredientMutation.mutate({ recipeId: activeRecipeId!, ingredientId: slot.ingredient.id })}
                                  onSaveEdit={handleSaveIngredientEdit}
                                  onRematch={(food, amount, unit) => handleRematchIngredient(slot.ingredient, food, amount, unit)}
                                  onSaveIngredientStorageLocation={(location) => handleSaveIngredientStorageLocation(slot.ingredient, location)}
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
                                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-400 hover:text-destructive" onClick={() => { if (activeRecipe && activeRecipeId) { const r = computeRemoveInstructionGroup(activeRecipe, slot.group.id); updateRecipeMutation.mutate({ id: activeRecipeId, data: buildInstructionUpdate(activeRecipe, r) }); } }}>
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
                                          onRemoveFromGroup={() => { if (activeRecipe && activeRecipeId) { const steps = computeMoveInstructionToGroup(activeRecipe, step.id, null); updateRecipeMutation.mutate({ id: activeRecipeId, data: buildInstructionUpdate(activeRecipe, { instructionSteps: steps }) }); } }}
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
                        <Button onClick={handleSaveStep} disabled={!stepText.trim() || isMutating} className="bg-brand-600 hover:bg-brand-700 gap-1 text-sm" size="sm">
                          {isMutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />{editingStepId ? 'Update Step' : 'Save Step'}</>}
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
              <Card className="border-stone-200 shadow-sm flex items-center justify-center h-[calc(100vh-154px)]">
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
              <Card className="border-stone-200 shadow-sm h-[calc(100vh-154px)] flex flex-col overflow-hidden">
                <CardHeader className="pb-3 shrink-0">
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
                <CardContent className="pt-0 flex-1 min-h-0 overflow-y-auto">
                  <div className="flex flex-col items-center gap-2" ref={nutritionLabelRef}>
                    <NutritionLabel
                      data={activeRecipe && activeRecipe.servings > 1 ? perServingNutrition : nutritionData}
                      servingDescription={activeRecipe?.customNutrition ? activeRecipe.servingName : activeRecipe ? `1 ${activeRecipe.servingName || 'serving'}` : undefined}
                      servingsPerContainer={activeRecipe?.servings}
                    />
                  </div>
                  {activeRecipe && (activeRecipe.customNutrition || activeRecipe.ingredients.length > 0) && activeRecipe.servings > 1 && (
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

      <RecipeImportDialog
        open={markdownImportOpen}
        drafts={markdownImportDrafts}
        currentIndex={markdownImportIndex}
        isSaving={markdownImportSaving}
        error={transferStatus?.kind === 'err' ? transferStatus.msg : null}
        onOpenChange={setMarkdownImportOpen}
        onDraftChange={handleMarkdownDraftChange}
        onUndoCurrent={handleUndoMarkdownDraft}
        onSaveCurrent={handleSaveMarkdownDraft}
        onSkipCurrent={handleSkipMarkdownDraft}
      />

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
                      description: activeRecipe.description,
                      customNutrition: activeRecipe.customNutrition,
                      servings: activeRecipe.servings,
                      servingName: activeRecipe.servingName,
                      ingredients: activeRecipe.ingredients.map((i) => ({
                        id: i.id,
                        name: i.name,
                        amount: i.amount,
                        unit: i.unit,
                        description: i.description,
                        groupId: i.groupId,
                        missingNutrients: i.missingNutrients,
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
                  const cat = await createCategoryMutation.mutateAsync({ name: newCategoryName.trim(), parentId });
                  setNewCategoryName('');
                  setSelectedParentCategoryId(null);
                  if (categoryDialogRecipeId) await assignCategoryMutation.mutateAsync({ recipeId: categoryDialogRecipeId, categoryId: cat.id });
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
                const cat = await createCategoryMutation.mutateAsync({ name: newCategoryName.trim(), parentId });
                setNewCategoryName('');
                setSelectedParentCategoryId(null);
                if (categoryDialogRecipeId) await assignCategoryMutation.mutateAsync({ recipeId: categoryDialogRecipeId, categoryId: cat.id });
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
                  onAssign={async (recipeId, categoryId) => { await assignCategoryMutation.mutateAsync({ recipeId, categoryId }); }}
                  onUnassign={async (recipeId, categoryId) => { await unassignCategoryMutation.mutateAsync({ recipeId, categoryId }); }}
                  onDelete={(categoryId) => deleteCategoryMutation.mutateAsync(categoryId)}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {activeRecipe && (
        <ShareDialog
          key={activeRecipe.id}
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
  recipeCategories: Map<string, { categoryId: string; id: string }[]>;
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
  isMutating: boolean;
  ingredientSaveError?: string | null;
  isGrouped: boolean;
  prepInstructions: string[];
  editStorageLocation: string;
  onToggleSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onRemoveFromGroup?: () => void;
  onSaveEdit: () => void;
  onRematch: (food: FDAFood, amount: number, unit: string) => Promise<void>;
  onSaveIngredientStorageLocation: (location: string) => Promise<void>;
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
  isMutating,
  ingredientSaveError,
  isGrouped,
  onToggleSelect,
  onEdit,
  onRemove,
  onRemoveFromGroup,
  onSaveEdit,
  onRematch,
  onSaveIngredientStorageLocation,
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
  const defaultIdentity = isRecipe ? null : (ingredient.sourceType === 'custom_food' && ingredient.sourceKey
    ? { sourceType: 'custom_food' as const, sourceKey: ingredient.sourceKey }
    : ingredient.sourceType === 'usda' && ingredient.fdcId > 0 && (!ingredient.sourceKey || ingredient.sourceKey === String(ingredient.fdcId))
      ? { sourceType: 'usda' as const, sourceKey: String(ingredient.fdcId) }
      : null);

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
          <p className={`text-sm font-medium flex items-center gap-1.5 min-w-0 ${isRecipe ? 'text-blue-800' : 'text-stone-800'}`}>
            {isRecipe && <BookOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{ingredient.name}</span>
            {isRecipe && <Link2 className="w-3 h-3 text-blue-400 shrink-0" />}
            <IngredientStorageTag location={ingredient.storageLocation} />
          </p>
          <p className={`text-xs mt-0.5 ${isRecipe ? 'text-blue-500' : 'text-stone-400'}`}>
            {isRecipe ? (
              <>{fmt(ingredient.amount)}× recipe · {fmt(ingredient.calories)} cal</>
            ) : (
              <>{fmt(ingredient.amount)} {ingredient.unit} · {fmt(ingredient.calories)} cal</>
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
            <Button size="sm" className="bg-brand-600 hover:bg-brand-700 h-8 gap-1" onClick={onSaveEdit} disabled={isMutating}>
              {isMutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" />Save</>}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onCancelEdit}>Cancel</Button>
          </div>
          {ingredientSaveError && <p role="alert" className="text-xs text-destructive">{ingredientSaveError}</p>}
          {!isRecipe && <IngredientMatchEditor ingredient={ingredient} amount={parseFloat(editAmount) || ingredient.amount} unit={editUnit} onRematch={onRematch} />}
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
          <StorageDefaultControl key={ingredient.id} identity={defaultIdentity} location={editStorageLocation} onLocationChange={onEditStorageLocation} onSaveIngredientLocation={onSaveIngredientStorageLocation} />
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

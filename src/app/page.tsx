'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRecipeStore } from '@/lib/recipe-store';
import { type FDAFood } from '@/lib/recipe-store';
import NutritionLabel, { type NutritionData } from '@/components/nutrition-label';
import PWAInstallPrompt from '@/components/pwa-install-prompt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';

export default function HomePage() {
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
    removeIngredient,
    getTotalNutrition,
  } = useRecipeStore();

  const [newRecipeName, setNewRecipeName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FDAFood | null>(null);
  const [ingredientAmount, setIngredientAmount] = useState('100');
  const [ingredientUnit, setIngredientUnit] = useState('g');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingServings, setEditingServings] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [servingsValue, setServingsValue] = useState('');

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

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
    await updateRecipe({ servings: parseInt(servingsValue) || 1 });
    setEditingServings(false);
  }, [activeRecipe, servingsValue, updateRecipe]);

  const handleUpdateInstructions = useCallback(async (value: string) => {
    if (!activeRecipe) return;
    await updateRecipe({ instructions: value });
  }, [activeRecipe, updateRecipe]);

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

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 text-white">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">
              NutriLabel
            </h1>
            <p className="text-xs text-stone-500">
              Recipe storage with FDA nutrition labels
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Salad className="w-3 h-3 mr-1" />
              FDA FoodData Central
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel: Recipe List */}
          <div className="lg:col-span-3">
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  My Recipes
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder="New recipe name..."
                    value={newRecipeName}
                    onChange={(e) => setNewRecipeName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateRecipe()}
                    className="text-sm h-9"
                  />
                  <Button
                    onClick={handleCreateRecipe}
                    disabled={!newRecipeName.trim() || isLoading}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                <ScrollArea className="max-h-[calc(100vh-280px)]">
                  <div className="space-y-1.5">
                    {recipes.length === 0 ? (
                      <p className="text-xs text-stone-400 text-center py-8">
                        No recipes yet. Create one above!
                      </p>
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
                            <div className="truncate font-medium text-sm">
                              {recipe.name}
                            </div>
                            <div className="text-xs text-stone-400 mt-0.5">
                              {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''} · {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                            </div>
                          </div>
                          {deleteConfirmId === recipe.id ? (
                            <div className="flex items-center gap-1 ml-2">
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRecipe(recipe.id);
                                }}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(null);
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(recipe.id);
                              }}
                            >
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
                          <Input
                            value={nameValue}
                            onChange={(e) => setNameValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateName()}
                            onBlur={handleUpdateName}
                            autoFocus
                            className="text-lg font-bold h-9"
                          />
                        </div>
                      ) : (
                        <h2
                          className="text-lg font-bold text-stone-900 cursor-pointer hover:text-emerald-700 transition-colors"
                          onClick={() => {
                            setNameValue(activeRecipe.name);
                            setEditingName(true);
                          }}
                          title="Click to edit"
                        >
                          {activeRecipe.name}
                        </h2>
                      )}
                      {editingServings ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-stone-500">Servings:</span>
                          <Input
                            type="number"
                            min="1"
                            value={servingsValue}
                            onChange={(e) => setServingsValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateServings()}
                            onBlur={handleUpdateServings}
                            autoFocus
                            className="w-20 h-7 text-sm"
                          />
                        </div>
                      ) : (
                        <p
                          className="text-sm text-stone-500 mt-1 cursor-pointer hover:text-emerald-600 transition-colors"
                          onClick={() => {
                            setServingsValue(String(activeRecipe.servings));
                            setEditingServings(true);
                          }}
                          title="Click to edit"
                        >
                          {activeRecipe.servings} serving{activeRecipe.servings !== 1 ? 's' : ''} · Click to edit
                        </p>
                      )}
                    </div>
                    <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                          <Search className="w-4 h-4" />
                          Add Ingredient
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[540px] max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Search className="w-4 h-4 text-emerald-600" />
                            Search FDA Food Database
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-2">
                          {searchSource === 'fallback' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                              <strong>Note:</strong> FDA API is currently rate-limited. Showing results from built-in food database. Get your own free API key at <a href="https://api.data.gov/signup/" target="_blank" rel="noopener noreferrer" className="underline">api.data.gov</a> for unlimited access.
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Input
                              placeholder="Search foods (e.g., chicken breast, rice, broccoli)..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSearchFDA()}
                              className="flex-1"
                            />
                            <Button
                              onClick={handleSearchFDA}
                              disabled={isSearching || !searchQuery.trim()}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              {isSearching ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Search className="w-4 h-4" />
                              )}
                            </Button>
                          </div>

                          {searchResults.length > 0 && (
                            <ScrollArea className="max-h-[300px]">
                              <div className="space-y-1">
                                {searchResults.map((food) => (
                                  <div
                                    key={food.fdcId}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                      selectedFood?.fdcId === food.fdcId
                                        ? 'border-emerald-400 bg-emerald-50'
                                        : 'border-stone-200 hover:border-emerald-200 hover:bg-stone-50'
                                    }`}
                                    onClick={() => {
                                      setSelectedFood(food);
                                      setIngredientAmount('100');
                                      setIngredientUnit(food.servingSizeUnit || 'g');
                                    }}
                                  >
                                    <div className="font-medium text-sm text-stone-900">
                                      {food.description}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-[10px] h-5">
                                        {food.dataType}
                                      </Badge>
                                      {food.brandOwner && (
                                        <span className="text-xs text-stone-400">
                                          {food.brandOwner}
                                        </span>
                                      )}
                                      <span className="text-xs text-stone-400 ml-auto">
                                        {food.nutrients.calories} cal per 100{food.servingSizeUnit || 'g'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          )}

                          {searchResults.length === 0 && !isSearching && searchQuery && (
                            <p className="text-sm text-stone-400 text-center py-6">
                              Click search to find foods
                            </p>
                          )}

                          {selectedFood && (
                            <div className="border-t pt-4 space-y-3">
                              <div className="bg-emerald-50 p-3 rounded-lg">
                                <p className="font-medium text-sm text-emerald-900">
                                  {selectedFood.description}
                                </p>
                                <p className="text-xs text-emerald-700 mt-1">
                                  {selectedFood.nutrients.calories} cal · {selectedFood.nutrients.protein}g protein · {selectedFood.nutrients.totalFat}g fat · {selectedFood.nutrients.totalCarbs}g carbs
                                  <span className="text-emerald-500"> per 100{selectedFood.servingSizeUnit || 'g'}</span>
                                </p>
                              </div>
                              <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                  <label className="text-xs font-medium text-stone-600 mb-1 block">
                                    Amount
                                  </label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={ingredientAmount}
                                    onChange={(e) => setIngredientAmount(e.target.value)}
                                    className="h-9"
                                  />
                                </div>
                                <div className="w-24">
                                  <label className="text-xs font-medium text-stone-600 mb-1 block">
                                    Unit
                                  </label>
                                  <select
                                    value={ingredientUnit}
                                    onChange={(e) => setIngredientUnit(e.target.value)}
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  >
                                    <option value="g">grams</option>
                                    <option value="oz">oz</option>
                                    <option value="cup">cup</option>
                                    <option value="tbsp">tbsp</option>
                                    <option value="tsp">tsp</option>
                                    <option value="ml">ml</option>
                                    <option value="lb">lb</option>
                                    <option value="whole">whole</option>
                                  </select>
                                </div>
                                <Button
                                  onClick={handleAddIngredient}
                                  disabled={!ingredientAmount || isLoading}
                                  className="bg-emerald-600 hover:bg-emerald-700 h-9"
                                >
                                  {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Plus className="w-4 h-4 mr-1" />
                                  )}
                                  Add
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <Separator className="mb-4" />

                  {/* Ingredients List */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-stone-700 mb-3 flex items-center gap-2">
                      <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
                      Ingredients
                      <Badge variant="secondary" className="text-[10px] h-5 ml-1">
                        {activeRecipe.ingredients.length}
                      </Badge>
                    </h3>
                    {activeRecipe.ingredients.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-stone-200 rounded-lg">
                        <Salad className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                        <p className="text-sm text-stone-400">
                          No ingredients yet
                        </p>
                        <p className="text-xs text-stone-300 mt-1">
                          Click &quot;Add Ingredient&quot; to search the FDA database
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeRecipe.ingredients.map((ingredient) => (
                          <div
                            key={ingredient.id}
                            className="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-lg hover:border-stone-300 transition-colors group"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-stone-800 truncate">
                                {ingredient.name}
                              </p>
                              <p className="text-xs text-stone-400 mt-0.5">
                                {ingredient.amount}{ingredient.unit} · {ingredient.calories} cal
                              </p>
                            </div>
                            <div className="flex items-center gap-3 ml-3">
                              <div className="hidden sm:flex gap-2 text-[10px] text-stone-400">
                                <span>P: {ingredient.protein}g</span>
                                <span>F: {ingredient.totalFat}g</span>
                                <span>C: {ingredient.totalCarbs}g</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-stone-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => removeIngredient(ingredient.id)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Instructions */}
                  <div>
                    <h3 className="text-sm font-semibold text-stone-700 mb-3">
                      Instructions
                    </h3>
                    <Textarea
                      placeholder="Add cooking instructions..."
                      value={activeRecipe.instructions || ''}
                      onChange={(e) => handleUpdateInstructions(e.target.value)}
                      className="min-h-[120px] text-sm resize-none"
                    />
                  </div>

                  {/* Nutrition Summary Bar */}
                  {activeRecipe.ingredients.length > 0 && (
                    <div className="mt-4 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-emerald-800">
                          Total Recipe Nutrition
                        </span>
                        <div className="flex gap-3 text-emerald-700">
                          <span>{totalNutrition.calories} cal</span>
                          <span>{totalNutrition.protein}g protein</span>
                          <span>{totalNutrition.totalFat}g fat</span>
                          <span>{totalNutrition.totalCarbs}g carbs</span>
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
                  <h3 className="text-lg font-semibold text-stone-700 mb-2">
                    No Recipe Selected
                  </h3>
                  <p className="text-sm text-stone-400 max-w-xs mx-auto">
                    Create a new recipe or select an existing one from the sidebar to get started.
                  </p>
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
                    <Salad className="w-4 h-4 text-emerald-600" />
                    Nutrition Facts Label
                  </CardTitle>
                  <p className="text-xs text-stone-400">
                    FDA-compliant label auto-generated from your ingredients
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex justify-center">
                    <NutritionLabel
                      data={activeRecipe && activeRecipe.servings > 1 ? perServingNutrition : nutritionData}
                      servingDescription={
                        activeRecipe
                          ? activeRecipe.servings > 1
                            ? `1 of ${activeRecipe.servings} servings`
                            : '1 serving'
                          : undefined
                      }
                    />
                  </div>

                  {activeRecipe && activeRecipe.ingredients.length > 0 && activeRecipe.servings > 1 && (
                    <div className="mt-4 p-3 bg-stone-50 rounded-lg border border-stone-200">
                      <p className="text-xs font-medium text-stone-600 mb-2">
                        Full Recipe (all servings)
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-stone-500">Calories</span>
                          <span className="font-medium">{totalNutrition.calories}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-stone-500">Protein</span>
                          <span className="font-medium">{totalNutrition.protein}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-stone-500">Total Fat</span>
                          <span className="font-medium">{totalNutrition.totalFat}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-stone-500">Carbs</span>
                          <span className="font-medium">{totalNutrition.totalCarbs}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-stone-500">Fiber</span>
                          <span className="font-medium">{totalNutrition.dietaryFiber}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-stone-500">Sodium</span>
                          <span className="font-medium">{totalNutrition.sodium}mg</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-stone-400">
          NutriLabel — Nutrition data sourced from FDA FoodData Central (USDA). Labels follow FDA formatting guidelines.
        </div>
      </footer>

      {/* PWA Install Prompt (mobile/tablet only) */}
      <PWAInstallPrompt />
    </div>
  );
}

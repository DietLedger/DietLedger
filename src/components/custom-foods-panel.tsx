'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Package,
} from 'lucide-react';
import {
  getAllCustomFoods,
  addCustomFood,
  updateCustomFood,
  deleteCustomFood,
  type CustomFoodRecord,
} from '@/lib/storage';
import { fmt } from '@/lib/format';

const EMPTY_NUTRITION = {
  calories: '',
  protein: '',
  totalFat: '',
  totalCarbs: '',
  saturatedFat: '',
  transFat: '',
  cholesterol: '',
  sodium: '',
  dietaryFiber: '',
  totalSugars: '',
  addedSugars: '',
  vitaminD: '',
  calcium: '',
  iron: '',
  potassium: '',
};

type NutritionField = keyof typeof EMPTY_NUTRITION;

export default function CustomFoodsPanel() {
  const [foods, setFoods] = useState<CustomFoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<CustomFoodRecord | null>(null);
  const [name, setName] = useState('');
  const [nutrition, setNutrition] = useState(EMPTY_NUTRITION);

  const fetchFoods = useCallback(async () => {
    try {
      const result = await getAllCustomFoods();
      setFoods(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  const openCreate = useCallback(() => {
    setEditingFood(null);
    setName('');
    setNutrition(EMPTY_NUTRITION);
    setEditDialogOpen(true);
  }, []);

  const openEdit = useCallback((food: CustomFoodRecord) => {
    setEditingFood(food);
    setName(food.name);
    setNutrition({
      calories: String(food.calories),
      protein: String(food.protein),
      totalFat: String(food.totalFat),
      totalCarbs: String(food.totalCarbs),
      saturatedFat: String(food.saturatedFat),
      transFat: String(food.transFat),
      cholesterol: String(food.cholesterol),
      sodium: String(food.sodium),
      dietaryFiber: String(food.dietaryFiber),
      totalSugars: String(food.totalSugars),
      addedSugars: String(food.addedSugars),
      vitaminD: String(food.vitaminD),
      calcium: String(food.calcium),
      iron: String(food.iron),
      potassium: String(food.potassium),
    });
    setEditDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      calories: parseFloat(nutrition.calories) || 0,
      protein: parseFloat(nutrition.protein) || 0,
      totalFat: parseFloat(nutrition.totalFat) || 0,
      totalCarbs: parseFloat(nutrition.totalCarbs) || 0,
      saturatedFat: parseFloat(nutrition.saturatedFat) || 0,
      transFat: parseFloat(nutrition.transFat) || 0,
      cholesterol: parseFloat(nutrition.cholesterol) || 0,
      sodium: parseFloat(nutrition.sodium) || 0,
      dietaryFiber: parseFloat(nutrition.dietaryFiber) || 0,
      totalSugars: parseFloat(nutrition.totalSugars) || 0,
      addedSugars: parseFloat(nutrition.addedSugars) || 0,
      vitaminD: parseFloat(nutrition.vitaminD) || 0,
      calcium: parseFloat(nutrition.calcium) || 0,
      iron: parseFloat(nutrition.iron) || 0,
      potassium: parseFloat(nutrition.potassium) || 0,
    };

    if (editingFood) {
      await updateCustomFood(editingFood.id, data);
    } else {
      await addCustomFood(data);
    }
    setEditDialogOpen(false);
    fetchFoods();
  }, [name, nutrition, editingFood, fetchFoods]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteCustomFood(id);
    fetchFoods();
  }, [fetchFoods]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[60vh]">
      <div className="space-y-4 pr-2">
        <div className="flex items-center justify-between">
          <div>
            <Badge variant="secondary" className="text-xs">
              {foods.length} custom food{foods.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1 h-8" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5" />Add Custom Food
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  {editingFood ? 'Edit Custom Food' : 'Add Custom Food'}
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-3 pr-2 pb-2">
                  <div>
                    <label className="text-xs font-medium text-stone-600 mb-1 block">Name</label>
                    <Input placeholder="e.g., My Spice Blend..." value={name} onChange={(e) => setName(e.target.value)} className="h-9" autoFocus />
                  </div>
                  <p className="text-xs text-stone-400">Enter nutrition facts per 100g serving.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(EMPTY_NUTRITION) as NutritionField[]).map((field) => (
                      <div key={field}>
                        <label className="text-[11px] text-stone-500 mb-0.5 block">
                          {field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                          {['calories'].includes(field) ? '' : ['cholesterol', 'sodium', 'calcium', 'potassium'].includes(field) ? ' (mg)' : ['vitaminD'].includes(field) ? ' (mcg)' : ' (g)'}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="0"
                          value={nutrition[field]}
                          onChange={(e) => setNutrition((prev) => ({ ...prev, [field]: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSave} disabled={!name.trim()} className="bg-emerald-600 hover:bg-emerald-700 gap-1 flex-1">
                      <Check className="w-4 h-4" />{editingFood ? 'Save Changes' : 'Add Food'}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>

        {foods.length === 0 ? (
          <div className="text-center py-8 text-stone-400">
            <Package className="w-8 h-8 mx-auto mb-2 text-stone-300" />
            <p className="text-sm">No custom foods yet</p>
            <p className="text-xs mt-1">Create your own ingredients with custom nutrition facts</p>
          </div>
        ) : (
          <div className="space-y-2">
            {foods.map((food) => (
              <div key={food.id} className="p-3 border border-stone-200 rounded-lg hover:border-stone-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-stone-900">{food.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-stone-400">
                      <span>{fmt(food.calories)} cal</span>
                      <span>P: {fmt(food.protein)}g</span>
                      <span>F: {fmt(food.totalFat)}g</span>
                      <span>C: {fmt(food.totalCarbs)}g</span>
                    </div>
                    <p className="text-[10px] text-stone-300 mt-1">per 100g</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-emerald-600" onClick={() => openEdit(food)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-destructive" onClick={() => handleDelete(food.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

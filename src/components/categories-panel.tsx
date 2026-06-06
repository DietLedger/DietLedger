'use client';

import React, { useState, useCallback } from 'react';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, type CategoryNode } from '@/hooks/use-categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  FolderOpen,
  Loader2,
} from 'lucide-react';
import CategoryTree from '@/components/category-tree';

export default function CategoriesPanel() {
  const { categories, categoryTree, isLoading } = useCategories();
  const createCategoryMutation = useCreateCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await createCategoryMutation.mutateAsync({ name: newName.trim(), parentId: newParentId });
    setNewName('');
    setNewParentId(null);
    setCreateOpen(false);
  }, [newName, newParentId, createCategoryMutation]);

  const handleRename = useCallback(async (id: string, name: string) => {
    await updateCategoryMutation.mutateAsync({ id, data: { name } });
  }, [updateCategoryMutation]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteCategoryMutation.mutateAsync(id);
  }, [deleteCategoryMutation]);

  const handleCreateChild = useCallback(async (parentId: string, name: string) => {
    await createCategoryMutation.mutateAsync({ name, parentId });
  }, [createCategoryMutation]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-xs">
          {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
        </Badge>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1 h-7 text-xs">
              <Plus className="w-3 h-3" />Create Category
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Create Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1 block">Name</label>
                <Input
                  placeholder="e.g., Desserts, Asian, Quick Meals..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700 mb-1 block">Parent Category (optional)</label>
                <select
                  value={newParentId || ''}
                  onChange={(e) => setNewParentId(e.target.value || null)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">None (top-level)</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button size="sm" className="bg-brand-600 hover:bg-brand-700" onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-semibold text-stone-700 mb-2">No Categories Yet</h3>
          <p className="text-sm text-stone-400 max-w-xs mx-auto">
            Create categories to organize and tag your recipes.
          </p>
        </div>
      ) : (
        <Card className="border-stone-200 shadow-sm">
          <CardContent className="pt-4">
            <CategoryTree
              categories={categoryTree}
              onRename={handleRename}
              onDelete={handleDelete}
              onCreateChild={handleCreateChild}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

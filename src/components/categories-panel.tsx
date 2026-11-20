'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, type CategoryNode } from '@/hooks/use-categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  FolderOpen,
  Loader2,
} from 'lucide-react';
import CategoryTree from '@/components/category-tree';

export default function CategoriesPanel({ readOnly = false }: { readOnly?: boolean }) {
  const { categories, categoryTree, isLoading } = useCategories();
  const createCategoryMutation = useCreateCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const deleteSelectedButtonRef = useRef<HTMLButtonElement>(null);
  const createCategoryButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const selectedCategories = categories.filter((category) => selectedIds.has(category.id));

  const handleToggleSelection = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (isDeleting || selectedCategories.length === 0) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      for (const category of selectedCategories) {
        await deleteCategoryMutation.mutateAsync(category.id);
        setSelectedIds((previous) => {
          const next = new Set(previous);
          next.delete(category.id);
          return next;
        });
      }
    } catch (error) {
      setDeleteError(`Deletion stopped. Some categories may already have been deleted. ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsDeleting(false);
      setConfirmBulkDelete(false);
    }
  };

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
    <fieldset disabled={isDeleting} className="space-y-4 min-w-0">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-xs">
          {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
        </Badge>
        {!readOnly && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button ref={createCategoryButtonRef} size="sm" className="bg-brand-600 hover:bg-brand-700 gap-1 h-7 text-xs">
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
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            ref={deleteSelectedButtonRef}
            type="button"
            variant="destructive"
            size="sm"
            disabled={isLoading || selectedCategories.length === 0 || deleteCategoryMutation.isPending}
            onClick={() => setConfirmBulkDelete(true)}
          >
            Delete selected ({selectedCategories.length})
          </Button>
          <span className="text-xs text-stone-500">Select:</span>
          <Button type="button" variant="link" className="h-auto p-0 text-xs" disabled={isLoading || categories.length === 0} onClick={() => setSelectedIds(new Set(categories.map((category) => category.id)))}>
            all
          </Button>
          <Button type="button" variant="link" className="h-auto p-0 text-xs" disabled={selectedCategories.length === 0} onClick={() => setSelectedIds(new Set())}>
            none
          </Button>
        </div>
      )}
      {deleteError && <p role="alert" className="text-sm text-destructive break-words">{deleteError}</p>}

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
              onRename={readOnly ? undefined : handleRename}
              onDelete={readOnly ? undefined : handleDelete}
              onCreateChild={readOnly ? undefined : handleCreateChild}
              selectedIds={selectedIds}
              onToggleSelection={readOnly ? undefined : handleToggleSelection}
            />
          </CardContent>
        </Card>
      )}
      <AlertDialog open={confirmBulkDelete && !readOnly} onOpenChange={(open) => { if (!isDeleting) setConfirmBulkDelete(open); }}>
        <AlertDialogContent onCloseAutoFocus={(event) => {
          event.preventDefault();
          const deleteButton = deleteSelectedButtonRef.current;
          if (deleteButton && !deleteButton.disabled) deleteButton.focus();
          else createCategoryButtonRef.current?.focus();
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected categories?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {selectedCategories.length} selected categories? Their subcategories will also be deleted, even if not checked.
              Recipes will not be deleted, but their assignments to these categories will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={isDeleting || selectedCategories.length === 0} onClick={handleDeleteSelected}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  );
}

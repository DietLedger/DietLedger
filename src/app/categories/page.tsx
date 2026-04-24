'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useBookStore } from '@/lib/book-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Plus,
  FolderOpen,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import CategoryTree from '@/components/category-tree';

export default function CategoriesPage() {
  const {
    categories,
    categoryTree,
    isLoading,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useBookStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    await createCategory(newName.trim(), newParentId);
    setNewName('');
    setNewParentId(null);
    setCreateOpen(false);
  }, [newName, newParentId, createCategory]);

  const handleRename = useCallback(async (id: string, name: string) => {
    await updateCategory(id, { name });
  }, [updateCategory]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteCategory(id);
  }, [deleteCategory]);

  const handleCreateChild = useCallback(async (parentId: string, name: string) => {
    await createCategory(name, parentId);
  }, [createCategory]);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-stone-500 hover:text-emerald-700">
              <ArrowLeft className="w-3.5 h-3.5" />Recipes
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-stone-900">Categories</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
            </Badge>
            <Link href="/books">
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-stone-500 hover:text-emerald-700">
                <FolderOpen className="w-3.5 h-3.5" />Books
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-stone-800">Category Tree</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                <Plus className="w-4 h-4" />Create Category
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
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate} disabled={!newName.trim()}>
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-16">
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
      </main>
    </div>
  );
}

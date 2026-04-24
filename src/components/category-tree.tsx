'use client';

import React, { useState, useCallback } from 'react';
import type { CategoryNode } from '@/lib/book-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Pencil, Trash2, Check, X, Plus } from 'lucide-react';

interface CategoryTreeProps {
  categories: CategoryNode[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCreateChild: (parentId: string, name: string) => void;
}

export default function CategoryTree({ categories, onRename, onDelete, onCreateChild }: CategoryTreeProps) {
  return (
    <div className="space-y-1">
      {categories.map((cat) => (
        <CategoryTreeNode
          key={cat.id}
          node={cat}
          depth={0}
          onRename={onRename}
          onDelete={onDelete}
          onCreateChild={onCreateChild}
        />
      ))}
    </div>
  );
}

interface CategoryTreeNodeProps {
  node: CategoryNode;
  depth: number;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCreateChild: (parentId: string, name: string) => void;
}

function CategoryTreeNode({ node, depth, onRename, onDelete, onCreateChild }: CategoryTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.name);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasChildren = node.children.length > 0;

  const handleSaveRename = useCallback(() => {
    if (editValue.trim()) {
      onRename(node.id, editValue.trim());
    }
    setIsEditing(false);
  }, [editValue, node.id, onRename]);

  const handleAddChild = useCallback(() => {
    if (newChildName.trim()) {
      onCreateChild(node.id, newChildName.trim());
      setNewChildName('');
      setIsAddingChild(false);
      setExpanded(true);
    }
  }, [newChildName, node.id, onCreateChild]);

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-stone-50 group"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          className="w-4 h-4 flex items-center justify-center text-stone-400 hover:text-stone-600 shrink-0"
          onClick={() => setExpanded(!expanded)}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <span className="w-3.5" />
          )}
        </button>

        {isEditing ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              onBlur={handleSaveRename}
              autoFocus
              className="h-6 text-sm"
            />
          </div>
        ) : (
          <span className="text-sm text-stone-800 flex-1 truncate">{node.name}</span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-stone-300 hover:text-emerald-500"
              onClick={() => setIsAddingChild(true)}
              title="Add subcategory"
            >
              <Plus className="w-3 h-3" />
            </Button>
          )}
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-stone-300 hover:text-emerald-500"
              onClick={() => { setEditValue(node.name); setIsEditing(true); }}
              title="Rename"
            >
              <Pencil className="w-3 h-3" />
            </Button>
          )}
          {confirmDelete ? (
            <>
              <Button variant="destructive" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => { onDelete(node.id); setConfirmDelete(false); }}>
                Delete
              </Button>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setConfirmDelete(false)}>
                <X className="w-3 h-3" />
              </Button>
            </>
          ) : (
            !isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-stone-300 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )
          )}
        </div>
      </div>

      {isAddingChild && (
        <div className="flex items-center gap-1 py-1" style={{ paddingLeft: `${(depth + 1) * 20 + 28}px` }}>
          <Input
            placeholder="Subcategory name..."
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddChild();
              if (e.key === 'Escape') setIsAddingChild(false);
            }}
            autoFocus
            className="h-6 text-sm"
          />
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-emerald-600" onClick={handleAddChild}>
            <Check className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setIsAddingChild(false)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onRename={onRename}
              onDelete={onDelete}
              onCreateChild={onCreateChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

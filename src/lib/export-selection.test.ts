import { describe, expect, it } from 'vitest';
import { exportCandidateIds, filterExportCandidates, selectedExportIds } from './export-selection';
import type { ExportCandidateRecord } from './types';

const candidates: ExportCandidateRecord[] = [
  { id: 'r1', type: 'recipe', name: 'Apple Pie', description: '', searchText: 'Apple Pie cinnamon filling', ownerUserId: 'u1', access: 'owned' },
  { id: 'r2', type: 'recipe', name: 'Tomato Soup', description: 'public soup', searchText: 'Tomato Soup basil', ownerUserId: 'u2', access: 'public' },
  { id: 'b1', type: 'book', name: 'Holiday Book', description: 'winter meals', searchText: 'Holiday Book winter meals gingerbread page content', ownerUserId: 'u1', access: 'owned' },
  { id: 'p1', type: 'nutritionProfile', name: 'Alex', description: '', searchText: 'Alex', ownerUserId: 'u1', access: 'owned' },
  { id: 'm1', type: 'mealPlan', name: 'Week 42', description: '2026-10-12', searchText: 'Week 42 2026-10-12', ownerUserId: 'u1', access: 'owned' },
];

describe('export selection helpers', () => {
  it('filters case-insensitively by name, description, or page/content search text', () => {
    expect(filterExportCandidates(candidates, 'APPLE').map((c) => c.id)).toEqual(['r1']);
    expect(filterExportCandidates(candidates, 'PUBLIC').map((c) => c.id)).toEqual(['r2']);
    expect(filterExportCandidates(candidates, 'gingerbread').map((c) => c.id)).toEqual(['b1']);
  });

  it('filters by candidate type independently from text', () => {
    expect(filterExportCandidates(candidates, '', 'book').map((c) => c.id)).toEqual(['b1']);
    expect(filterExportCandidates(candidates, 'soup', 'recipe').map((c) => c.id)).toEqual(['r2']);
  });

  it('builds selected export ids from stable selected keys', () => {
    expect(selectedExportIds(candidates, new Set(['recipe:r2', 'book:b1', 'nutritionProfile:p1', 'mealPlan:m1']))).toEqual({
      recipeIds: ['r2'],
      bookIds: ['b1'],
      profileIds: ['p1'],
      mealPlanIds: ['m1'],
    });
  });

  it('builds all eligible export ids across recipes, books, nutrition profiles, and meal plans', () => {
    expect(exportCandidateIds(candidates)).toEqual({
      recipeIds: ['r1', 'r2'],
      bookIds: ['b1'],
      profileIds: ['p1'],
      mealPlanIds: ['m1'],
    });
  });
});

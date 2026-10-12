import type { ExportCandidateRecord } from './types';

export type ExportCandidateTypeFilter = 'all' | 'recipe' | 'book' | 'nutritionProfile' | 'mealPlan';

export function filterExportCandidates(
  candidates: ExportCandidateRecord[],
  query: string,
  typeFilter: ExportCandidateTypeFilter = 'all',
): ExportCandidateRecord[] {
  const q = query.trim().toLowerCase();
  return candidates.filter((candidate) => {
    if (typeFilter !== 'all' && candidate.type !== typeFilter) return false;
    if (!q) return true;
    const haystack = [candidate.name, candidate.description, candidate.searchText].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

export interface ExportCandidateIds {
  recipeIds: string[];
  bookIds: string[];
  profileIds: string[];
  mealPlanIds: string[];
}

export function exportCandidateIds(candidates: ExportCandidateRecord[]): ExportCandidateIds {
  return {
    recipeIds: candidates.filter((candidate) => candidate.type === 'recipe').map((candidate) => candidate.id),
    bookIds: candidates.filter((candidate) => candidate.type === 'book').map((candidate) => candidate.id),
    profileIds: candidates.filter((candidate) => candidate.type === 'nutritionProfile').map((candidate) => candidate.id),
    mealPlanIds: candidates.filter((candidate) => candidate.type === 'mealPlan').map((candidate) => candidate.id),
  };
}

export function selectedExportIds(
  candidates: ExportCandidateRecord[],
  selectedKeys: Set<string>,
): ExportCandidateIds {
  return exportCandidateIds(candidates.filter((candidate) => selectedKeys.has(`${candidate.type}:${candidate.id}`)));
}

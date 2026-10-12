'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CalendarDays, Check, Download, Search, Salad, UserRound, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiClient } from '@/lib/api-client';
import { downloadRecipeBundle } from '@/lib/recipe-bundles';
import { exportCandidateIds, filterExportCandidates, selectedExportIds, type ExportCandidateTypeFilter } from '@/lib/export-selection';
import type { ExportCandidateRecord } from '@/lib/types';

function candidateKey(candidate: ExportCandidateRecord): string {
  return `${candidate.type}:${candidate.id}`;
}

const candidateTypeMeta = {
  recipe: { label: 'Recipe', plural: 'recipes', icon: Salad },
  book: { label: 'Book', plural: 'books', icon: BookOpen },
  nutritionProfile: { label: 'Nutrition profile', plural: 'nutrition profiles', icon: UserRound },
  mealPlan: { label: 'Meal plan', plural: 'meal plans', icon: CalendarDays },
} satisfies Record<ExportCandidateRecord['type'], { label: string; plural: string; icon: LucideIcon }>;

function countByType(candidates: ExportCandidateRecord[]) {
  return {
    recipe: candidates.filter((candidate) => candidate.type === 'recipe').length,
    book: candidates.filter((candidate) => candidate.type === 'book').length,
    nutritionProfile: candidates.filter((candidate) => candidate.type === 'nutritionProfile').length,
    mealPlan: candidates.filter((candidate) => candidate.type === 'mealPlan').length,
  };
}

function formatExportSummary(counts: ReturnType<typeof countByType>) {
  return `${counts.recipe} recipe${counts.recipe === 1 ? '' : 's'}, ${counts.book} book${counts.book === 1 ? '' : 's'}, ${counts.nutritionProfile} nutrition profile${counts.nutritionProfile === 1 ? '' : 's'}, and ${counts.mealPlan} meal plan${counts.mealPlan === 1 ? '' : 's'}`;
}

export default function ExportPage() {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ExportCandidateTypeFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [exportAll, setExportAll] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: candidates = [], isLoading, error } = useQuery({
    queryKey: ['recipe-bundle-export-candidates'],
    queryFn: () => getApiClient().getRecipeBundleExportCandidates(),
  });

  const visibleCandidates = useMemo(
    () => filterExportCandidates(candidates, query, typeFilter),
    [candidates, query, typeFilter],
  );

  const selectedCount = selected.size;
  const allCounts = countByType(candidates);

  const toggleCandidate = (candidate: ExportCandidateRecord) => {
    if (exportAll) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const key = candidateKey(candidate);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelections = () => {
    setSelected(new Set());
    setExportAll(false);
  };

  const handleExport = async () => {
    setStatus(null);
    setExporting(true);
    try {
      const ids = exportAll ? exportCandidateIds(candidates) : selectedExportIds(candidates, selected);
      const totalSelected = ids.recipeIds.length + ids.bookIds.length + ids.profileIds.length + ids.mealPlanIds.length;

      if (totalSelected === 0) {
        setStatus('Select at least one item or enable Export all.');
        return;
      }

      const bundle = await getApiClient().exportRecipeBundle(ids);
      downloadRecipeBundle(bundle, `dietledger-export-${new Date().toISOString().slice(0, 10)}.dietledger-bundle.json`);
      setStatus(`Exported ${formatExportSummary({ recipe: ids.recipeIds.length, book: ids.bookIds.length, nutritionProfile: ids.profileIds.length, mealPlan: ids.mealPlanIds.length })}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Export Data</h1>
          <p className="text-sm text-stone-500 mt-1">
            Select eligible recipes, books, nutrition profiles, and meal plans to export as a DietLedger bundle.
          </p>
        </div>
        <Button className="bg-brand-600 hover:bg-brand-700 gap-2" onClick={handleExport} disabled={exporting || (!exportAll && selectedCount === 0)}>
          <Download className="w-4 h-4" />{exporting ? 'Exporting...' : 'Export'}
        </Button>
      </div>

      <Card className="mb-5">
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ExportCandidateTypeFilter)}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All export types</SelectItem>
                <SelectItem value="recipe">Recipes only</SelectItem>
                <SelectItem value="book">Books only</SelectItem>
                <SelectItem value="nutritionProfile">Nutrition profiles only</SelectItem>
                <SelectItem value="mealPlan">Meal plans only</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by recipe, book, profile, meal plan, or page content..." />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2 cursor-pointer hover:bg-stone-50">
              <Checkbox
                checked={exportAll}
                onCheckedChange={(checked) => {
                  const enabled = checked === true;
                  setExportAll(enabled);
                  if (enabled) setSelected(new Set());
                }}
              />
              <span>Export all</span>
            </label>
            <Button variant="outline" size="sm" onClick={clearSelections} disabled={!exportAll && selectedCount === 0}>
              <X className="w-3.5 h-3.5 mr-1" />Clear selections
            </Button>
            <span className="text-stone-500">
              {exportAll ? `Exporting all ${formatExportSummary(allCounts)}` : `${selectedCount} selected`}
              {' · '}{visibleCandidates.length} shown
            </span>
          </div>
          {status && <p className={`text-sm ${status.startsWith('Exported') ? 'text-green-700' : 'text-red-700'}`}>{status}</p>}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-700">Failed to load export candidates.</p>}
      {isLoading ? <p className="text-sm text-stone-500">Loading export candidates...</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCandidates.map((candidate) => {
          const key = candidateKey(candidate);
          const active = exportAll || selected.has(key);
          const meta = candidateTypeMeta[candidate.type];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleCandidate(candidate)}
              className={`text-left rounded-lg border p-4 transition-colors ${
                active ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-stone-200 bg-white hover:border-brand-200 hover:bg-stone-50'
              } ${exportAll ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-stone-400 flex items-center gap-1">
                    <Icon className="w-3.5 h-3.5" />{meta.label}{candidate.access === 'public' ? ' · public' : candidate.access === 'admin' ? ' · admin' : ''}
                  </p>
                  <h2 className="font-semibold text-stone-800 truncate mt-1">{candidate.name}</h2>
                </div>
                {active && <span className="rounded-full bg-brand-600 text-white p-1"><Check className="w-3 h-3" /></span>}
              </div>
              {candidate.description && <p className="text-sm text-stone-500 mt-2 line-clamp-3">{candidate.description}</p>}
            </button>
          );
        })}
      </div>

      {!isLoading && visibleCandidates.length === 0 && <p className="text-sm text-stone-500 mt-6">No export candidates match the current filter.</p>}
    </main>
  );
}

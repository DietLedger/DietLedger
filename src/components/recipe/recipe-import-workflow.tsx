'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getApiClient, type RecipeBundle, type RecipeBundleImportSummary } from '@/lib/api-client';
import { importRecipeBundle, importRecipeBundleFromFile } from '@/lib/recipe-bundles';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Link from 'next/link';

export async function refreshRecipeImportQueries(client: QueryClient) {
  // Refresh authoritative staging and all existing consumers of promoted recipes/placement.
  await Promise.all([
    queryKeys.recipeImports.all, queryKeys.recipes.all, queryKeys.books.all,
    queryKeys.categories.all, queryKeys.templates.all, ['recipe-bundle-export-candidates'],
  ].map(queryKey => client.invalidateQueries({ queryKey })));
}

type PendingDecision = {
  summary: RecipeBundleImportSummary;
  resolve: (summary: RecipeBundleImportSummary) => void;
  reject: (error: Error) => void;
};

export function useRecipeImport() {
  const client = useQueryClient();
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const current = useRef<PendingDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    current.current?.reject(new Error('Import preserved in quarantine; choose an action there.'));
  }, []);

  const requestDecision = useCallback((summary: RecipeBundleImportSummary) => new Promise<RecipeBundleImportSummary>((resolve, reject) => {
    const decision = { summary, resolve, reject };
    current.current = decision;
    setError('');
    setPending(decision);
    void refreshRecipeImportQueries(client);
  }), [client]);

  const importFile = useCallback(async (file: File) => {
    const summary = await importRecipeBundleFromFile(file, requestDecision);
    await refreshRecipeImportQueries(client);
    return summary;
  }, [client, requestDecision]);

  const importBundle = useCallback(async (bundle: RecipeBundle) => {
    const summary = await importRecipeBundle(bundle, requestDecision);
    await refreshRecipeImportQueries(client);
    return summary;
  }, [client, requestDecision]);

  const resumeDecision = useCallback((batchId: string, quarantined: number) => requestDecision({
    pendingImportId: batchId, requiresDecision: true, quarantined,
    created: {}, updated: {}, reused: {}, skipped: {}, conflicts: [],
  }), [requestDecision]);

  const decide = async (action: 'keep' | 'cancel') => {
    if (!pending?.summary.pendingImportId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await getApiClient().decideRecipeImport(pending.summary.pendingImportId, action);
      await refreshRecipeImportQueries(client);
      pending.resolve(result);
      current.current = null;
      setPending(null);
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'Decision failed'}. Your import is preserved; retry or return to quarantine.`);
    } finally {
      setBusy(false);
    }
  };

  const decisionDialog = <Dialog open={!!pending}>
    <DialogContent className="sm:max-w-lg" onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()} showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>Missing food records</DialogTitle>
        <DialogDescription>
          Required food or linked-recipe records are missing. {pending?.summary.quarantined ?? 'Some'} recipes need relinking.
          No recipes from this incoming batch have been added to your library.
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm">Stop and undo cancels the entire incoming batch. Relink later keeps its unresolved recipes in quarantine and adds only complete recipes. Earlier imports are unchanged.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Link href="/recipes/quarantine" className="text-sm underline">View quarantine</Link>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={() => decide('cancel')}>Stop and undo</Button>
        <Button disabled={busy} onClick={() => decide('keep')}>Relink later</Button>
      </div>
    </DialogContent>
  </Dialog>;

  return { importFile, importBundle, resumeDecision, decisionDialog };
}

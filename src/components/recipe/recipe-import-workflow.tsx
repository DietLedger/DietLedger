'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getApiClient, type BookImportConflict, type BookImportDecision, type RecipeBundle, type RecipeBundleImportSummary } from '@/lib/api-client';
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
type PendingBookDecision = {
  conflicts: BookImportConflict[];
  index: number;
  decisions: BookImportDecision[];
  selectedTargetId: string;
  resolve: (decisions: BookImportDecision[] | null) => void;
};

export function useRecipeImport() {
  const client = useQueryClient();
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [pendingBooks, setPendingBooks] = useState<PendingBookDecision | null>(null);
  const current = useRef<PendingDecision | null>(null);
  const pendingBookRef = useRef<PendingBookDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    current.current?.reject(new Error('Import preserved in quarantine; choose an action there.'));
    pendingBookRef.current?.resolve(null);
  }, []);

  const requestDecision = useCallback((summary: RecipeBundleImportSummary) => new Promise<RecipeBundleImportSummary>((resolve, reject) => {
    const decision = { summary, resolve, reject };
    current.current = decision;
    setError('');
    setPending(decision);
    void refreshRecipeImportQueries(client);
  }), [client]);

  const requestBookDecision = useCallback((conflicts: BookImportConflict[]) => new Promise<BookImportDecision[] | null>(resolve => {
    const decision = { conflicts, index: 0, decisions: [], selectedTargetId: conflicts[0]?.candidates[0]?.targetBookId ?? '', resolve };
    pendingBookRef.current = decision;
    setPendingBooks(decision);
  }), []);

  const importFile = useCallback(async (file: File) => {
    const summary = await importRecipeBundleFromFile(file, requestDecision, requestBookDecision);
    await refreshRecipeImportQueries(client);
    return summary;
  }, [client, requestDecision, requestBookDecision]);

  const importBundle = useCallback(async (bundle: RecipeBundle) => {
    const summary = await importRecipeBundle(bundle, requestDecision, requestBookDecision);
    await refreshRecipeImportQueries(client);
    return summary;
  }, [client, requestDecision, requestBookDecision]);

  const chooseBookDecision = (action: BookImportDecision['action']) => {
    if (!pendingBooks) return;
    const conflict = pendingBooks.conflicts[pendingBooks.index];
    const candidate = conflict?.candidates.find(item => item.targetBookId === pendingBooks.selectedTargetId);
    if (!conflict || !candidate) return;
    const decisions = [...pendingBooks.decisions, {
      bundleBookId: conflict.bundleBookId,
      targetBookId: candidate.targetBookId,
      action,
      targetFingerprint: candidate.targetFingerprint,
    }];
    if (pendingBooks.index + 1 === pendingBooks.conflicts.length) {
      pendingBooks.resolve(decisions);
      pendingBookRef.current = null;
      setPendingBooks(null);
      return;
    }
    const index = pendingBooks.index + 1;
    setPendingBooks({ ...pendingBooks, index, decisions, selectedTargetId: pendingBooks.conflicts[index]?.candidates[0]?.targetBookId ?? '' });
  };

  const cancelBookImport = () => {
    pendingBooks?.resolve(null);
    pendingBookRef.current = null;
    setPendingBooks(null);
  };

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

  const bookConflictDialog = <Dialog open={!!pendingBooks}>
    <DialogContent className="sm:max-w-lg" onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()} showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>Duplicate recipe book</DialogTitle>
        <DialogDescription>
          “{pendingBooks?.conflicts[pendingBooks.index]?.title}” matches a book already in your library. Choose how to handle it.
          {pendingBooks && pendingBooks.conflicts.length > 1 ? ` (${pendingBooks.index + 1} of ${pendingBooks.conflicts.length})` : ''}
        </DialogDescription>
      </DialogHeader>
      {(pendingBooks?.conflicts[pendingBooks.index]?.candidates.length ?? 0) > 1 && (
        <label className="space-y-1 text-sm">
          <span>Existing book to use</span>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            aria-label="Existing book to use"
            value={pendingBooks?.selectedTargetId}
            onChange={event => pendingBooks && setPendingBooks({ ...pendingBooks, selectedTargetId: event.target.value })}
          >
            {pendingBooks?.conflicts[pendingBooks.index]?.candidates.map(candidate => <option key={candidate.targetBookId} value={candidate.targetBookId}>{candidate.title}</option>)}
          </select>
        </label>
      )}
      <p className="text-sm text-muted-foreground">Merge keeps the existing book and adds incoming pages and chapters. Replace swaps its book structure but keeps its recipes in your library.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={cancelBookImport}>Cancel import</Button>
        <Button variant="outline" onClick={() => chooseBookDecision('merge')}>Merge</Button>
        <Button onClick={() => chooseBookDecision('replace')}>Replace</Button>
      </div>
    </DialogContent>
  </Dialog>;

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

  return { importFile, importBundle, resumeDecision, decisionDialog: <>{bookConflictDialog}{decisionDialog}</> };
}

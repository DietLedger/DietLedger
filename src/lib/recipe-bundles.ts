import { getApiClient, type RecipeBundle, type RecipeBundleImportSummary } from './api-client';
import { validatePendingImports } from './recipe-bundle-format';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadRecipeBundle(bundle: RecipeBundle, filename: string): void {
  validatePendingImports(bundle);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

export async function readRecipeBundleFile(file: File): Promise<RecipeBundle> {
  if (file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Legacy zip imports are no longer supported. Import a DietLedger recipe bundle JSON file.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Invalid JSON bundle file');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid recipe bundle');
  }
  const bundle = parsed as Partial<RecipeBundle>;
  if (bundle.format !== 'dietledger.recipe-bundle' || (bundle.version !== 1 && bundle.version !== 2 && bundle.version !== 3 && bundle.version !== 4)) {
    throw new Error('Unsupported bundle format (expected dietledger.recipe-bundle v1, v2, v3 or v4)');
  }
  validatePendingImports(bundle);
  return bundle as RecipeBundle;
}

export type MissingImportDecision = (summary: RecipeBundleImportSummary) => Promise<RecipeBundleImportSummary>;
export type BookConflictDecision = (conflicts: NonNullable<RecipeBundleImportSummary['bookConflicts']>) => Promise<import('./api-client').BookImportDecision[] | null>;

export async function importRecipeBundle(
  bundle: RecipeBundle,
  decideMissing?: MissingImportDecision,
  decideBooks?: BookConflictDecision,
): Promise<RecipeBundleImportSummary> {
  validatePendingImports(bundle);
  let summary = await getApiClient().importRecipeBundle(bundle);
  while (summary.requiresBookDecision) {
    if (!summary.bookConflicts?.length || !decideBooks) {
      throw new Error('Import needs a duplicate-book decision before it can continue.');
    }
    const decisions = await decideBooks(summary.bookConflicts);
    if (decisions === null) return { ...summary, importCancelled: true };
    summary = await getApiClient().importRecipeBundle(bundle, decisions);
  }
  if (!summary.requiresDecision) return summary;
  if (!summary.pendingImportId || !decideMissing) throw new Error('Import is preserved in quarantine and requires a missing-record decision.');
  return decideMissing(summary);
}

export async function importRecipeBundleFromFile(file: File, decideMissing?: MissingImportDecision, decideBooks?: BookConflictDecision): Promise<RecipeBundleImportSummary> {
  return importRecipeBundle(await readRecipeBundleFile(file), decideMissing, decideBooks);
}

export function summarizeRecipeBundleImport(summary: RecipeBundleImportSummary): string {
  if (summary.importCancelled) return 'Import cancelled';
  const parts: string[] = [];
  const add = (label: string, counts: Record<string, number>) => {
    const total = Object.values(counts ?? {}).reduce((sum, n) => sum + (n || 0), 0);
    if (total > 0) parts.push(`${label} ${total}`);
  };
  add('created', summary.created);
  add('updated', summary.updated);
  add('reused', summary.reused);
  add('skipped', summary.skipped);
  if (summary.quarantined) parts.push(`${summary.quarantined} quarantined — relink at /recipes/quarantine`);
  if (summary.conflicts?.length) parts.push(`${summary.conflicts.length} conflict${summary.conflicts.length === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'No changes';
}

export function safeBundleFilename(name: string, fallback: string): string {
  const safe = (name || fallback).replace(/[^\w-]+/g, '_').replace(/_+/g, '_').toLowerCase();
  return `${safe || fallback}.dietledger-bundle.json`;
}

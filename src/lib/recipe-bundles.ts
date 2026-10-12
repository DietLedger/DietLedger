import { getApiClient, type RecipeBundle, type RecipeBundleImportSummary } from './api-client';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadRecipeBundle(bundle: RecipeBundle, filename: string): void {
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
  if (bundle.format !== 'dietledger.recipe-bundle' || bundle.version !== 1) {
    throw new Error('Unsupported bundle format (expected dietledger.recipe-bundle v1)');
  }
  return bundle as RecipeBundle;
}

export async function importRecipeBundleFromFile(file: File): Promise<RecipeBundleImportSummary> {
  const bundle = await readRecipeBundleFile(file);
  return getApiClient().importRecipeBundle(bundle);
}

export function summarizeRecipeBundleImport(summary: RecipeBundleImportSummary): string {
  const parts: string[] = [];
  const add = (label: string, counts: Record<string, number>) => {
    const total = Object.values(counts ?? {}).reduce((sum, n) => sum + (n || 0), 0);
    if (total > 0) parts.push(`${label} ${total}`);
  };
  add('created', summary.created);
  add('updated', summary.updated);
  add('reused', summary.reused);
  add('skipped', summary.skipped);
  if (summary.conflicts?.length) parts.push(`${summary.conflicts.length} conflict${summary.conflicts.length === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'No changes';
}

export function safeBundleFilename(name: string, fallback: string): string {
  const safe = (name || fallback).replace(/[^\w-]+/g, '_').replace(/_+/g, '_').toLowerCase();
  return `${safe || fallback}.dietledger-bundle.json`;
}

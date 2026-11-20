import type { RecipeBundle } from './api-client';

// Staging payloads are owned by the backend. Preserve them verbatim, but fail closed
// before accepting a format whose staged content the current restore API cannot read.
export function validatePendingImports(bundle: Partial<RecipeBundle>): void {
  if (bundle.version !== 3 && bundle.pendingImports === undefined) return;
  const pending = bundle.pendingImports;
  if ((bundle.version !== 3 && bundle.version !== 4) || !pending || typeof pending !== 'object' || Array.isArray(pending) || pending.version !== 1) {
    throw new Error('Unsupported pending imports format; staged content cannot be discarded.');
  }
}

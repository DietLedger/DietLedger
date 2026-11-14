// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readRecipeBundleFile } from './recipe-bundles';

function bundleFile(value: unknown, name = 'recipes.dietledger-bundle.json'): File {
  return new File([JSON.stringify(value)], name, { type: 'application/json' });
}

describe('readRecipeBundleFile', () => {
  it('accepts v2 without changing portable identities or unresolved recipe data', async () => {
    const bundle = {
      format: 'dietledger.recipe-bundle',
      version: 2,
      exportedAt: '2026-11-14T00:00:00Z',
      recipes: [{
        id: 'local-recipe',
        portableId: 'dietledger:recipe:550e8400-e29b-41d4-a716-446655440000',
        name: 'Unmatched soup',
        ingredients: [{ name: 'Unknown vegetable', amount: 1, unit: 'cup' }],
      }],
      customFoods: [{
        id: 'local-food',
        portableId: 'dietledger:food:550e8400-e29b-41d4-a716-446655440001',
      }],
    };

    await expect(readRecipeBundleFile(bundleFile(bundle))).resolves.toEqual(bundle);
  });

  it('accepts v1 without inferring portable identities or intentional zero overrides', async () => {
    const bundle = {
      format: 'dietledger.recipe-bundle',
      version: 1,
      exportedAt: '2026-11-14T00:00:00Z',
      recipes: [{
        id: 'legacy-recipe',
        ingredients: [{ name: 'Unknown', sourceType: 'manual', calories: 0 }],
      }],
    };

    await expect(readRecipeBundleFile(bundleFile(bundle))).resolves.toEqual(bundle);
  });

  it.each([0, 3, -1, '1', '2', null, undefined])('rejects unsupported version %s', async (version) => {
    await expect(readRecipeBundleFile(bundleFile({
      format: 'dietledger.recipe-bundle',
      version,
    }))).rejects.toThrow('Unsupported bundle format');
  });

  it.each([{}, { version: 2 }, { format: 'other', version: 2 }])('rejects malformed package envelope %j', async (value) => {
    await expect(readRecipeBundleFile(bundleFile(value))).rejects.toThrow('Unsupported bundle format');
  });

  it.each([null, 'not a bundle', 42])('rejects non-object JSON %j', async (value) => {
    await expect(readRecipeBundleFile(bundleFile(value))).rejects.toThrow('Invalid recipe bundle');
  });

  it('rejects invalid JSON', async () => {
    const file = new File(['{invalid'], 'recipes.json', { type: 'application/json' });

    await expect(readRecipeBundleFile(file)).rejects.toThrow('Invalid JSON bundle file');
  });

  it('still rejects legacy zip files even when they contain valid v2 JSON', async () => {
    const file = bundleFile({ format: 'dietledger.recipe-bundle', version: 2 }, 'recipes.ZIP');

    await expect(readRecipeBundleFile(file)).rejects.toThrow('Legacy zip imports are no longer supported');
  });
});

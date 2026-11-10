import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Public Domain Recipes bundle', () => {
  it('keeps only the author in metadata and puts an attributed Preface before Breakfast', () => {
    const bundle = JSON.parse(readFileSync(resolve(process.cwd(), 'seed-recipes/complete/Public-Domain-Recipes.dietledger-bundle.json'), 'utf8'));
    const book = bundle.books.find((item: { bundleBookId: string }) => item.bundleBookId === 'public-domain-recipes');
    const preface = bundle.bookPages.find((page: { title: string }) => page.title === 'Preface');
    const breakfast = bundle.chapters.find((chapter: { title: string }) => chapter.title === 'Breakfast & brunch');
    expect(book.description).toBe('Author: Various');
    expect(preface.position).toBeLessThan(breakfast.position);
    expect(preface.content).toContain('PublicDomainRecipes.com');
    expect(preface.content).toContain('UNLICENSE');
    expect(preface.content).toContain('https://unlicense.org');
  });
});

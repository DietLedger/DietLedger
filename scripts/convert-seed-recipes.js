#!/usr/bin/env node
/**
 * Convert the markdown recipes in seed-recipes/{complete,incomplete}/ into an importable bundle
 * (ExportData JSON + zip) at seed-recipes/dist/seed-recipes.{json,zip}.
 *
 * Transformations (per the spec):
 *  - YAML frontmatter: title, tags -> categories, author -> "Author: <name>" category.
 *  - Meta bullets: Prep time / Cook time -> recipe.prepTime / cookTime; Servings -> servings.
 *  - ASCII fractions (1/2) and unicode fractions (½, incl. mixed "1 ½") -> decimals.
 *  - Ingredient sub-lists under a `###`/bold/italic heading -> ingredientGroups.
 *  - Ingredient prep words (chopped, diced, ...) -> ingredient.prepInstructions.
 *  - Images stripped.
 *  - Links to other seed recipes IN THE INGREDIENTS -> embedded recipe ingredients
 *    (fdcId -1, linkedRecipeId); dependencies are emitted first (topo order).
 *  - Best-effort USDA food matching (generic fallback) -> ingredient nutrition,
 *    scaled to grams. Requires SEED_API_URL + SEED_API_TOKEN and a seeded DB;
 *    otherwise falls back to fdcId -2 / zero nutrition.
 *
 * Run: node scripts/convert-seed-recipes.js
 *      node scripts/convert-seed-recipes.js --complete-only (writes a native recipe bundle JSON)
 *      (SEED_API_URL=http://localhost:8080 SEED_API_TOKEN=<key> node ... for matching)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const yaml = require('js-yaml');

const SEED_DIR = path.join(__dirname, '..', 'seed-recipes');
const OUT_DIR = path.join(SEED_DIR, 'dist');
const API_URL = (process.env.SEED_API_URL || '').replace(/\/+$/, '');
const API_TOKEN = process.env.SEED_API_TOKEN || '';
const MATCH_ENABLED = Boolean(API_URL && API_TOKEN);

// ── Fractions ────────────────────────────────────────────────────────
const UNICODE_FRACTIONS = {
  '½': 0.5, '⅓': 0.333, '⅔': 0.667, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 0.167, '⅚': 0.833,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};
const fracStr = (v) => String(Math.round(v * 1000) / 1000);

function convertFractions(text) {
  // mixed numbers: "1 ½" -> "1.5"
  text = text.replace(/(\d+)\s+([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g,
    (m, whole, frac) => fracStr(parseInt(whole, 10) + UNICODE_FRACTIONS[frac]));
  // standalone unicode fractions
  text = text.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (f) => fracStr(UNICODE_FRACTIONS[f]));
  // ASCII fractions n/m -> decimal (skips ranges like 1-2 and temps like 350°F/180°C)
  text = text.replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g,
    (m, n, d) => fracStr(parseFloat(n) / parseFloat(d)));
  return text;
}

// ── Units / grams ────────────────────────────────────────────────────
const UNITS = {
  g: 'g', gr: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilogram: 'kg', kilograms: 'kg',
  mg: 'mg', ml: 'ml', milliliter: 'ml', millilitre: 'ml', milliliters: 'ml',
  l: 'l', liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  cup: 'cup', cups: 'cup', c: 'cup',
  tbsp: 'tbsp', tablespoons: 'tbsp', tablespoon: 'tbsp', tbs: 'tbsp',
  tsp: 'tsp', teaspoons: 'tsp', teaspoon: 'tsp',
  clove: 'clove', cloves: 'clove', stick: 'stick', sticks: 'stick',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  slice: 'slice', slices: 'slice', piece: 'whole', pieces: 'whole', whole: 'whole',
  pinch: 'pinch', pinches: 'pinch', dash: 'dash', handful: 'handful', handfuls: 'handful',
  package: 'package', packages: 'package', pkg: 'package', packet: 'package',
};
const UNIT_TO_GRAMS = { g: 1, oz: 28.35, lb: 453.6, cup: 240, tbsp: 15, tsp: 5, ml: 1, l: 1000, kg: 1000, whole: 100 };
const convertToGrams = (amount, unit) => amount * (UNIT_TO_GRAMS[unit] || 1);

// ── Prep words (moved into ingredient.prepInstructions) ──────────────
const PREP_INTENSIFIERS = new Set(['finely', 'roughly', 'thinly', 'thickly', 'coarsely', 'lightly']);
const PREP_VERBS = new Set([
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'peeled', 'crushed', 'melted', 'beaten',
  'whisked', 'cubed', 'halved', 'quartered', 'trimmed', 'cooked', 'boiled', 'fried', 'baked',
  'steamed', 'roasted', 'toasted', 'soaked', 'blanched', 'julienned', 'pureed', 'pureéd',
  'mashed', 'shredded', 'deveined', 'ground', 'crumbled', 'stewed', 'braised', 'grilled',
  'heated', 'warm', 'cold', 'divided', 'trimmed', 'segmented', 'zested', 'julienne', 'diced',
]);

function extractPrep(text) {
  const tokens = text.split(/\s+/);
  const nameTokens = [];
  const prep = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].toLowerCase().replace(/[^a-z']/g, '');
    const next = i + 1 < tokens.length ? tokens[i + 1].toLowerCase().replace(/[^a-z']/g, '') : '';
    if (PREP_INTENSIFIERS.has(w) && PREP_VERBS.has(next)) {
      prep.push(`${w} ${next}`);
      i++; // consume verb too
    } else if (PREP_VERBS.has(w)) {
      prep.push(w);
    } else {
      nameTokens.push(tokens[i]);
    }
  }
  let name = nameTokens.join(' ').replace(/\s+/g, ' ').trim();
  return { name, prep };
}

// ── Ingredient line parsing ──────────────────────────────────────────
function parseAmountUnit(s) {
  s = s.trim();
  const m = s.match(/^([\d.]+(?:\s*-\s*[\d.]+)?)\s*([a-zA-Z']*)/);
  if (!m) return { amount: 1, unit: '', remaining: s, rangeNote: '' };
  const numStr = m[1];
  let unitWord = m[2].toLowerCase().replace(/\.+$/, '').trim();
  let rest = s.slice(m[0].length).trim();
  let amount;
  let rangeNote = '';
  if (numStr.includes('-')) {
    const [a] = numStr.split('-').map((x) => parseFloat(x));
    amount = a; rangeNote = numStr;
  } else {
    amount = parseFloat(numStr);
  }
  let unit = '';
  if (unitWord && UNITS[unitWord]) {
    unit = UNITS[unitWord];
  } else if (unitWord) {
    rest = `${unitWord} ${rest}`.trim();
  }
  rest = rest.replace(/^[\s.,;:_-]+/, '').replace(/^\s*of\s+/i, '').trim();
  return { amount, unit, remaining: rest, rangeNote };
}

const NUTRIENT_KEYS = [
  'calories', 'totalFat', 'saturatedFat', 'transFat', 'cholesterol', 'sodium',
  'totalCarbs', 'dietaryFiber', 'totalSugars', 'addedSugars', 'protein',
  'vitaminD', 'calcium', 'iron', 'potassium',
];
const zeroNutrition = () => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));

// Strip markdown image / link syntax helpers
const stripInlineMarkup = (s) => s
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')      // images
  .replace(/\*\*([^*]+)\*\*/g, '$1')          // bold
  .replace(/__([^_]+)__/g, '$1')
  .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1') // italic
  .replace(/`([^`]+)`/g, '$1');

// Extract resolved recipe links from an ingredient line.
// Returns { links: [{label, slug}], text: lineWithLinkLabelsOnly }
function extractRecipeLinks(line, slugSet) {
  const links = [];
  const text = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, target) => {
    const slug = target.replace(/^\.?\//, '').replace(/\.md$/i, '').replace(/\/.*$/, '').trim();
    if (slugSet.has(slug)) {
      links.push({ label: label.trim(), slug });
      return ''; // drop the link text from the remainder
    }
    return label; // unresolved link -> keep label as plain text
  });
  return { links, text };
}

function parseIngredientLine(line, slugSet, recipeSlug) {
  const converted = convertFractions(line);
  // pull out resolved recipe links first (embedded sub-recipes)
  const { links, text: afterLinks } = extractRecipeLinks(converted, slugSet);
  if (links.length > 0) {
    const desc = afterLinks.replace(/^\s*[-•]\s*/, '').replace(/^or\s+/i, '').trim();
    return links.map((l, i) => ({
      fdcId: -1,
      name: l.label,
      amount: 1,
      unit: '× recipe',
      description: i === 0 ? desc : '',
      linkedRecipeId: l.slug,
      embedded: true,
      ...zeroNutrition(),
    }));
  }

  let cleaned = stripInlineMarkup(afterLinks).trim();
  // trailing parentheticals -> description
  let description = '';
  cleaned = cleaned.replace(/\s*\(([^)]*)\)\s*/g, (m, p) => { description += (description ? ' ' : '') + `(${p})`; return ' '; });
  // comma split: first part has name (+ amount), rest is prep/modifier
  const commaParts = cleaned.split(',');
  const head = commaParts.shift();
  const modifier = commaParts.join(',').trim();
  const { amount, unit, remaining, rangeNote } = parseAmountUnit(head);
  const combined = (remaining + (modifier ? `, ${modifier}` : '')).trim();
  const { name, prep } = extractPrep(combined);
  if (rangeNote) description = (description + ' ' + `(${rangeNote} ${unit})`).trim();
  return [{
    fdcId: -2,
    name: name || stripInlineMarkup(cleaned).trim() || 'ingredient',
    amount,
    unit,
    description: description.replace(/\s+/g, ' ').trim(),
    prepInstructions: prep,
    linkedRecipeId: null,
    ...zeroNutrition(),
  }];
}

// ── Section / heading detection ──────────────────────────────────────
const isHeading = (ln) => /^\s*#{1,6}\s+/.test(ln);
const headingText = (ln) => ln.replace(/^\s*#{1,6}\s+/, '').replace(/#+\s*$/, '').trim();
const isWholeBold = (ln) => /^\s*\*\*[^*]+\*\*\s*:?\s*$/.test(ln);
const isWholeItalic = (ln) => /^\s*(?<!\w)\*[^*]+\*(?!\w)\s*:?\s*$/.test(ln);
const groupTitleFromLine = (ln) => stripInlineMarkup(ln.replace(/^\s*#{1,6}\s*/, '')).replace(/:\s*$/, '').trim();

// ── Food matching (best effort) ──────────────────────────────────────
const matchCache = new Map();
async function searchFoods(query) {
  if (!MATCH_ENABLED) return [];
  const key = query.toLowerCase();
  if (matchCache.has(key)) return matchCache.get(key);
  let foods = [];
  try {
    const url = `${API_URL}/api/foods/search?q=${encodeURIComponent(query)}&perPage=5`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
    if (res.ok) {
      const json = await res.json();
      foods = json.foods || (json.data && json.data.foods) || [];
    }
  } catch { /* ignore — treat as no match */ }
  matchCache.set(key, foods);
  return foods;
}

// Heuristic relevance: does the food description share key tokens with the query?
function tokenOverlap(query, desc) {
  const q = new Set(query.toLowerCase().split(/[^a-z']+/).filter((t) => t.length > 2));
  const d = new Set(desc.toLowerCase().split(/[^a-z']+/).filter((t) => t.length > 2));
  let hit = 0;
  for (const t of q) if (d.has(t)) hit++;
  return hit;
}

async function matchFood(originalName) {
  if (!MATCH_ENABLED || !originalName) return null;
  const base = originalName.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (base.length < 2) return null;
  const words = base.split(' ');
  // Try the full name, then progressively drop leading qualifiers (generic fallback).
  const queries = [];
  for (let k = 0; k < Math.min(words.length, 4); k++) {
    queries.push(words.slice(k).join(' '));
  }
  // also try last word only as a final fallback
  if (words.length > 1) queries.push(words[words.length - 1]);
  let best = null;
  let bestScore = 0;
  for (const q of queries) {
    if (!q || q.length < 2) continue;
    const foods = await searchFoods(q);
    if (foods.length === 0) continue;
    // pick the best token overlap in this result set
    for (const f of foods) {
      const score = tokenOverlap(q, f.description || '');
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (best) break; // accept the first query level that yields a match
  }
  return best;
}

function scaleNutrition(food, grams) {
  const factor = grams / 100;
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    const v = typeof food[k] === 'number' ? food[k] : 0;
    out[k] = Math.round(v * factor * 100) / 100;
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  try {
    return { fm: yaml.load(m[1]) || {}, body: m[2] };
  } catch {
    return { fm: {}, body: m[2] };
  }
}

function splitSections(body) {
  // Returns { ingredients: [lines], directions: [lines] } by ## headings.
  const lines = body.split(/\r?\n/);
  const sections = { ingredients: [], directions: [] };
  let current = null;
  for (const ln of lines) {
    const h = ln.match(/^\s*##\s+(.+?)\s*$/);
    if (h) {
      const t = h[1].toLowerCase();
      if (t.includes('ingredient')) current = 'ingredients';
      else if (t.includes('direction') || t.includes('instruction') || t.includes('method') || t.includes('preparation') || t.includes('steps')) current = 'directions';
      else current = null;
      continue;
    }
    if (current) sections[current].push(ln);
  }
  return sections;
}

function parseMetaBlock(body) {
  // emoji-prefixed bullets anywhere before ingredients, e.g. "- ⏲️ Prep time: 10 min"
  const meta = { prepTime: '', cookTime: '', servings: 0 };
  const prep = body.match(/(prep\s*time)\s*:\s*([^\n]+)/i);
  const cook = body.match(/(cook\s*time)\s*:\s*([^\n]+)/i);
  const serv = body.match(/servings?\s*:\s*(\d+)/i);
  if (prep) meta.prepTime = prep[2].replace(/[*_`]/g, '').trim();
  if (cook) meta.cookTime = cook[2].replace(/[*_`]/g, '').trim();
  if (serv) meta.servings = parseInt(serv[1], 10);
  return meta;
}

function stripImages(body) {
  return body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n');
}

// Parse the ingredients section into { groups: [{id,title}], items: [{...ingredient, groupId}] }
function parseIngredientsSection(sectionLines, slugSet, recipeSlug) {
  const groups = [];
  const items = [];
  let currentGroupId = null;
  let gidx = 0;
  for (const raw of sectionLines) {
    const ln = raw.trim();
    if (!ln) continue;
    if (isHeading(ln) || isWholeBold(ln) || isWholeItalic(ln)) {
      const title = groupTitleFromLine(ln);
      if (!title) continue;
      const id = `${recipeSlug}-g${gidx++}`;
      groups.push({ id, title });
      currentGroupId = id;
      continue;
    }
    if (!/^[-•*]\s+/.test(ln)) continue; // skip non-bullets (side notes)
    const text = ln.replace(/^[-•*]\s+/, '');
    const parsed = parseIngredientLine(text, slugSet, recipeSlug);
    for (const ing of parsed) {
      items.push({ ...ing, groupId: currentGroupId });
    }
  }
  return { groups, items };
}

// Parse directions into { steps: [{id,text,groupId}], groups: [{id,title}] }
function parseDirectionsSection(sectionLines, recipeSlug) {
  const groups = [];
  const steps = [];
  let currentGroupId = null;
  let gidx = 0;
  let sidx = 0;
  let pending = '';
  const flush = () => {
    if (!pending.trim()) return;
    const text = convertFractions(pending.trim());
    const cleaned = stripInlineMarkup(text).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    steps.push({ id: `${recipeSlug}-s${sidx++}`, text: cleaned, groupId: currentGroupId });
    pending = '';
  };
  for (const raw of sectionLines) {
    const ln = raw.trim();
    if (!ln) continue;
    if (isHeading(ln)) {
      flush();
      const title = groupTitleFromLine(ln);
      if (title) {
        const id = `${recipeSlug}-dg${gidx++}`;
        groups.push({ id, title });
        currentGroupId = id;
      }
      continue;
    }
    if (/^\d+[.)]\s+/.test(ln)) {
      flush();
      pending = ln.replace(/^\d+[.)]\s*/, '');
    } else if (ln.startsWith('-') || ln.startsWith('•')) {
      // sub-bullet: append to current step
      pending += ' ' + ln.replace(/^[-•]\s*/, '');
    } else if (pending) {
      pending += ' ' + ln;
    } else {
      pending = ln;
    }
  }
  flush();
  return { steps, groups };
}

function recipeFiles(completeOnly = false) {
  return (completeOnly ? ['complete'] : ['complete', 'incomplete']).flatMap((dir) =>
    fs.readdirSync(path.join(SEED_DIR, dir))
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join(dir, file)));
}

async function buildRecipes(completeOnly = false) {
  const files = recipeFiles(completeOnly);
  const slugSet = new Set(files.map((file) => path.basename(file, '.md')));
  const bySlug = new Map();
  const stats = { files: files.length, matched: 0, unmatched: 0, embedded: 0 };

  // Pass 1: parse structure (no matching yet).
  for (const file of files) {
    const slug = path.basename(file, '.md');
    let raw;
    try { raw = fs.readFileSync(path.join(SEED_DIR, file), 'utf8'); }
    catch { continue; }
    try {
      raw = stripImages(raw);
      const { fm, body } = parseFrontmatter(raw);
      const meta = parseMetaBlock(body);
      const sections = splitSections(body);
      const ing = parseIngredientsSection(sections.ingredients, slugSet, slug);
      const dir = parseDirectionsSection(sections.directions, slug);

      const instructions = (dir.steps.length || dir.groups.length)
        ? JSON.stringify({ steps: dir.steps, groups: dir.groups })
        : null;

      const recipe = {
        id: slug,
        name: (fm.title || slug).trim(),
        servings: meta.servings || 1,
        servingName: 'serving',
        prepTime: meta.prepTime || undefined,
        cookTime: meta.cookTime || undefined,
        instructions,
        ingredientGroups: ing.groups,
        ingredients: ing.items,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // tags + author -> categories
      const tagNames = Array.isArray(fm.tags)
        ? fm.tags.map((t) => String(t).trim()).filter(Boolean)
        : (typeof fm.tags === 'string' ? [fm.tags.trim()] : []);
      recipe._tagNames = tagNames;
      recipe._author = fm.author ? String(fm.author).trim() : '';
      bySlug.set(slug, recipe);
      stats.embedded += ing.items.filter((i) => i.embedded).length;
    } catch (e) {
      console.warn(`  ! failed to parse ${slug}: ${e.message}`);
    }
  }

  // Pass 2: food matching + scale nutrition for non-embedded ingredients.
  for (const [slug, recipe] of bySlug) {
    for (const ing of recipe.ingredients) {
      if (ing.embedded) continue;
      const grams = convertToGrams(ing.amount, ing.unit);
      const food = await matchFood(ing.name);
      if (food) {
        ing.fdcId = food.fdcId;
        Object.assign(ing, scaleNutrition(food, grams));
        stats.matched++;
      } else {
        stats.unmatched++;
      }
    }
    if (bySlug.size < 10 || files.length <= 12) process.stdout.write('.');
  }

  // Pass 3: embedded recipe ingredients inherit nutrition from their linked recipe.
  for (const recipe of bySlug.values()) {
    for (const ing of recipe.ingredients) {
      if (!ing.embedded || !ing.linkedRecipeId) continue;
      const linked = bySlug.get(ing.linkedRecipeId);
      if (!linked) { ing.linkedRecipeId = null; ing.fdcId = -2; continue; }
      const sum = zeroNutrition();
      for (const li of linked.ingredients) for (const k of NUTRIENT_KEYS) sum[k] += (li[k] || 0);
      for (const k of NUTRIENT_KEYS) ing[k] = Math.round(sum[k] * 100) / 100;
    }
  }

  return { bySlug, stats };
}

// Topological order so embedded recipes come before their dependents.
function topoOrder(bySlug) {
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  const visit = (slug) => {
    if (visited.has(slug)) return;
    if (visiting.has(slug)) return; // cycle guard
    visiting.add(slug);
    const r = bySlug.get(slug);
    if (r) {
      for (const ing of r.ingredients) {
        if (ing.embedded && ing.linkedRecipeId && bySlug.has(ing.linkedRecipeId)) {
          visit(ing.linkedRecipeId);
        }
      }
      ordered.push(r);
      visited.add(slug);
    }
    visiting.delete(slug);
  };
  for (const slug of bySlug.keys()) visit(slug);
  return ordered;
}

function stripInternal(recipe) {
  // remove converter-only fields before serialization
  const { _tagNames, _author, ...rest } = recipe;
  void _tagNames; void _author;
  return rest;
}

function nativeCompleteBundle(bySlug, categories, recipeCategories) {
  return {
    format: 'dietledger.recipe-bundle',
    version: 1,
    exportedAt: new Date().toISOString(),
    source: { app: 'DietLedger', version: 'seed-recipes' },
    recipes: topoOrder(bySlug).map((recipe) => ({
      bundleRecipeId: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      servingName: recipe.servingName,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      instructions: recipe.instructions,
      ingredientGroups: recipe.ingredientGroups.map((group) => ({ bundleGroupId: group.id, title: group.title })),
      ingredients: recipe.ingredients.map((ingredient, index) => ({
        bundleIngredientId: `${recipe.id}-i${index}`,
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        description: ingredient.description,
        bundleGroupId: ingredient.groupId,
        prepInstructions: ingredient.prepInstructions || [],
        source: ingredient.linkedRecipeId
          ? { type: 'recipe', bundleRecipeId: ingredient.linkedRecipeId }
          : { type: 'manual' },
        nutrients: Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, ingredient[key] || 0])),
      })),
    })),
    books: [], chapters: [], chapterRecipes: [], chapterPages: [], bookPages: [],
    categories: categories.map((category) => ({ bundleCategoryId: category.id, name: category.name })),
    recipeCategories: recipeCategories.map((link) => ({
      bundleRecipeId: link.recipeId, bundleCategoryId: link.categoryId,
    })),
    templates: [], foodItems: [], customFoods: [],
  };
}

(async () => {
  const completeOnly = process.argv.includes('--complete-only');
  console.log(`Converting ${recipeFiles(completeOnly).length} recipes...`);
  console.log(`Food matching: ${MATCH_ENABLED ? 'ENABLED (' + API_URL + ')' : 'DISABLED (set SEED_API_URL + SEED_API_TOKEN to enable)'}`);
  const { bySlug, stats } = await buildRecipes(completeOnly);
  process.stdout.write('\n');

  const recipes = topoOrder(bySlug).map(stripInternal);

  // Categories: all tags + "Author: X", deduped, flat.
  const catMap = new Map();
  const recipeCategories = [];
  for (const r of bySlug.values()) {
    const cats = [];
    for (const t of r._tagNames) {
      const id = `cat:${t.toLowerCase()}`;
      if (!catMap.has(id)) catMap.set(id, { id, name: t, parentId: null });
      cats.push(id);
    }
    if (r._author) {
      const id = `cat:author:${r._author.toLowerCase()}`;
      const name = `Author: ${r._author}`;
      if (!catMap.has(id)) catMap.set(id, { id, name, parentId: null });
      cats.push(id);
    }
    for (const cid of cats) recipeCategories.push({ id: `rc:${r.id}:${cid}`, recipeId: r.id, categoryId: cid });
  }

  const manifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      recipes,
      books: [],
      chapters: [],
      chapterRecipes: [],
      chapterPages: [],
      bookPages: [],
      categories: [...catMap.values()],
      recipeCategories,
      mealPlans: [],
      nutritionProfiles: [],
      templates: [],
      customFoods: [],
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (completeOnly) {
    const nativePath = path.join(OUT_DIR, 'complete-recipes.dietledger-bundle.json');
    fs.writeFileSync(nativePath, JSON.stringify(nativeCompleteBundle(bySlug, manifest.data.categories, recipeCategories), null, 2));
    console.log(`\nRecipes: ${bySlug.size}`);
    console.log(`Wrote ${path.relative(process.cwd(), nativePath)}`);
    return;
  }

  const jsonPath = path.join(OUT_DIR, 'seed-recipes.json');
  fs.writeFileSync(jsonPath, JSON.stringify(manifest, null, 2));

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  const zipPath = path.join(OUT_DIR, 'seed-recipes.zip');
  zip.writeZip(zipPath);

  // Publish the all-recipes bundle where the setup wizard can fetch it.
  const publicDemoDir = path.join(__dirname, '..', 'public', 'demo');
  try {
    fs.mkdirSync(publicDemoDir, { recursive: true });
    zip.writeZip(path.join(publicDemoDir, 'demo-cookbook.zip'));
  } catch (e) {
    console.warn(`  ! could not publish to public/demo: ${e.message}`);
  }

  console.log(`\nRecipes:    ${recipes.length}`);
  console.log(`Categories: ${manifest.data.categories.length} (${recipeCategories.length} links)`);
  console.log(`Ingredients matched to a food: ${stats.matched}`);
  console.log(`Ingredients unmatched (zero nutrition): ${stats.unmatched}`);
  console.log(`Embedded sub-recipes: ${stats.embedded}`);
  console.log(`\nWrote ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Wrote ${path.relative(process.cwd(), zipPath)}`);
  if (!MATCH_ENABLED) {
    console.log('\nNOTE: nutrition is zero because food matching was disabled.');
    console.log('      Re-run with SEED_API_URL + SEED_API_TOKEN (and a seeded DB) to populate nutrition.');
  }
})();

import { generateUUID } from '@/lib/utils';
import type { IngredientGroup } from '@/lib/api-client';
import { emptyNutrition, type FDAFood, type InstructionStep, type NutrientKeys } from '@/lib/recipe-types';

export interface ImportIngredientDraft {
  id: string;
  originalText: string;
  name: string;
  amount: number;
  unit: string;
  groupId: string | null;
  prepInstructions: string[];
  matchedFood: FDAFood | null;
}

export interface ImportRecipeSnapshot {
  title: string;
  servings: number;
  servingName: string;
  prepTime: string;
  cookTime: string;
  ingredientGroups: IngredientGroup[];
  ingredients: ImportIngredientDraft[];
  instructionSteps: InstructionStep[];
  sourceFileName: string;
}

export interface ImportRecipeDraft extends ImportRecipeSnapshot {
  id: string;
  original: ImportRecipeSnapshot;
}

type ParsedQuantity = { amount: number; unit: string; rest: string };

const SUPPORTED_UNITS = new Set([
  'g', 'gram', 'grams',
  'kg', 'kilogram', 'kilograms',
  'ml', 'milliliter', 'milliliters',
  'l', 'liter', 'liters',
  'cup', 'cups',
  'tbsp', 'tablespoon', 'tablespoons',
  'tsp', 'teaspoon', 'teaspoons',
  'lb', 'lbs', 'pound', 'pounds',
  'oz', 'ounce', 'ounces',
]);

const COUNT_UNITS = new Set([
  'clove', 'cloves', 'egg', 'eggs', 'stick', 'sticks', 'slice', 'slices',
  'can', 'cans', 'jar', 'jars', 'bunch', 'bunches', 'head', 'heads',
]);

const METRIC_PAREN_RE = /\((?:[^)]*?)(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(g|grams?|kg|kilograms?|ml|milliliters?|l|liters?)(?:[^)]*?)\)/i;
const QUANTITY_RE = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)(?:\s+|-)?([a-zA-Z]+)?\b\s*(.*)$/;

export function parseSeedRecipeMarkdown(markdown: string, sourceFileName = 'recipe.md'): ImportRecipeDraft {
  const { frontMatter, body } = splitFrontMatter(markdown);
  const title = parseTitle(frontMatter, body, sourceFileName);
  const prepTime = parseMetadataTime(body, /prep\s*time\s*:\s*([^\n]+)/i);
  const cookTime = parseMetadataTime(body, /cook\s*time\s*:\s*([^\n]+)/i);
  const servings = parseServings(body);
  const ingredientSection = getMarkdownSection(body, 'Ingredients');
  const directionSection = getMarkdownSection(body, 'Directions') || getMarkdownSection(body, 'Instructions');
  const { ingredients, ingredientGroups } = parseIngredients(ingredientSection);
  const instructionSteps = parseDirections(directionSection);

  const snapshot: ImportRecipeSnapshot = {
    title,
    servings,
    servingName: 'servings',
    prepTime,
    cookTime,
    ingredientGroups,
    ingredients,
    instructionSteps,
    sourceFileName,
  };

  return {
    id: generateUUID(),
    ...cloneSnapshot(snapshot),
    original: cloneSnapshot(snapshot),
  };
}

export function createManualImportFood(name: string, nutrition: Partial<Record<NutrientKeys, number>>): FDAFood {
  return {
    fdcId: -2,
    description: name.trim() || 'Manual ingredient',
    brandOwner: null,
    dataType: 'Manual',
    servingSize: 100,
    servingSizeUnit: 'g',
    nutrients: {
      ...emptyNutrition(),
      ...nutrition,
    },
  };
}

export function createZeroNutritionImportFood(name: string): FDAFood {
  return {
    ...createManualImportFood(name, {}),
    fdcId: -3,
    dataType: 'No nutrition',
  };
}

export function isImportDraftReady(draft: ImportRecipeDraft): boolean {
  return draft.title.trim().length > 0;
}

export function resetImportDraft(draft: ImportRecipeDraft): ImportRecipeDraft {
  const original = cloneSnapshot(draft.original);
  return {
    id: draft.id,
    ...cloneSnapshot(original),
    original,
  };
}

export function cloneImportDraft(draft: ImportRecipeDraft): ImportRecipeDraft {
  return {
    id: draft.id,
    ...cloneSnapshot(draft),
    original: cloneSnapshot(draft.original),
  };
}

function cloneSnapshot(snapshot: ImportRecipeSnapshot): ImportRecipeSnapshot {
  return {
    title: snapshot.title,
    servings: snapshot.servings,
    servingName: snapshot.servingName,
    prepTime: snapshot.prepTime,
    cookTime: snapshot.cookTime,
    ingredientGroups: snapshot.ingredientGroups.map((group) => ({ ...group })),
    ingredients: snapshot.ingredients.map((ingredient) => ({ ...ingredient, matchedFood: ingredient.matchedFood ? cloneFood(ingredient.matchedFood) : null })),
    instructionSteps: snapshot.instructionSteps.map((step) => ({ ...step })),
    sourceFileName: snapshot.sourceFileName,
  };
}

function cloneFood(food: FDAFood): FDAFood {
  return {
    ...food,
    brandOwner: food.brandOwner ?? null,
    nutrients: { ...food.nutrients },
  };
}

function splitFrontMatter(markdown: string): { frontMatter: string; body: string } {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { frontMatter: '', body: normalized };
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return { frontMatter: '', body: normalized };
  return {
    frontMatter: normalized.slice(4, end).trim(),
    body: normalized.slice(end + 4).trimStart(),
  };
}

function parseTitle(frontMatter: string, body: string, sourceFileName: string): string {
  const frontMatterTitle = frontMatter.match(/^title\s*:\s*["']?(.+?)["']?\s*$/im)?.[1]?.trim();
  if (frontMatterTitle) return frontMatterTitle;
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return stripMarkdown(heading);
  return sourceFileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseMetadataTime(body: string, re: RegExp): string {
  return stripMarkdown(body.match(re)?.[1] ?? '').replace(/^\s+|\s+$/g, '');
}

function parseServings(body: string): number {
  const match = body.match(/servings?\s*:\s*(\d+(?:\.\d+)?)/i);
  if (!match) return 1;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : 1;
}

function getMarkdownSection(body: string, sectionName: string): string {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'im');
  return body.match(re)?.[1]?.trim() ?? '';
}

function parseIngredients(section: string): { ingredients: ImportIngredientDraft[]; ingredientGroups: IngredientGroup[] } {
  const ingredients: ImportIngredientDraft[] = [];
  const ingredientGroups: IngredientGroup[] = [];
  let currentGroupId: string | null = null;

  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const groupTitle = line.match(/^###\s+(.+)$/)?.[1]?.trim();
    if (groupTitle) {
      currentGroupId = generateUUID();
      ingredientGroups.push({ id: currentGroupId, title: stripMarkdown(groupTitle) });
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.+)$/)?.[1]?.trim();
    if (!bullet) continue;
    ingredients.push(parseIngredient(bullet, currentGroupId));
  }

  return { ingredients, ingredientGroups };
}

function parseIngredient(line: string, groupId: string | null): ImportIngredientDraft {
  const originalText = stripMarkdown(line);
  const parsed = parseIngredientQuantity(originalText);
  const { name, prepInstructions } = cleanIngredientNameAndPrep(parsed.rest || originalText);
  return {
    id: generateUUID(),
    originalText,
    name,
    amount: parsed.amount,
    unit: parsed.unit,
    groupId,
    prepInstructions,
    matchedFood: null,
  };
}

function parseIngredientQuantity(originalText: string): ParsedQuantity {
  const metricParen = originalText.match(METRIC_PAREN_RE);
  if (metricParen) {
    const amount = parseAmount(metricParen[1]);
    const unit = normalizeUnit(metricParen[2]);
    const rest = originalText
      .replace(METRIC_PAREN_RE, '')
      .replace(QUANTITY_RE, (_all, _amount, unitToken: string | undefined, after: string) => {
        if (unitToken && (SUPPORTED_UNITS.has(unitToken.toLowerCase()) || COUNT_UNITS.has(unitToken.toLowerCase()))) {
          return after;
        }
        return `${unitToken ?? ''} ${after}`.trim();
      });
    return { amount, unit, rest };
  }

  const leading = originalText.match(QUANTITY_RE);
  if (!leading) {
    return { amount: 1, unit: 'whole', rest: originalText };
  }

  const amount = parseAmount(leading[1]);
  const unitToken = leading[2]?.toLowerCase();
  const rest = leading[3] ?? '';
  if (!unitToken) return { amount, unit: 'whole', rest };

  if (SUPPORTED_UNITS.has(unitToken)) return { amount, unit: normalizeUnit(unitToken), rest };
  if (COUNT_UNITS.has(unitToken)) return { amount, unit: 'whole', rest: rest.replace(/^of\s+/i, '') || singularize(unitToken) };
  return { amount, unit: 'whole', rest: `${unitToken} ${rest}`.trim() };
}

function parseAmount(raw: string): number {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const rangeParts = normalized.split(/\s*-\s*/);
  if (rangeParts.length === 2) {
    const first = parseAmount(rangeParts[0]);
    const second = parseAmount(rangeParts[1]);
    return roundAmount((first + second) / 2);
  }
  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return roundAmount(Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]));
  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  if (fraction) return roundAmount(Number(fraction[1]) / Number(fraction[2]));
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? roundAmount(parsed) : 1;
}

function roundAmount(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'gram' || u === 'grams') return 'g';
  if (u === 'kilogram' || u === 'kilograms') return 'kg';
  if (u === 'milliliter' || u === 'milliliters') return 'ml';
  if (u === 'liter' || u === 'liters') return 'l';
  if (u === 'cups') return 'cup';
  if (u === 'tablespoon' || u === 'tablespoons') return 'tbsp';
  if (u === 'teaspoon' || u === 'teaspoons') return 'tsp';
  if (u === 'pound' || u === 'pounds' || u === 'lbs') return 'lb';
  if (u === 'ounce' || u === 'ounces') return 'oz';
  return u;
}

function cleanIngredientNameAndPrep(value: string): { name: string; prepInstructions: string[] } {
  const cleaned = value
    .replace(METRIC_PAREN_RE, '')
    .replace(/\((?:\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(?:cup|cups|tbsp|tablespoons?|tsp|teaspoons?|whole|servings?)?\)/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^of\s+/i, '')
    .trim();
  const [name, ...prepParts] = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
  return {
    name: name || cleaned,
    prepInstructions: prepParts,
  };
}

function singularize(word: string): string {
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

function parseDirections(section: string): InstructionStep[] {
  const steps: InstructionStep[] = [];
  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const numbered = line.match(/^\d+[.)]\s+(.+)$/)?.[1];
    const bullet = line.match(/^[-*+]\s+(.+)$/)?.[1];
    const text = numbered ?? bullet;
    if (text) steps.push({ id: generateUUID(), text: stripMarkdown(text), groupId: null });
  }
  return steps;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

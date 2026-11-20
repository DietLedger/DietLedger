'use client';

import React from 'react';
import type { TemplateRecord, TemplateSection } from '@/lib/types';
import { recipeNutrition, recipeMissingNutrients } from '@/lib/recipe-types';
import { CustomNutritionNotice } from '@/components/recipe/custom-nutrition-editor';
import NutritionLabel, { type NutritionData } from '@/components/nutrition-label';

interface Ingredient {
  missingNutrients?: string[];
  id: string;
  name: string;
  amount: number;
  unit: string;
  description: string;
  groupId: string | null;
}

interface IngredientGroup {
  id: string;
  title: string;
}

interface InstructionStep {
  id: string;
  text: string;
  groupId: string | null;
}

interface InstructionGroup {
  id: string;
  title: string;
}

export interface RecipeData {
  description?: string;
  customNutrition?: import('@/lib/types').CustomRecipeNutrition | null;
  name: string;
  servings: number;
  servingName: string;
  ingredients: Ingredient[];
  ingredientGroups: IngredientGroup[];
  instructionSteps: InstructionStep[];
  instructionGroups: InstructionGroup[];
}

const BUILT_IN_DEFAULT: TemplateRecord = {
  id: '__built-in__',
  name: 'Default',
  type: 'recipe',
  isDefault: true,
  createdAt: '',
  updatedAt: '',
  layout: {
    pageSize: 'card',
    orientation: 'portrait',
    margins: { top: 16, right: 16, bottom: 16, left: 16 },
    sections: [
      { id: 's0', type: 'title', visible: true, order: 0, column: 1, style: { fontSize: 22, fontWeight: '700', textAlign: 'center' } },
      { id: 's1', type: 'servings-info', visible: true, order: 1, column: 1, style: { fontSize: 12, textAlign: 'center' } },
      { id: 's2', type: 'ingredients', visible: true, order: 2, column: 1, style: { fontSize: 13 } },
      { id: 's3', type: 'instructions', visible: true, order: 3, column: 2, style: { fontSize: 13, showStepNumbers: true } },
      { id: 's4', type: 'nutrition-label', visible: true, order: 4, column: 1, style: {} },
    ],
    theme: {
      primaryColor: '#059669',
      backgroundColor: '#ffffff',
      textColor: '#1c1917',
      accentColor: '#059669',
      fontFamily: 'inherit',
      borderRadius: 8,
    },
  },
};

function resolveTemplate(template: TemplateRecord | null | undefined): TemplateRecord {
  return template || BUILT_IN_DEFAULT;
}

function sortedVisibleSections(template: TemplateRecord): TemplateSection[] {
  return template.layout.sections
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);
}

interface RecipeRendererProps {
  recipe: RecipeData;
  template?: TemplateRecord | null;
  nutritionData?: NutritionData;
}

export default function RecipeRenderer({ recipe, template, nutritionData: suppliedNutritionData }: RecipeRendererProps) {
  const nutritionData = recipe.customNutrition ? {
    servings: recipe.servings,
    ...recipeNutrition({ customNutrition: recipe.customNutrition }, 1 / (recipe.servings || 1)),
    missingNutrients: recipe.customNutrition.missingNutrients,
    customNutrition: recipe.customNutrition,
  } : suppliedNutritionData ? { ...suppliedNutritionData, missingNutrients: [...new Set([...(suppliedNutritionData.missingNutrients ?? []), ...recipeMissingNutrients(recipe)])] } : undefined;
  const resolved = resolveTemplate(template);
  const { theme, margins, pageSize } = resolved.layout;
  const sections = sortedVisibleSections(resolved);

  const hasCol1 = sections.some((s) => s.column === 1);
  const hasCol2 = sections.some((s) => s.column === 2);
  const useColumns = hasCol1 && hasCol2;

  const containerStyle: React.CSSProperties = {
    backgroundColor: theme.backgroundColor,
    color: theme.textColor,
    fontFamily: theme.fontFamily === 'inherit' ? undefined : theme.fontFamily,
    padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`,
    borderRadius: pageSize === 'card' ? theme.borderRadius : 0,
    overflow: 'hidden',
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
  };

  const renderSection = (section: TemplateSection) => {
    const sectionStyle: React.CSSProperties = {
      fontSize: section.style.fontSize,
      fontWeight: section.style.fontWeight as React.CSSProperties['fontWeight'],
      textAlign: section.style.textAlign,
      color: section.style.color,
    };

    switch (section.type) {
      case 'title':
        return (
          <div key={section.id} style={sectionStyle}>
            <h1 style={{ margin: 0, color: section.style.color || theme.primaryColor }}>
              {recipe.name || 'Untitled Recipe'}
            </h1>
            {recipe.description && <p style={{ fontSize: 13, fontWeight: 400, whiteSpace: 'pre-wrap' }}>{recipe.description}</p>}
          </div>
        );

      case 'servings-info':
        return (
          <div key={section.id} style={{ ...sectionStyle, color: section.style.color || theme.textColor, opacity: 0.7 }}>
            {recipe.customNutrition ? `${recipe.servings} servings · ${recipe.servingName}` : `${recipe.servings} ${recipe.servingName || 'serving'}${recipe.servings !== 1 ? 's' : ''}`}
          </div>
        );

      case 'ingredients':
        return <IngredientsSection key={section.id} recipe={recipe} section={section} theme={theme} />;

      case 'instructions':
        return <InstructionsSection key={section.id} recipe={recipe} section={section} theme={theme} />;

      case 'nutrition-label':
        if (!nutritionData) return null;
        return (
          <div key={section.id} style={{ marginTop: 12 }}>
            <NutritionLabel
              data={nutritionData}
              servingDescription={recipe.customNutrition ? recipe.servingName : `${recipe.servings} ${recipe.servingName || 'serving'}${recipe.servings !== 1 ? 's' : ''}`}
              servingsPerContainer={recipe.customNutrition ? recipe.servings : 1}
            />
          </div>
        );

      case 'nutrition-summary':
        if (!nutritionData) return null;
        return (
          <div key={section.id} style={{ ...sectionStyle, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Cal: {Math.round(nutritionData.calories)}</span>
            <span>Fat: {Math.round(nutritionData.totalFat)}g</span>
            <span>Carbs: {Math.round(nutritionData.totalCarbs)}g</span>
            <span>Protein: {Math.round(nutritionData.protein)}g</span>
          </div>
        );

      case 'divider':
        return (
          <div key={section.id} style={{ borderBottom: `1px solid ${theme.primaryColor}33`, margin: '8px 0' }} />
        );

      case 'column-divider':
        return null;

      case 'notes':
        return null;

      case 'image':
        return null;

      default:
        return null;
    }
  };

  if (useColumns) {
    const col1 = sections.filter((s) => s.column === 1 && s.type !== 'column-divider');
    const col2 = sections.filter((s) => s.column === 2 && s.type !== 'column-divider');
    const hasColumnDivider = sections.some((s) => s.type === 'column-divider');
    const dividerStyle: React.CSSProperties = hasColumnDivider
      ? { borderRight: `2px solid ${theme.primaryColor}44`, paddingRight: 16, marginRight: 16 }
      : {};
    return (
      <div style={containerStyle}>
        {!sections.some(section => section.type === 'nutrition-label') && <CustomNutritionNotice nutrition={recipe.customNutrition} />}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          <div style={dividerStyle}>{col1.map(renderSection)}</div>
          <div style={{ paddingLeft: hasColumnDivider ? 16 : 0 }}>{col2.map(renderSection)}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {!sections.some(section => section.type === 'nutrition-label') && <CustomNutritionNotice nutrition={recipe.customNutrition} />}
      {sections.map(renderSection)}
    </div>
  );
}

function IngredientsSection({
  recipe,
  section,
  theme,
}: {
  recipe: RecipeData;
  section: TemplateSection;
  theme: TemplateRecord['layout']['theme'];
}) {
  const style: React.CSSProperties = {
    fontSize: section.style.fontSize,
    fontWeight: section.style.fontWeight as React.CSSProperties['fontWeight'],
    color: section.style.color,
  };

  const grouped = new Map<string, Ingredient[]>();
  const ungrouped: Ingredient[] = [];

  for (const ing of recipe.ingredients) {
    if (ing.groupId) {
      const list = grouped.get(ing.groupId) || [];
      list.push(ing);
      grouped.set(ing.groupId, list);
    } else {
      ungrouped.push(ing);
    }
  }

  return (
    <div style={style}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: 'inherit', fontWeight: 600, color: theme.primaryColor }}>
        Ingredients
      </h3>
      {recipe.ingredientGroups.map((group) => {
        const items = grouped.get(group.id);
        if (!items || items.length === 0) return null;
        return (
          <div key={group.id} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontStyle: 'italic', marginBottom: 2, fontSize: '0.95em' }}>
              {group.title}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {items.map((ing) => (
                <li key={ing.id}>{formatIngredient(ing)}</li>
              ))}
            </ul>
          </div>
        );
      })}
      {ungrouped.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {ungrouped.map((ing) => (
            <li key={ing.id}>{formatIngredient(ing)}</li>
          ))}
        </ul>
      )}
      {recipe.ingredients.length === 0 && (
        <div style={{ opacity: 0.5, fontStyle: 'italic' }}>No ingredients added</div>
      )}
    </div>
  );
}

function InstructionsSection({
  recipe,
  section,
  theme,
}: {
  recipe: RecipeData;
  section: TemplateSection;
  theme: TemplateRecord['layout']['theme'];
}) {
  const style: React.CSSProperties = {
    fontSize: section.style.fontSize,
    fontWeight: section.style.fontWeight as React.CSSProperties['fontWeight'],
    color: section.style.color,
  };
  const showNumbers = section.style.showStepNumbers !== false;

  const grouped = new Map<string, InstructionStep[]>();
  const ungrouped: InstructionStep[] = [];

  for (const step of recipe.instructionSteps) {
    if (step.groupId) {
      const list = grouped.get(step.groupId) || [];
      list.push(step);
      grouped.set(step.groupId, list);
    } else {
      ungrouped.push(step);
    }
  }

  let globalIdx = 0;

  return (
    <div style={style}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: 'inherit', fontWeight: 600, color: theme.primaryColor }}>
        Instructions
      </h3>
      {recipe.instructionGroups.map((group) => {
        const steps = grouped.get(group.id);
        if (!steps || steps.length === 0) return null;
        return (
          <div key={group.id} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontStyle: 'italic', marginBottom: 2, fontSize: '0.95em' }}>
              {group.title}
            </div>
            <ol style={{ margin: 0, paddingLeft: showNumbers ? 18 : 0, listStyle: showNumbers ? 'decimal' : 'none' }}>
              {steps.map((step) => {
                const idx = globalIdx++;
                return <li key={step.id} value={showNumbers ? idx + 1 : undefined}>{step.text}</li>;
              })}
            </ol>
          </div>
        );
      })}
      {ungrouped.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: showNumbers ? 18 : 0, listStyle: showNumbers ? 'decimal' : 'none' }}>
          {ungrouped.map((step) => {
            const idx = globalIdx++;
            return <li key={step.id} value={showNumbers ? idx + 1 : undefined}>{step.text}</li>;
          })}
        </ol>
      )}
      {recipe.instructionSteps.length === 0 && (
        <div style={{ opacity: 0.5, fontStyle: 'italic' }}>No instructions added</div>
      )}
    </div>
  );
}

function formatIngredient(ing: Ingredient): string {
  const parts: string[] = [];
  if (ing.amount > 0) parts.push(ing.amount.toString());
  if (ing.unit) parts.push(ing.unit);
  parts.push(ing.description || ing.name);
  return parts.join(' ');
}

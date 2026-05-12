'use client';

import React, { useMemo } from 'react';
import type { TemplateRecord } from '@/lib/types';
import RecipeRenderer, { type RecipeData } from '@/components/recipe-renderer';
import BookRenderer, { type BookChapterData } from '@/components/book-renderer';
import { type NutritionData } from '@/components/nutrition-label';

const SAMPLE_RECIPE: RecipeData = {
  name: 'Sample Recipe',
  servings: 4,
  servingName: 'serving',
  ingredients: [
    { id: '1', name: 'Flour', amount: 2, unit: 'cups', description: 'All-purpose flour', groupId: null },
    { id: '2', name: 'Sugar', amount: 1, unit: 'cup', description: 'Granulated sugar', groupId: null },
    { id: '3', name: 'Eggs', amount: 3, unit: 'whole', description: 'Large eggs', groupId: null },
    { id: '4', name: 'Butter', amount: 0.5, unit: 'cup', description: 'Unsalted butter, melted', groupId: null },
  ],
  ingredientGroups: [],
  instructionSteps: [
    { id: 's1', text: 'Preheat oven to 350°F (175°C).', groupId: null },
    { id: 's2', text: 'Mix dry ingredients in a large bowl.', groupId: null },
    { id: 's3', text: 'Add wet ingredients and stir until smooth.', groupId: null },
    { id: 's4', text: 'Pour into greased pan and bake for 30 minutes.', groupId: null },
  ],
  instructionGroups: [],
};

const SAMPLE_NUTRITION: NutritionData = {
  servings: 4,
  calories: 280,
  totalFat: 12,
  saturatedFat: 7,
  transFat: 0,
  cholesterol: 85,
  sodium: 180,
  totalCarbs: 38,
  dietaryFiber: 1,
  totalSugars: 22,
  addedSugars: 18,
  protein: 5,
  vitaminD: 1.2,
  calcium: 45,
  iron: 1.8,
  potassium: 120,
};

const SAMPLE_CHAPTERS: BookChapterData[] = [
  {
    title: 'Chapter 1: Getting Started',
    items: [
      {
        type: 'page',
        data: {
          title: 'Introduction',
          content: 'Welcome to this sample book chapter. This demonstrates how page content renders within a template layout. You can customize the appearance using the template editor.',
        },
      },
    ],
  },
];

interface TemplatePreviewProps {
  template: TemplateRecord;
  recipe?: RecipeData;
  nutritionData?: NutritionData;
  chapters?: BookChapterData[];
  pageTemplate?: TemplateRecord | null;
}

const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  card: { width: 320, height: 440 },
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
  custom: { width: 612, height: 792 },
};

export default function TemplatePreview({
  template,
  recipe,
  nutritionData,
  chapters,
  pageTemplate,
}: TemplatePreviewProps) {
  const containerSize = useMemo(() => {
    const dims = PAGE_SIZES[template.layout.pageSize] || PAGE_SIZES.card;
    if (template.layout.orientation === 'landscape') {
      return { width: dims.height, height: dims.width };
    }
    return dims;
  }, [template.layout.pageSize, template.layout.orientation]);

  const previewWidth = 380;
  const scale = previewWidth / containerSize.width;
  const previewHeight = containerSize.height * scale;

  return (
    <div
      style={{
        width: previewWidth,
        height: previewHeight,
        overflow: 'hidden',
        border: '1px solid #d6d3d1',
        borderRadius: 6,
        backgroundColor: '#f5f5f4',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: containerSize.width,
          height: containerSize.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {template.type === 'recipe' || template.type === 'book-recipe' ? (
          <RecipeRenderer
            recipe={recipe || SAMPLE_RECIPE}
            template={template}
            nutritionData={nutritionData ?? SAMPLE_NUTRITION}
          />
        ) : (
          <BookRenderer
            chapters={chapters || SAMPLE_CHAPTERS}
            pageTemplate={pageTemplate || template}
            recipeTemplate={template.type === 'book-page' ? undefined : template}
          />
        )}
      </div>
    </div>
  );
}

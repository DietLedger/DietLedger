'use client';

import React from 'react';
import type { TemplateRecord, TemplateSection } from '@/lib/types';
import RecipeRenderer, { type RecipeData } from '@/components/recipe-renderer';
import NutritionLabel, { type NutritionData } from '@/components/nutrition-label';

interface PageContentData {
  title: string;
  content: string;
}

interface RecipeItemData {
  recipe: RecipeData;
  nutritionData?: NutritionData;
}

export interface BookChapterData {
  title: string;
  pageTemplateId?: string;
  recipeTemplateId?: string;
  items: Array<
    | { type: 'page'; data: PageContentData }
    | { type: 'recipe'; data: RecipeItemData }
  >;
}

interface BookRendererProps {
  chapters: BookChapterData[];
  pageTemplate?: TemplateRecord | null;
  recipeTemplate?: TemplateRecord | null;
  templateLookup?: Map<string, TemplateRecord>;
  startingPageNumber?: number;
}

const BUILT_IN_PAGE_TEMPLATE: TemplateRecord = {
  id: '__built-in-page__',
  name: 'Default Page',
  type: 'book-page',
  isDefault: true,
  createdAt: '',
  updatedAt: '',
  layout: {
    pageSize: 'a4',
    orientation: 'portrait',
    margins: { top: 40, right: 40, bottom: 40, left: 40 },
    sections: [
      { id: 'ps0', type: 'chapter-title', visible: true, order: 0, column: 1, style: { fontSize: 24, fontWeight: '700', textAlign: 'center' } },
      { id: 'ps1', type: 'page-content', visible: true, order: 1, column: 1, style: { fontSize: 14 } },
      { id: 'ps2', type: 'page-number', visible: true, order: 2, column: 1, style: { fontSize: 10, textAlign: 'center' } },
    ],
    theme: {
      primaryColor: '#1e293b',
      backgroundColor: '#ffffff',
      textColor: '#1c1917',
      accentColor: '#059669',
      fontFamily: 'inherit',
      borderRadius: 0,
    },
  },
};

export default function BookRenderer({
  chapters,
  pageTemplate,
  recipeTemplate,
  templateLookup,
  startingPageNumber = 1,
}: BookRendererProps) {
  const resolvedPageTemplate = pageTemplate || BUILT_IN_PAGE_TEMPLATE;
  const resolvedRecipeTemplate = recipeTemplate || undefined;
  let pageNum = startingPageNumber;

  const rendered: React.ReactNode[] = [];

  for (const chapter of chapters) {
    const chapterPageTemplate = (chapter.pageTemplateId && templateLookup?.get(chapter.pageTemplateId)) || resolvedPageTemplate;
    const chapterRecipeTemplate = (chapter.recipeTemplateId && templateLookup?.get(chapter.recipeTemplateId)) || resolvedRecipeTemplate;

    for (const item of chapter.items) {
      if (item.type === 'page') {
        rendered.push(
          <PageRenderer
            key={`page-${pageNum}`}
            chapterTitle={chapter.title}
            pageData={item.data}
            template={chapterPageTemplate}
            pageNumber={pageNum}
          />
        );
      } else {
        rendered.push(
          <div key={`recipe-${pageNum}`} style={{ marginBottom: 16 }}>
            <RecipeRenderer
              recipe={item.data.recipe}
              template={chapterRecipeTemplate}
              nutritionData={item.data.nutritionData}
            />
          </div>
        );
      }
      pageNum++;
    }
  }

  return <div>{rendered}</div>;
}

function PageRenderer({
  chapterTitle,
  pageData,
  template,
  pageNumber,
}: {
  chapterTitle: string;
  pageData: PageContentData;
  template: TemplateRecord;
  pageNumber: number;
}) {
  const { theme, margins, pageSize } = template.layout;
  const sections = template.layout.sections
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

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

  return (
    <div style={containerStyle}>
      {sections.map((section) => renderPageSection(section, chapterTitle, pageData, pageNumber, theme))}
    </div>
  );
}

function renderPageSection(
  section: TemplateSection,
  chapterTitle: string,
  pageData: PageContentData,
  pageNumber: number,
  theme: TemplateRecord['layout']['theme'],
): React.ReactNode {
  const style: React.CSSProperties = {
    fontSize: section.style.fontSize,
    fontWeight: section.style.fontWeight as React.CSSProperties['fontWeight'],
    textAlign: section.style.textAlign,
    color: section.style.color,
  };

  switch (section.type) {
    case 'chapter-title':
      return (
        <div key={section.id} style={{ ...style, marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: style.color || theme.primaryColor }}>
            {pageData.title || chapterTitle}
          </h2>
        </div>
      );

    case 'page-content':
      return (
        <div key={section.id} style={style}>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {pageData.content || 'No content'}
          </div>
        </div>
      );

    case 'page-number':
      return (
        <div key={section.id} style={{ ...style, marginTop: 16, opacity: 0.5 }}>
          {pageNumber}
        </div>
      );

    case 'divider':
      return (
        <div key={section.id} style={{ borderBottom: `1px solid ${theme.primaryColor}33`, margin: '8px 0' }} />
      );

    default:
      return null;
  }
}

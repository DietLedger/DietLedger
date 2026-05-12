'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useBreadcrumbLabels } from '@/components/breadcrumb-context';

const PATH_LABELS: Record<string, string> = {
  recipes: 'Recipes',
  books: 'Books',
  'meal-plans': 'Meal Plans',
  edit: 'Edit',
};

export default function AppBreadcrumbs() {
  const pathname = usePathname();
  const { dynamicLabels } = useBreadcrumbLabels();

  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs: Array<{ label: string; href: string; isCurrent: boolean }> = [];
  let pathAccum = '';

  for (let i = 0; i < segments.length; i++) {
    pathAccum += '/' + segments[i];
    const seg = segments[i];
    const isCurrent = i === segments.length - 1;

    const label =
      dynamicLabels[pathAccum] ??
      PATH_LABELS[seg] ??
      seg;

    crumbs.push({ label, href: pathAccum, isCurrent });
  }

  if (crumbs.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => (
            <React.Fragment key={crumb.href}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {crumb.isCurrent ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

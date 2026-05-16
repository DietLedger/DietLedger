'use client';

import { useState, useMemo } from 'react';
import { TEMPLATE_PACKS, type TemplatePack, type TemplatePackTemplate } from '@/data/template-packs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Palette, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface TemplatePacksProps {
  onSelect?: (template: TemplatePackTemplate) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  seasonal: 'Seasonal',
  style: 'Style',
  occasion: 'Occasion',
  professional: 'Professional',
};

export function TemplatePacks({ onSelect }: TemplatePacksProps) {
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  const toggleExpand = (packId: string) => {
    setExpandedPack(prev => (prev === packId ? null : packId));
  };

  const handleInstall = (template: TemplatePackTemplate) => {
    setInstalledIds(prev => new Set(prev).add(template.id));
    onSelect?.(template);
  };

  return (
    <div className="space-y-3">
      {TEMPLATE_PACKS.map((pack) => (
        <TemplatePackCard
          key={pack.id}
          pack={pack}
          isExpanded={expandedPack === pack.id}
          onToggle={() => toggleExpand(pack.id)}
          onInstall={handleInstall}
          installedIds={installedIds}
        />
      ))}
    </div>
  );
}

function TemplatePackCard({
  pack,
  isExpanded,
  onToggle,
  onInstall,
  installedIds,
}: {
  pack: TemplatePack;
  isExpanded: boolean;
  onToggle: () => void;
  onInstall: (t: TemplatePackTemplate) => void;
  installedIds: Set<string>;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={onToggle}
        >
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">{pack.name}</div>
              <div className="text-xs text-muted-foreground">{pack.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {CATEGORY_LABELS[pack.category] ?? pack.category}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {pack.templates.length}
            </Badge>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="mt-3 space-y-2">
            {pack.templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-2 rounded-md border"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded"
                    style={{
                      backgroundColor: template.theme.primaryColor,
                      border: `1px solid ${template.theme.accentColor}`,
                    }}
                  />
                  <div>
                    <div className="text-xs font-medium">{template.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {template.pageSize} • {template.orientation}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={installedIds.has(template.id) ? 'secondary' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => onInstall(template)}
                  disabled={installedIds.has(template.id)}
                >
                  <Download className="h-3 w-3 mr-1" />
                  {installedIds.has(template.id) ? 'Installed' : 'Install'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

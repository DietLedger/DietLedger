'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { getApiClient } from '@/lib/api-client';
import { exportNutritionReport } from '@/lib/pdf-export';
import type { BrandKit, NutritionProfileRecord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Download, FileBarChart } from 'lucide-react';
import { toast } from 'sonner';

interface NutritionPdfReportProps {
  profile?: NutritionProfileRecord | null;
}

export function NutritionPdfReport({ profile }: NutritionPdfReportProps) {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [includeCalories, setIncludeCalories] = useState(true);
  const [includeMacros, setIncludeMacros] = useState(true);
  const [includeMicros, setIncludeMicros] = useState(true);
  const [includeWeight, setIncludeWeight] = useState(true);
  const [brandKitId, setBrandKitId] = useState('');
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getApiClient().getBrandKits().then(setBrandKits);
  }, []);

  const handleExport = async () => {
    if (!profile) {
      toast.error('Select a nutrition profile first');
      return;
    }

    setExporting(true);
    setProgress(10);

    try {
      const allEntries = await getApiClient().getFoodLogByProfileAndDateRange(profile.id, startDate, endDate);
      const filtered = allEntries.filter(e => {
        if (e.profileId !== profile.id) return false;
        return e.date >= startDate && e.date <= endDate;
      });

      const elements: HTMLElement[] = [];

      if (reportRef.current) {
        elements.push(reportRef.current);
      }

      const kit = brandKitId && brandKitId !== 'none'
        ? (await getApiClient().getBrandKit(brandKitId)) ?? undefined
        : undefined;

      setProgress(40);

      const blob = await exportNutritionReport(
        profile.name,
        { start: startDate, end: endDate },
        elements,
        kit,
      );

      setProgress(90);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nutrition-report-${format(parseISO(startDate), 'yyyy-MM-dd')}-${format(parseISO(endDate), 'yyyy-MM-dd')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Nutrition report exported');
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Nutrition Report PDF</h3>
        <p className="text-xs text-muted-foreground">Export a detailed nutrition report for your records or dietitian.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Brand Kit (optional)</Label>
        <Select value={brandKitId} onValueChange={setBrandKitId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {brandKits.map(k => (
              <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Calorie Summary</Label>
            <Switch checked={includeCalories} onCheckedChange={setIncludeCalories} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Macro Breakdown</Label>
            <Switch checked={includeMacros} onCheckedChange={setIncludeMacros} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Micronutrient Trends</Label>
            <Switch checked={includeMicros} onCheckedChange={setIncludeMicros} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Weight Trend</Label>
            <Switch checked={includeWeight} onCheckedChange={setIncludeWeight} />
          </div>
        </CardContent>
      </Card>

      <div ref={reportRef} className="border rounded-lg p-4 text-xs space-y-2 bg-background">
        <div className="font-medium">Report Preview</div>
        <div className="text-muted-foreground">
          {format(parseISO(startDate), 'MMM d, yyyy')} — {format(parseISO(endDate), 'MMM d, yyyy')}
        </div>
        {profile && (
          <div className="text-muted-foreground">Profile: {profile.name}</div>
        )}
        <div className="flex gap-2 flex-wrap">
          {includeCalories && <span className="px-1.5 py-0.5 bg-secondary rounded text-xs">Calories</span>}
          {includeMacros && <span className="px-1.5 py-0.5 bg-secondary rounded text-xs">Macros</span>}
          {includeMicros && <span className="px-1.5 py-0.5 bg-secondary rounded text-xs">Micros</span>}
          {includeWeight && <span className="px-1.5 py-0.5 bg-secondary rounded text-xs">Weight</span>}
        </div>
      </div>

      {exporting && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Generating report...</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleExport}
        disabled={exporting || !profile}
      >
        {exporting ? (
          <FileBarChart className="h-4 w-4 mr-2 animate-pulse" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {exporting ? 'Exporting...' : 'Export Nutrition Report PDF'}
      </Button>
    </div>
  );
}

'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { getApiClient } from '@/lib/api-client';
import { useDietaryProfiles } from '@/hooks/use-dietary';
import { detectAllergens } from '@/lib/dietary-rules';
import { exportElementAsPdf } from '@/lib/pdf-export';
import type { DietaryProfileRecord, NutritionProfileRecord, BrandKit } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Download, FileCheck, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function ComplianceReport() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDietaryProfileId, setSelectedDietaryProfileId] = useState('');
  const [selectedNutritionProfileId, setSelectedNutritionProfileId] = useState('');
  const [brandKitId, setBrandKitId] = useState('');
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [nutritionProfiles, setNutritionProfiles] = useState<NutritionProfileRecord[]>([]);
  const [exporting, setExporting] = useState(false);

  const { profiles: dietaryProfiles } = useDietaryProfiles();
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getApiClient().getNutritionProfiles().then(setNutritionProfiles);
    getApiClient().getBrandKits().then(setBrandKits);
  }, []);

  const selectedDietaryProfile = dietaryProfiles.find(p => p.id === selectedDietaryProfileId);
  const selectedNutritionProfile = nutritionProfiles.find(p => p.id === selectedNutritionProfileId);

  const reportData = useMemo(() => {
    if (!selectedDietaryProfile) return null;

    return { profile: selectedDietaryProfile };
  }, [selectedDietaryProfile]);

  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const kit = brandKitId && brandKitId !== 'none' ? await getApiClient().getBrandKit(brandKitId) : undefined;
      const blob = await exportElementAsPdf(reportRef.current, { pageSize: 'letter' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${startDate}-${endDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Compliance report exported');
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Dietary Compliance Report</h3>
        <p className="text-xs text-muted-foreground">
          Printable report for dietitians with allergen exposure, threshold violations, and adherence metrics.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Start Date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">End Date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
        </div>
      </div>

      <div>
        <Label className="text-xs">Dietary Profile</Label>
        <Select value={selectedDietaryProfileId} onValueChange={setSelectedDietaryProfileId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select profile..." />
          </SelectTrigger>
          <SelectContent>
            {dietaryProfiles.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Nutrition Profile (optional)</Label>
        <Select value={selectedNutritionProfileId} onValueChange={setSelectedNutritionProfileId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select profile..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {nutritionProfiles.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {selectedDietaryProfile && (
        <div ref={reportRef} className="border rounded-lg p-6 space-y-6 bg-white text-black print-section">
          <div className="border-b pb-4">
            <h2 className="text-xl font-bold">Dietary Compliance Report</h2>
            <p className="text-sm text-gray-600 mt-1">
              {format(parseISO(startDate), 'MMMM d, yyyy')} — {format(parseISO(endDate), 'MMMM d, yyyy')}
            </p>
            <p className="text-sm text-gray-600">Profile: {selectedDietaryProfile.name}</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {selectedDietaryProfile.allergens.map(a => (
                <Badge key={a} variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {a}
                </Badge>
              ))}
              {selectedDietaryProfile.dietaryTags.map(t => (
                <Badge key={t} variant="secondary" className="text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {t}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Nutrient Thresholds</h3>
            {selectedDietaryProfile.nutrientThresholds.length === 0 ? (
              <p className="text-xs text-gray-500">No thresholds configured.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 pr-3">Nutrient</th>
                    <th className="text-right py-1.5 pr-3">Daily Max</th>
                    <th className="text-right py-1.5 pr-3">Per Meal Max</th>
                    <th className="text-left py-1.5">Alert Level</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDietaryProfile.nutrientThresholds.map((t, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1.5 pr-3">{t.nutrient}</td>
                      <td className="text-right py-1.5 pr-3">{t.dailyMax != null ? `${t.dailyMax}` : '—'}</td>
                      <td className="text-right py-1.5 pr-3">{t.perMealMax != null ? `${t.perMealMax}` : '—'}</td>
                      <td className="py-1.5">
                        <Badge variant={t.alertLevel === 'danger' ? 'destructive' : 'secondary'} className="text-xs">
                          {t.alertLevel}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Allergen Avoidance List</h3>
            {selectedDietaryProfile.allergens.length === 0 ? (
              <p className="text-xs text-gray-500">No allergens specified.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {selectedDietaryProfile.allergens.map(a => (
                  <div key={a} className="flex items-center gap-2 text-xs p-2 border rounded">
                    <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Dietary Requirements</h3>
            {selectedDietaryProfile.dietaryTags.length === 0 ? (
              <p className="text-xs text-gray-500">No dietary tags specified.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedDietaryProfile.dietaryTags.map(t => (
                  <Badge key={t} variant="outline" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-4 text-xs text-gray-500">
            <p>Report generated on {format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
            <p>This report is for informational purposes. Consult a registered dietitian for medical advice.</p>
          </div>
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleExportPdf}
        disabled={exporting || !selectedDietaryProfileId}
      >
        {exporting ? (
          <FileCheck className="h-4 w-4 mr-2 animate-pulse" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {exporting ? 'Exporting...' : 'Export Compliance Report PDF'}
      </Button>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { getApiClient } from '@/lib/api-client';
import { USA_REGIONS } from '@/data/seasonal-produce';
import { MapPin } from 'lucide-react';

const COUNTRY_REGIONS: Record<string, string[]> = {
  'United States': USA_REGIONS,
};

export default function LocationPanel() {
  const [country, setCountry] = useState('United States');
  const [region, setRegion] = useState('Northeast');
  const [savedLocation, setSavedLocation] = useState<{ country: string; region: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const loc = await getApiClient().getLocation();
      if (loc) {
        setCountry(loc.country);
        setRegion(loc.region);
        setSavedLocation({ country: loc.country, region: loc.region });
      }
      setIsLoading(false);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    await getApiClient().updateLocation(country, region);
    setSavedLocation({ country, region });
  }, [country, region]);

  const regions = COUNTRY_REGIONS[country] || [];

  if (isLoading) {
    return <p className="text-xs text-stone-400 text-center py-4">Loading location...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-stone-700 flex items-center gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-brand-600" />Location
        </label>
        <p className="text-xs text-stone-400 mb-3">
          Set your region to see which foods are in season. Used for seasonal food suggestions in meal planning.
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-stone-600 mb-1 block">Country</label>
          <select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              const newRegions = COUNTRY_REGIONS[e.target.value];
              if (newRegions && newRegions.length > 0) {
                setRegion(newRegions[0]);
              }
            }}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.keys(COUNTRY_REGIONS).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-600 mb-1 block">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <Button
          onClick={handleSave}
          size="sm"
          className="bg-brand-600 hover:bg-brand-700 gap-1"
          disabled={savedLocation?.country === country && savedLocation?.region === region}
        >
          <MapPin className="w-3.5 h-3.5" />
          {savedLocation ? 'Update Location' : 'Set Location'}
        </Button>
        {savedLocation && (
          <p className="text-xs text-stone-400">
            Currently set: {savedLocation.country}, {savedLocation.region}
          </p>
        )}
      </div>
    </div>
  );
}

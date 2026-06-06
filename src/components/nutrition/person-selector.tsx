'use client';

import { useNutritionProfiles } from '@/hooks/use-nutrition';
import { useNutritionSelection } from '@/lib/nutrition-selection';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { User } from 'lucide-react';

export function PersonSelector() {
  const { profiles, activeProfileId } = useNutritionProfiles();
  const { setActiveProfileId } = useNutritionSelection();

  if (profiles.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <User className="h-4 w-4" />
        <span>No profiles yet</span>
        <Button variant="link" size="sm" asChild>
          <Link href="/nutrition/profiles">Create one</Link>
        </Button>
      </div>
    );
  }

  return (
    <Select value={activeProfileId ?? ''} onValueChange={setActiveProfileId}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select person" />
      </SelectTrigger>
      <SelectContent>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

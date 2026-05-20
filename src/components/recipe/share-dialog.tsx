'use client';

import { useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Copy, Eye, Download, Share2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { detectAllergens } from '@/lib/dietary-rules';

interface ShareableRecipe {
  id: string;
  name: string;
  ingredients: Array<{ name: string }>;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: ShareableRecipe;
}

export function ShareDialog({ open, onOpenChange, recipe }: ShareDialogProps) {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [importCount, setImportCount] = useState(0);

  const shareUrl = shareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareToken}` : '';

  const handleShare = useCallback(async () => {
    setCreating(true);
    try {
      const recipeData = JSON.stringify(recipe);
      const detections = detectAllergens(recipe.ingredients);

      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: recipe.id,
          title: recipe.name,
          description: '',
          category: '',
          tags: detections.map((d) => d.allergen).join(','),
          recipeData,
          isPublic,
        }),
      });

      if (!res.ok) throw new Error('Failed to create share');
      const data = await res.json();
      setShareToken(data.shareToken);
      setViewCount(0);
      setImportCount(0);
      toast.success('Share link created');
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setCreating(false);
    }
  }, [recipe, isPublic]);

  const copyLink = useCallback(() => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard');
    }
  }, [shareUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Recipe
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm font-medium">{recipe.name}</p>

          {!shareToken && (
            <>
              <div className="flex items-center gap-2">
                <Switch
                  id="public-toggle"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
                <Label htmlFor="public-toggle">Public (visible in community)</Label>
              </div>

              <Button className="w-full" onClick={handleShare} disabled={creating}>
                {creating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><Share2 className="h-4 w-4 mr-2" />Create Share Link</>
                )}
              </Button>
            </>
          )}

          {shareToken && (
            <>
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <QRCodeSVG value={shareUrl} size={180} />
              </div>

              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />{viewCount} views
                </span>
                <span className="flex items-center gap-1">
                  <Download className="h-3.5 w-3.5" />{importCount} imports
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
                <Label>Public in community gallery</Label>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

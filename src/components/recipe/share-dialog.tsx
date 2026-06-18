'use client';

import { useState, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Copy, Eye, Download, Share2, Loader2, Lock, Users, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { detectAllergens } from '@/lib/dietary-rules';
import { getApiClient } from '@/lib/api-client';
import type { ShareVisibility } from '@/lib/types';

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
  const [shareId, setShareId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ShareVisibility>('public');
  const [creating, setCreating] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [importCount, setImportCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const shareUrl = shareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareToken}` : '';

  const handleShare = useCallback(async () => {
    setCreating(true);
    try {
      const recipeData = JSON.stringify(recipe);
      const detections = detectAllergens(recipe.ingredients);

      const data = await getApiClient().createShare({
        recipeId: recipe.id,
        title: recipe.name,
        description: '',
        category: '',
        tags: detections.map((d) => d.allergen).join(','),
        recipeData,
        visibility,
      });

      setShareToken(data.shareToken);
      setShareId(data.id);
      setViewCount(0);
      setImportCount(0);
      toast.success('Share link created');
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setCreating(false);
    }
  }, [recipe, visibility]);

  const copyLink = useCallback(() => {
    if (!shareUrl) return;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(shareUrl).then(
        () => toast.success('Link copied to clipboard'),
        () => toast.error('Failed to copy link')
      );
      return;
    }

    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
      try {
        document.execCommand('copy');
        toast.success('Link copied to clipboard');
        return;
      } catch {}
    }
    toast.error('Failed to copy link');
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
              <div className="space-y-2">
                <Label className="text-sm font-medium">Who can view this recipe?</Label>
                {([
                  { value: 'public' as const, icon: Globe, label: 'Public', desc: 'Anyone with the link + community gallery' },
                  { value: 'users' as const, icon: Users, label: 'DietLedger users', desc: 'Any logged-in user with the link' },
                  { value: 'private' as const, icon: Lock, label: 'Private', desc: 'Only you can open this link' },
                ]).map(({ value, icon: Icon, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVisibility(value)}
                    className={`flex items-start gap-3 w-full rounded-lg border p-3 text-left transition-colors ${
                      visibility === value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">{desc}</div>
                    </div>
                  </button>
                ))}
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
                <Input ref={inputRef} value={shareUrl} readOnly className="text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copyLink}>
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

              <div className="space-y-2">
                <Label className="text-sm font-medium">Who can view this recipe?</Label>
                {([
                  { value: 'public' as const, icon: Globe, label: 'Public' },
                  { value: 'users' as const, icon: Users, label: 'DietLedger users' },
                  { value: 'private' as const, icon: Lock, label: 'Private' },
                ]).map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      const prev = visibility;
                      setVisibility(value);
                      if (shareId) {
                        getApiClient().updateShareVisibility(shareId, value).catch(() => {
                          setVisibility(prev);
                          toast.error('Failed to update visibility');
                        });
                      }
                    }}
                    className={`flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-sm transition-colors ${
                      visibility === value
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

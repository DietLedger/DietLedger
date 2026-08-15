'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface ConfirmWithPasswordDialogProps {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Returns {ok} on success (dialog closes) or {error} (stays open with message). */
  action: (password: string) => Promise<{ ok: boolean; error?: string }>;
}

// AlertDialog wrapper that requires the admin's password before running a
// destructive action. Uses a plain confirm Button (not AlertDialogAction) so
// the dialog only closes on actual success, and ignores close attempts while busy.
export function ConfirmWithPasswordDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  action,
}: ConfirmWithPasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await action(password);
      if (res.ok) {
        setOpen(false);
        setPassword('');
      } else {
        setError(res.error || 'Action failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (busy && !o) return; // don't close mid-action
        setOpen(o);
        if (!o) {
          setPassword('');
          setError('');
        }
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="confirm-pw" className="text-xs">Admin password</Label>
          <Input
            id="confirm-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            autoFocus
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            onClick={submit}
            disabled={busy || !password}
            className={
              destructive
                ? 'bg-destructive text-white hover:bg-destructive/90'
                : 'bg-brand-600 hover:bg-brand-700'
            }
          >
            {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

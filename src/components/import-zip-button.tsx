'use client';

import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';

interface ImportZipButtonProps {
  onFile: (file: File) => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
  className?: string;
  children?: ReactNode;
}

// A button that triggers a hidden .zip file input. Used by the books and
// recipes pages (and reusable by the demo-cookbook installer later).
export function ImportZipButton({
  onFile,
  busy,
  disabled,
  label = 'Import',
  variant = 'outline',
  size = 'sm',
  className,
  children,
}: ImportZipButtonProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={busy || disabled}
        onClick={() => ref.current?.click()}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {children ?? (busy ? 'Importing...' : label)}
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

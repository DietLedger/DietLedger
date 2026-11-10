'use client';

import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';

interface ImportZipButtonProps {
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  accept?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
  className?: string;
  children?: ReactNode;
  multiple?: boolean;
}

// A button that triggers a hidden import file input. The name is legacy from
// the former zip importer; callers can set accept for bundle formats.
export function ImportZipButton({
  onFile,
  onFiles,
  busy,
  disabled,
  label = 'Import',
  accept = '.json,application/json',
  variant = 'outline',
  size = 'sm',
  className,
  children,
  multiple,
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
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) {
            if (onFiles) onFiles(files);
            else if (onFile) onFile(files[0]);
          }
          e.target.value = '';
        }}
      />
    </>
  );
}

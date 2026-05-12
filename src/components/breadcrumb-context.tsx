'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface DynamicLabels {
  [path: string]: string;
}

interface BreadcrumbContextValue {
  dynamicLabels: DynamicLabels;
  setDynamicLabel: (path: string, label: string) => void;
  clearDynamicLabel: (path: string) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [dynamicLabels, setDynamicLabels] = useState<DynamicLabels>({});

  const setDynamicLabel = useCallback((path: string, label: string) => {
    setDynamicLabels((prev) => ({ ...prev, [path]: label }));
  }, []);

  const clearDynamicLabel = useCallback((path: string) => {
    setDynamicLabels((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ dynamicLabels, setDynamicLabel, clearDynamicLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbLabels() {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) throw new Error('useBreadcrumbLabels must be used within BreadcrumbProvider');
  return ctx;
}

export function useSetBreadcrumbLabel(path: string, label: string | undefined) {
  const { setDynamicLabel, clearDynamicLabel } = useBreadcrumbLabels();
  useEffect(() => {
    if (label !== undefined) {
      setDynamicLabel(path, label);
    } else {
      clearDynamicLabel(path);
    }
  }, [path, label, setDynamicLabel, clearDynamicLabel]);
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { THEMES, DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/themes';

function applyCssVars(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

function clearThemeOverrides(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const key of Object.keys(vars)) {
    root.style.removeProperty(key);
  }
}

export function useAppTheme() {
  const [themeId, setThemeId] = useState<string>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && THEMES.find((t) => t.id === stored)) {
      setThemeId(stored);
    }
    setMounted(true);
  }, []);

  const applyTheme = useCallback((id: string) => {
    const definition = THEMES.find((t) => t.id === id);
    if (!definition) return;

    const isDark = document.documentElement.classList.contains('dark');
    const vars = isDark ? definition.dark : definition.light;

    clearThemeOverrides(definition.light);
    clearThemeOverrides(definition.dark);
    applyCssVars(vars);

    if (id !== DEFAULT_THEME) {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(THEME_STORAGE_KEY);
    }
    setThemeId(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(themeId);
  }, [resolvedTheme, mounted, applyTheme, themeId]);

  const currentTheme = THEMES.find((t) => t.id === themeId) || THEMES[0];

  return {
    themeId,
    currentTheme,
    setTheme: applyTheme,
    themes: THEMES,
    mounted,
  };
}

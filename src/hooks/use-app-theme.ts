'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { getAccessToken, sessionGeneration } from '@/lib/auth-session';
import { useAppSettings } from '@/hooks/use-settings';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { THEMES, DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/themes';

export type AppearanceMode = 'light' | 'dark';
export const APPEARANCE_STORAGE_KEY = 'dietledger-appearance-mode';
const THEME_CHANGED = 'dietledger:theme-changed';
const APPEARANCE_CHANGED = 'dietledger:appearance-changed';


type ChoiceKey = 'theme' | 'appearanceMode';
type WriteOwner = { session: SettingsSession | null };
type PendingChoice = { value: string; owner: WriteOwner; onSaved: () => void };
type SettingsSession = {
  userId: string;
  generation: number;
  owners: Set<WriteOwner>;
  writes: Promise<void>;
  pending: Partial<Record<ChoiceKey, PendingChoice>>;
};

// Share ordering only within a live login. Tokens stay private in memory, never
// in query keys or logs. A retired/stalled session cannot block the next login.
let settingsSession: SettingsSession | null = null;

function currentSession(owner: WriteOwner): SettingsSession | null {
  const session = owner.session;
  return session && session === settingsSession && session.generation === sessionGeneration()
    ? session : null;
}

function saveChoice(owner: WriteOwner, key: ChoiceKey, value: string, onSaved: () => void) {
  const session = currentSession(owner);
  if (!session) return;
  const pending = session.pending[key];
  if (pending?.value === value) {
    // The latest selector owns this intent if an earlier selector unmounts.
    pending.owner = owner;
    pending.onSaved = onSaved;
    return;
  }
  const choice = { value, owner, onSaved };
  session.pending[key] = choice;
  session.writes = session.writes.then(async () => {
    try {
      // The API reads the token at dispatch, not when this choice was queued.
      if (currentSession(choice.owner) !== session) return;
      await getApiClient().updateSettings({ [key]: value });
      if (currentSession(choice.owner) === session) choice.onSaved();
    } catch {
      // A failed write must not block subsequent selections or an explicit retry.
    } finally {
      if (session.pending[key] === choice) delete session.pending[key];
    }
  });
}

function validTheme(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((theme) => theme.id === id);
}

function validAppearance(mode: unknown): mode is AppearanceMode {
  return mode === 'light' || mode === 'dark';
}

export function useAppTheme() {
  const [themeId, setThemeId] = useState<string>(DEFAULT_THEME);
  const [appearance, setAppearanceState] = useState<AppearanceMode>('dark');
  const [mounted, setMounted] = useState(false);
  const [themeChosen, setThemeChosen] = useState(false);
  const [appearanceChosen, setAppearanceChosen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const userId = isAuthenticated ? user?.id : undefined;
  const token = getAccessToken();
  const generation = sessionGeneration();
  const owner = useRef<WriteOwner>({ session: null });
  const { data: settings } = useAppSettings({ enabled: isAuthenticated });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !token) {
      settingsSession = null;
      return;
    }
    if (settingsSession?.userId !== userId || settingsSession.generation !== generation) {
      settingsSession = { userId, generation, owners: new Set(), writes: Promise.resolve(), pending: {} };
    }
    const session = settingsSession;
    owner.current.session = session;
    session.owners.add(owner.current);
    return () => {
      owner.current.session = null;
      session.owners.delete(owner.current);
      for (const key of Object.keys(session.pending) as ChoiceKey[]) {
        if (session.pending[key]?.owner === owner.current) delete session.pending[key];
      }
      if (!session.owners.size && settingsSession === session) settingsSession = null;
    };
  }, [owner, userId, generation, !!token]);

  useEffect(() => {
    const syncLocalChoice = () => {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      const storedAppearance = localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (validTheme(storedTheme)) setThemeId(storedTheme);
      if (validAppearance(storedAppearance)) setAppearanceState(storedAppearance);
    };
    syncLocalChoice();
    setMounted(true);
    window.addEventListener(THEME_CHANGED, syncLocalChoice);
    window.addEventListener(APPEARANCE_CHANGED, syncLocalChoice);
    window.addEventListener('storage', syncLocalChoice);
    return () => {
      window.removeEventListener(THEME_CHANGED, syncLocalChoice);
      window.removeEventListener(APPEARANCE_CHANGED, syncLocalChoice);
      window.removeEventListener('storage', syncLocalChoice);
    };
  }, []);

  useEffect(() => {
    if (themeChosen || validTheme(localStorage.getItem(THEME_STORAGE_KEY))) return;
    // A server-only Vintage Teal value is ambiguous: older versions wrote it
    // automatically. Legacy light/dark values are appearance modes, not palettes.
    if (settings?.theme !== 'vintage-teal' && validTheme(settings?.theme)) {
      setThemeId(settings.theme);
    }
  }, [settings?.theme, themeChosen]);

  useEffect(() => {
    if (appearanceChosen || validAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY))) return;
    const serverMode = validAppearance(settings?.appearanceMode)
      ? settings.appearanceMode
      : validAppearance(settings?.savedTheme) ? settings.savedTheme : undefined;
    if (serverMode) setAppearanceState(serverMode);
  }, [settings?.appearanceMode, settings?.savedTheme, appearanceChosen]);

  const isDark = appearance === 'dark';

  useEffect(() => {
    if (!mounted) return;
    const definition = THEMES.find((theme) => theme.id === themeId);
    if (!definition) return;
    const root = document.documentElement;
    const vars = isDark ? definition.dark : definition.light;
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
    root.dataset.appTheme = themeId;
    root.dataset.appAppearance = isDark ? 'dark' : 'light';
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }, [mounted, isDark, themeId]);

  const setTheme = useCallback((id: string) => {
    if (!validTheme(id)) return;
    setThemeChosen(true);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    setThemeId(id);
    window.dispatchEvent(new Event(THEME_CHANGED));
    // Only explicit palette changes write the palette key.
    saveChoice(owner.current, 'theme', id, () => { void queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }); });
  }, [owner, queryClient]);

  const setAppearance = useCallback((mode: AppearanceMode) => {
    if (!validAppearance(mode)) return;
    setAppearanceChosen(true);
    localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
    setAppearanceState(mode);
    window.dispatchEvent(new Event(APPEARANCE_CHANGED));
    // Keep the user's selected mode independent of the legacy palette/onboarding key.
    saveChoice(owner.current, 'appearanceMode', mode, () => { void queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }); });
  }, [owner, queryClient]);

  const currentTheme = THEMES.find((theme) => theme.id === themeId) || THEMES.find((theme) => theme.id === DEFAULT_THEME)!;
  return { themeId, currentTheme, setTheme, themes: THEMES, mounted, appearance, setAppearance, isDark };
}

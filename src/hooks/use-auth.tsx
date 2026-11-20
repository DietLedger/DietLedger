'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { authenticatedPrincipalID, retireSession, sessionGeneration, setAccessToken } from '@/lib/auth-session';
import { retireLegacyBrowserCache } from '@/lib/legacy-browser-cleanup';

interface AuthUser { id: string; email: string; displayName: string; isAdmin?: boolean }
interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, setupClaim?: string) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

async function retireBrowserState(): Promise<boolean> {
  const { reloadRequired } = await retireLegacyBrowserCache();
  if (reloadRequired) {
    window.alert('Browser privacy cleanup requires a reload. Close or reload all DietLedger tabs before signing in to another account.');
  }
  return !reloadRequired;
}

function notifyOtherTabs(channel: BroadcastChannel | null) {
  // Reuse this provider's receiver as the sender: BroadcastChannel excludes
  // only the sending object, not other channel objects in the same tab.
  channel?.postMessage('session-changed');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const broadcastChannel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    let active = true;
    // Delete only the previous application's credential keys; never ingest them.
    for (const key of ['dietledger_access_token', 'dietledger_refresh_token', 'dietledger_user']) localStorage.removeItem(key);
    const generation = sessionGeneration();
    getApiClient().refreshToken().then((result) => {
      if (active && generation === sessionGeneration()) { setAccessToken(result.accessToken, result.user.id); setUser(result.user); }
    }).catch(() => {}).finally(() => { if (active) setIsLoading(false); });
    const handleUnauthorized = () => { retireSession(); queryClient.clear(); setUser(null); void retireBrowserState(); };
    window.addEventListener('dietledger:unauthorized', handleUnauthorized);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('dietledger-auth-events');
    broadcastChannel.current = channel;
    if (channel) channel.onmessage = (event) => { if (event.data === 'session-changed') handleUnauthorized(); };
    return () => {
      active = false;
      if (broadcastChannel.current === channel) broadcastChannel.current = null;
      channel?.close();
      window.removeEventListener('dietledger:unauthorized', handleUnauthorized);
    };
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    if (!await retireBrowserState()) throw new Error('Reload all DietLedger tabs before signing in.');
    retireSession();
    queryClient.clear();
    const generation = sessionGeneration();
    const result = await getApiClient().login(email, password);
    if (generation !== sessionGeneration()) throw new Error('Session changed');
    setAccessToken(result.accessToken, result.user.id);
    setUser(result.user);
    notifyOtherTabs(broadcastChannel.current);
  }, [queryClient]);
  const register = useCallback(async (email: string, password: string, displayName: string, setupClaim?: string) => {
    if (!await retireBrowserState()) throw new Error('Reload all DietLedger tabs before creating an account.');
    retireSession();
    queryClient.clear();
    const generation = sessionGeneration();
    const result = await getApiClient().register(email, password, displayName, setupClaim);
    if (generation !== sessionGeneration()) throw new Error('Session changed');
    setAccessToken(result.accessToken, result.user.id);
    setUser(result.user);
    notifyOtherTabs(broadcastChannel.current);
  }, [queryClient]);
  const logout = useCallback(async () => {
    const principalID = user?.id ?? authenticatedPrincipalID();
    retireSession();
    try { await getApiClient().logout(principalID); }
    finally { queryClient.clear(); setUser(null); notifyOtherTabs(broadcastChannel.current); await retireBrowserState(); }
  }, [queryClient, user?.id]);

  return <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

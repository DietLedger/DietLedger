'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiClient } from '@/lib/api-client';

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'dietledger_access_token';
const REFRESH_KEY = 'dietledger_refresh_token';
const USER_KEY = 'dietledger_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
    }
    setIsLoading(false);

    const handleUnauthorized = () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
    };
    window.addEventListener('dietledger:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('dietledger:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const client = getApiClient();
    const result = await client.login(email, password);
    const authUser: AuthUser = result.user;
    localStorage.setItem(TOKEN_KEY, result.accessToken);
    localStorage.setItem(REFRESH_KEY, result.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const client = getApiClient();
    const result = await client.register(email, password, displayName);
    const authUser: AuthUser = result.user;
    localStorage.setItem(TOKEN_KEY, result.accessToken);
    localStorage.setItem(REFRESH_KEY, result.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const isLocalOnly =
    typeof window !== 'undefined' &&
    (process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY === 'true' ||
      process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY === '1');

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: isLocalOnly || !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

'use client';

import React, { useEffect } from 'react';
import { useSyncStore } from '@/lib/sync-store';

export default function SyncInitializer({ children }: { children: React.ReactNode }) {
  const { loadServers, syncAll } = useSyncStore();

  useEffect(() => {
    loadServers();

    const onlineHandler = () => {
      setTimeout(() => syncAll(), 1000);
    };

    const visibilityHandler = () => {
      if (!document.hidden) {
        syncAll();
      }
    };

    window.addEventListener('online', onlineHandler);
    document.addEventListener('visibilitychange', visibilityHandler);

    const timer = setInterval(() => {
      syncAll();
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', onlineHandler);
      document.removeEventListener('visibilitychange', visibilityHandler);
      clearInterval(timer);
    };
  }, [loadServers, syncAll]);

  return <>{children}</>;
}

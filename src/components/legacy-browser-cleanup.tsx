'use client';

import { useEffect, useState } from 'react';
import { retireLegacyBrowserCache } from '@/lib/legacy-browser-cleanup';

export function LegacyBrowserCleanup() {
  const [reloadRequired, setReloadRequired] = useState(false);
  useEffect(() => {
    let mounted = true;
    void retireLegacyBrowserCache().then(result => {
      if (mounted) setReloadRequired(result.reloadRequired);
    });
    return () => { mounted = false; };
  }, []);
  return reloadRequired ? (
    <div role="alert" className="border border-destructive bg-background p-3 text-sm text-foreground">
      Legacy offline storage could not be fully retired. Reconnect, then close all DietLedger tabs and reopen before switching accounts. Old tabs may still show cached private data while offline.
    </div>
  ) : null;
}

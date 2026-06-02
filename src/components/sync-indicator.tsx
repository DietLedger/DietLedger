'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { writeQueue } from '@/lib/write-queue';

type SyncState = 'idle' | 'pending' | 'failed';

export default function SyncIndicator() {
  const [state, setState] = useState<SyncState>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsubscribe = writeQueue.onStatusChange((status) => {
      const total = status.pending;
      const hasFailed = status.failed > 0;

      if (hasFailed) {
        setState('failed');
        setPendingCount(status.failed);
      } else if (total > 0) {
        setState('pending');
        setPendingCount(total);
      } else {
        setState('idle');
        setPendingCount(0);
      }
    });

    writeQueue.getStatus().then((status) => {
      if (status.failed > 0) {
        setState('failed');
        setPendingCount(status.failed);
      } else if (status.pending > 0) {
        setState('pending');
        setPendingCount(status.pending);
      }
    });

    return unsubscribe;
  }, []);

  const handleRetry = useCallback(async () => {
    await writeQueue.drain();
  }, []);

  if (state === 'idle') {
    return (
      <span title="All changes synced" className="inline-flex items-center text-emerald-500">
        <CheckCircle2 className="w-4 h-4" />
      </span>
    );
  }

  if (state === 'pending') {
    return (
      <span title={`${pendingCount} change${pendingCount !== 1 ? 's' : ''} pending`} className="inline-flex items-center text-amber-500 gap-1">
        <Loader2 className="w-4 h-4 animate-spin" />
        {pendingCount > 0 && (
          <span className="text-xs font-medium">{pendingCount}</span>
        )}
      </span>
    );
  }

  return (
    <button
      onClick={handleRetry}
      title={`${pendingCount} write${pendingCount !== 1 ? 's' : ''} failed — click to retry`}
      className="inline-flex items-center text-red-500 hover:text-red-400 transition-colors gap-1"
    >
      <AlertCircle className="w-4 h-4" />
      {pendingCount > 0 && (
        <span className="text-xs font-medium">{pendingCount}</span>
      )}
    </button>
  );
}

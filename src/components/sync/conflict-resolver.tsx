'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SyncConflictRecord } from '@/lib/types';

interface ConflictResolverProps {
  serverUrl: string;
  apiKey: string;
}

export default function ConflictResolver({ serverUrl, apiKey }: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [mergeText, setMergeText] = useState('');

  const fetchConflicts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/sync/conflicts`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setConflicts(Array.isArray(data) ? data : data.conflicts || []);
    } catch (err) {
      console.error('Failed to fetch conflicts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl, apiKey]);

  useEffect(() => { fetchConflicts(); }, [fetchConflicts]);

  const pendingConflicts = conflicts.filter((c) => c.status === 'pending');
  const count = pendingConflicts.length;

  const resolveConflict = async (
    id: string,
    resolution: 'local' | 'remote' | 'merge',
    conflict: SyncConflictRecord,
    data?: string
  ) => {
    setResolvingId(id);
    try {
      let body: { resolution: string; data?: string };
      if (resolution === 'local') {
        body = { resolution: 'local', data: conflict.localData };
      } else if (resolution === 'remote') {
        body = { resolution: 'remote', data: conflict.remoteData };
      } else {
        body = { resolution: 'merge', data: data || '' };
      }
      const res = await fetch(`${serverUrl}/api/sync/conflicts/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setConflicts((prev) => prev.filter((c) => c.id !== id));
      setMergeId(null);
    } catch (err) {
      console.error('Failed to resolve conflict:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const resolveAll = async (resolution: 'local' | 'remote') => {
    for (const conflict of pendingConflicts) {
      await resolveConflict(conflict.id, resolution, conflict);
    }
  };

  const startMerge = (conflict: SyncConflictRecord) => {
    setMergeId(conflict.id);
    setMergeText(conflict.localData);
  };

  const cancelMerge = () => {
    setMergeId(null);
    setMergeText('');
  };

  const submitMerge = (conflict: SyncConflictRecord) => {
    resolveConflict(conflict.id, 'merge', conflict, mergeText);
  };

  function DiffView({ localData, remoteData }: { localData: string; remoteData: string }) {
    let local: Record<string, unknown>;
    let remote: Record<string, unknown>;
    try { local = JSON.parse(localData); } catch { local = {}; }
    try { remote = JSON.parse(remoteData); } catch { remote = {}; }

    const allKeys = Array.from(new Set([...Object.keys(local), ...Object.keys(remote)])).sort();

    return (
      <table className="w-full text-xs border-collapse mt-2">
        <thead>
          <tr className="border-b">
            <th className="text-left py-1 px-2 text-stone-500 font-medium">Field</th>
            <th className="text-left py-1 px-2 text-stone-500 font-medium">Local</th>
            <th className="text-left py-1 px-2 text-stone-500 font-medium">Remote</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => {
            const localVal = JSON.stringify(local[key] ?? '');
            const remoteVal = JSON.stringify(remote[key] ?? '');
            const differs = localVal !== remoteVal;
            return (
              <tr key={key} className={differs ? 'bg-yellow-50' : ''}>
                <td className="py-1 px-2 font-mono text-stone-600 border-b">{key}</td>
                <td className={`py-1 px-2 font-mono border-b break-all ${differs ? 'text-yellow-800' : 'text-stone-500'}`}>
                  {localVal}
                </td>
                <td className={`py-1 px-2 font-mono border-b break-all ${differs ? 'text-yellow-800' : 'text-stone-500'}`}>
                  {remoteVal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (isLoading && conflicts.length === 0) {
    return <p className="text-xs text-stone-400">Loading conflicts...</p>;
  }

  if (conflicts.length === 0) {
    return <p className="text-xs text-stone-400">No conflicts found.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-700">Conflicts</span>
          <Badge variant="secondary" className="text-xs">{count} pending</Badge>
        </div>
        {count > 1 && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => resolveAll('local')} disabled={!!resolvingId}>
              Resolve All (Keep Local)
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => resolveAll('remote')} disabled={!!resolvingId}>
              Resolve All (Keep Remote)
            </Button>
          </div>
        )}
      </div>

      {pendingConflicts.map((conflict) => (
        <div key={conflict.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">{conflict.storeName}</span>
              <span className="text-xs text-stone-400 ml-2">{conflict.recordId}</span>
            </div>
            <Badge variant="outline" className="text-xs">{conflict.status}</Badge>
          </div>

          <DiffView localData={conflict.localData} remoteData={conflict.remoteData} />

          {mergeId === conflict.id ? (
            <div className="space-y-2">
              <textarea
                className="w-full text-xs font-mono border rounded p-2 min-h-[120px]"
                value={mergeText}
                onChange={(e) => setMergeText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" className="text-xs" onClick={() => submitMerge(conflict)} disabled={resolvingId === conflict.id}>
                  {resolvingId === conflict.id ? 'Saving...' : 'Submit Merge'}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={cancelMerge}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => resolveConflict(conflict.id, 'local', conflict)}
                disabled={resolvingId === conflict.id}
              >
                Keep Local
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => resolveConflict(conflict.id, 'remote', conflict)}
                disabled={resolvingId === conflict.id}
              >
                Keep Remote
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => startMerge(conflict)}
                disabled={resolvingId === conflict.id}
              >
                Use Merged
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

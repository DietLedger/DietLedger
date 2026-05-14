'use client';

import React from 'react';
import { RefreshCw, Check, WifiOff, AlertTriangle, CloudOff } from 'lucide-react';
import { useSyncStore } from '@/lib/sync-store';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export default function SyncStatusIndicator() {
  const { servers, syncAll, syncingServerId } = useSyncStore();

  const hasError = servers.some((s) => s.lastSyncStatus === 'error');
  const hasConflict = servers.some((s) => s.lastSyncStatus === 'conflict');
  const isSyncing = syncingServerId !== null;
  const allSynced = servers.length > 0 && servers.every((s) => s.lastSyncStatus === 'success');
  const hasServers = servers.length > 0;

  if (!hasServers) return null;

  const Icon = isSyncing ? RefreshCw : hasError ? WifiOff : hasConflict ? AlertTriangle : allSynced ? Check : CloudOff;
  const color = isSyncing ? 'text-blue-500' : hasError ? 'text-red-500' : hasConflict ? 'text-amber-500' : allSynced ? 'text-emerald-500' : 'text-stone-400';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 ${color}`}>
          <Icon className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sync Status</span>
            <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={syncAll} disabled={isSyncing}>
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync All
            </Button>
          </div>
          {servers.map((server) => (
            <div key={server.id} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[140px]">{server.label}</span>
              <span className={
                server.lastSyncStatus === 'error' ? 'text-red-500' :
                server.lastSyncStatus === 'conflict' ? 'text-amber-500' :
                server.lastSyncStatus === 'success' ? 'text-emerald-500' :
                'text-stone-400'
              }>
                {syncingServerId === server.id ? 'Syncing...' :
                  server.lastSyncStatus === 'error' ? 'Error' :
                  server.lastSyncStatus === 'conflict' ? 'Conflicts' :
                  server.lastSyncStatus === 'success' ? 'Synced' :
                  'Not synced'}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import type { SyncServerConfig, SyncChangeLogEntry } from './types';
import { SYNC_STORE_NAMES } from './types';
import {
  getAllUnsyncedChanges,
  markChangesSynced,
  getAllStoreData,
  putStoreData,
  deleteStoreRecord,
  getDB,
} from './storage';
import { computeChecksum } from './sync-conflict';

export function secureUrl(url: string): string {
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return url;
    } catch {}
    throw new Error('Insecure server URL. HTTPS is required (use http://localhost or http://127.0.0.1 for local development).');
  }
  throw new Error('Invalid server URL. Must start with https:// or http://localhost.');
}

interface PushChangePayload {
  storeName: string;
  recordId: string;
  action: string;
  data: string;
  checksum: string;
  timestamp: string;
}

interface PushResponse {
  accepted: string[];
  conflicts: Array<{
    storeName: string;
    recordId: string;
    serverData: string;
    serverVersion: number;
    localData: string;
    localVersion: number;
  }>;
  serverVersion: number;
}

interface PullResponse {
  changes: Array<{
    id: string;
    storeName: string;
    recordId: string;
    action: string;
    data: string;
    version: number;
    checksum: string;
    timestamp: string;
    deviceId: string;
  }>;
  serverTimestamp: string;
}

export async function pushChanges(server: SyncServerConfig): Promise<{ pushed: number; conflicts: number }> {
  server = { ...server, serverUrl: secureUrl(server.serverUrl) };
  const changes = await getAllUnsyncedChanges();
  if (changes.length === 0) return { pushed: 0, conflicts: 0 };

  const db = await getDB();
  const payloads: PushChangePayload[] = [];

  for (const change of changes) {
    let data: string | null = change.data;

    if (change.action === 'upsert' && !data) {
      try {
        if ((SYNC_STORE_NAMES as readonly string[]).includes(change.storeName)) {
          const record = await db.get(change.storeName as never, change.recordId);
          if (record) data = JSON.stringify(record);
        }
      } catch {}
    }

    if (change.action === 'upsert' && !data) continue;

    payloads.push({
      storeName: change.storeName,
      recordId: change.recordId,
      action: change.action,
      data: data || '',
      checksum: data ? computeChecksum(data) : '',
      timestamp: change.timestamp,
    });
  }

  const batchSize = 100;
  let totalPushed = 0;
  let totalConflicts = 0;

  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize);
    const res = await fetch(`${server.serverUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${server.apiKey}`,
      },
      body: JSON.stringify({ deviceId: server.deviceId, changes: batch }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Push failed (${res.status}): ${text}`);
    }

    const response: PushResponse = await res.json();
    totalPushed += response.accepted.length;
    totalConflicts += response.conflicts.length;

    const acceptedIds: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const change = changes[i + j];
      if (response.accepted.includes(change.recordId)) {
        acceptedIds.push(change.id);
      }
    }
    if (acceptedIds.length > 0) {
      await markChangesSynced(acceptedIds);
    }
  }

  return { pushed: totalPushed, conflicts: totalConflicts };
}

export async function pullChanges(server: SyncServerConfig): Promise<{ pulled: number }> {
  server = { ...server, serverUrl: secureUrl(server.serverUrl) };
  const since = server.lastSyncedAt || '';
  const url = `${server.serverUrl}/api/sync/pull?deviceId=${server.deviceId}${since ? `&since=${encodeURIComponent(since)}` : ''}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${server.apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pull failed (${res.status}): ${text}`);
  }

  const response: PullResponse = await res.json();
  const db = await getDB();
  let pulled = 0;

  for (const change of response.changes) {
    try {
      if (change.action === 'delete') {
        if ((SYNC_STORE_NAMES as readonly string[]).includes(change.storeName)) {
          await db.delete(change.storeName as never, change.recordId);
        }
      } else if (change.data) {
        const record = JSON.parse(change.data);
        if ((SYNC_STORE_NAMES as readonly string[]).includes(change.storeName)) {
          await db.put(change.storeName as never, record);
        }
      }
      pulled++;
    } catch (err) {
      console.error(`Failed to apply change ${change.storeName}/${change.recordId}:`, err);
    }
  }

  return { pulled };
}

export async function fullDumpUpload(server: SyncServerConfig): Promise<{ synced: number }> {
  server = { ...server, serverUrl: secureUrl(server.serverUrl) };
  const data: Record<string, Array<{ recordId: string; data: string; checksum: string; timestamp: string }>> = {};

  for (const storeName of SYNC_STORE_NAMES) {
    const records = await getAllStoreData(storeName);
    if (records.length > 0) {
      data[storeName] = records.map((r: any) => ({
        recordId: r.id,
        data: JSON.stringify(r),
        checksum: computeChecksum(JSON.stringify(r)),
        timestamp: r.updatedAt || r.createdAt || new Date().toISOString(),
      }));
    }
  }

  const res = await fetch(`${server.serverUrl}/api/sync/full-dump`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${server.apiKey}`,
    },
    body: JSON.stringify({ deviceId: server.deviceId, data }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Full dump upload failed (${res.status}): ${text}`);
  }

  const response = await res.json();
  return { synced: response.recordsSynced || 0 };
}

export async function fullDumpDownload(server: SyncServerConfig): Promise<{ synced: number }> {
  server = { ...server, serverUrl: secureUrl(server.serverUrl) };
  const res = await fetch(`${server.serverUrl}/api/sync/full-dump`, {
    headers: { 'Authorization': `Bearer ${server.apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Full dump download failed (${res.status}): ${text}`);
  }

  const response = await res.json();
  let synced = 0;

  const data = response.data || {};
  for (const [storeName, records] of Object.entries(data)) {
    if (!Array.isArray(records)) continue;
    for (const rec of records as any[]) {
      if (rec.data) {
        try {
          const record = JSON.parse(rec.data);
          await putStoreData(storeName, [record]);
          synced++;
        } catch (err) {
          console.error(`Failed to apply record ${storeName}/${rec.recordId}:`, err);
        }
      }
    }
  }

  return { synced };
}

export async function syncWithServer(server: SyncServerConfig): Promise<{
  pushed: number;
  pulled: number;
  conflicts: number;
  error?: string;
}> {
  server = { ...server, serverUrl: secureUrl(server.serverUrl) };
  try {
    const { pushed, conflicts } = await pushChanges(server);
    const { pulled } = await pullChanges(server);
    return { pushed, pulled, conflicts };
  } catch (err) {
    return { pushed: 0, pulled: 0, conflicts: 0, error: String(err) };
  }
}

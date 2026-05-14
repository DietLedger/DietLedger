import { create } from 'zustand';
import type { SyncServerConfig, SyncStatus } from './types';
import {
  getAllSyncServers,
  putSyncServer,
  deleteSyncServer as dbDeleteSyncServer,
} from './storage';
import { syncWithServer, fullDumpUpload, fullDumpDownload } from './sync-engine';

interface SyncState {
  servers: SyncServerConfig[];
  isLoading: boolean;
  syncingServerId: string | null;
  error: string | null;

  loadServers: () => Promise<void>;
  addServer: (server: SyncServerConfig) => Promise<void>;
  updateServer: (server: SyncServerConfig) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  syncServer: (id: string) => Promise<void>;
  syncAll: () => Promise<void>;
  initialSync: (id: string) => Promise<void>;
}

let syncTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function notifyLocalChange() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    useSyncStore.getState().syncAll();
  }, 500);
}

export const useSyncStore = create<SyncState>((set, get) => ({
  servers: [],
  isLoading: false,
  syncingServerId: null,
  error: null,

  loadServers: async () => {
    set({ isLoading: true });
    try {
      const servers = await getAllSyncServers();
      set({ servers, isLoading: false });
      setupTimers(servers, get);
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  addServer: async (server) => {
    await putSyncServer(server);
    set((s) => ({ servers: [...s.servers, server] }));
    setupTimers(get().servers, get);
  },

  updateServer: async (server) => {
    await putSyncServer(server);
    set((s) => ({
      servers: s.servers.map((sv) => (sv.id === server.id ? server : sv)),
    }));
    setupTimers(get().servers, get);
  },

  removeServer: async (id) => {
    await dbDeleteSyncServer(id);
    set((s) => ({ servers: s.servers.filter((sv) => sv.id !== id) }));
    const timer = syncTimers.get(id);
    if (timer) {
      clearInterval(timer);
      syncTimers.delete(id);
    }
  },

  syncServer: async (id) => {
    const server = get().servers.find((s) => s.id === id);
    if (!server || !server.enabled || !server.apiKey) return;

    set({ syncingServerId: id, error: null });
    try {
      const result = await syncWithServer(server);

      const status: SyncStatus = result.error
        ? 'error'
        : result.conflicts > 0
          ? 'conflict'
          : 'success';

      await putSyncServer({
        ...server,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: status,
        lastSyncError: result.error || null,
        updatedAt: new Date().toISOString(),
      });

      set((s) => ({
        syncingServerId: null,
        servers: s.servers.map((sv) =>
          sv.id === id
            ? {
                ...sv,
                lastSyncedAt: new Date().toISOString(),
                lastSyncStatus: status,
                lastSyncError: result.error || null,
                updatedAt: new Date().toISOString(),
              }
            : sv
        ),
      }));
    } catch (e) {
      set({
        syncingServerId: null,
        error: String(e),
      });
    }
  },

  syncAll: async () => {
    const { servers, syncServer } = get();
    const enabled = servers.filter((s) => s.enabled && s.apiKey);
    await Promise.allSettled(enabled.map((s) => syncServer(s.id)));
  },

  initialSync: async (id) => {
    const server = get().servers.find((s) => s.id === id);
    if (!server || !server.apiKey) return;

    set({ syncingServerId: id, error: null });
    try {
      await fullDumpUpload(server);
      const { synced } = await fullDumpDownload(server);

      await putSyncServer({
        ...server,
        lastSyncedAt: new Date().toISOString(),
        lastSyncStatus: 'success',
        lastSyncError: null,
        updatedAt: new Date().toISOString(),
      });

      set((s) => ({
        syncingServerId: null,
        servers: s.servers.map((sv) =>
          sv.id === id
            ? {
                ...sv,
                lastSyncedAt: new Date().toISOString(),
                lastSyncStatus: 'success' as SyncStatus,
                lastSyncError: null,
                updatedAt: new Date().toISOString(),
              }
            : sv
        ),
      }));
    } catch (e) {
      set({ syncingServerId: null, error: String(e) });
    }
  },
}));

function setupTimers(servers: SyncServerConfig[], get: () => SyncState) {
  for (const [id, timer] of syncTimers) {
    clearInterval(timer);
    syncTimers.delete(id);
  }

  for (const server of servers) {
    if (!server.enabled || !server.autoSync || !server.apiKey) continue;
    if (server.syncIntervalMinutes <= 0) continue;

    const intervalMs = server.syncIntervalMinutes * 60 * 1000;
    const timer = setInterval(() => {
      get().syncServer(server.id);
    }, intervalMs);
    syncTimers.set(server.id, timer);
  }
}

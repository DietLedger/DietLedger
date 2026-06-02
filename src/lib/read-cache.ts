import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

interface CacheEntry {
  key: string;
  data: string;
  expiresAt: number;
  createdAt: number;
  sizeBytes: number;
}

interface ReadCacheDB extends DBSchema {
  readCache: {
    key: string;
    value: CacheEntry;
  };
}

const DB_NAME = 'dietledger-read-cache';
const DB_VERSION = 1;
const MAX_CACHE_BYTES = 50 * 1024 * 1024;

const DEFAULT_TTL_LIST = 5 * 60 * 1000;
const DEFAULT_TTL_ITEM = 60 * 60 * 1000;

class ReadCache {
  private db: IDBPDatabase<ReadCacheDB> | null = null;

  async init(): Promise<void> {
    this.db = await openDB<ReadCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('readCache')) {
          db.createObjectStore('readCache', { keyPath: 'key' });
        }
      },
    });
  }

  async set(key: string, data: unknown, ttlMs?: number): Promise<void> {
    if (!this.db) return;
    const serialized = JSON.stringify(data);
    const sizeBytes = new Blob([serialized]).size;
    const entry: CacheEntry = {
      key,
      data: serialized,
      expiresAt: Date.now() + (ttlMs ?? DEFAULT_TTL_LIST),
      createdAt: Date.now(),
      sizeBytes,
    };
    await this.db.put('readCache', entry);
    await this.evictIfNeeded();
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.db) return null;
    const entry = await this.db.get('readCache', key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      await this.db.delete('readCache', key);
      return null;
    }
    return JSON.parse(entry.data) as T;
  }

  async invalidate(prefix?: string): Promise<void> {
    if (!this.db) return;
    if (!prefix) {
      const tx = this.db.transaction('readCache', 'readwrite');
      await tx.store.clear();
      return;
    }
    const all = await this.db.getAll('readCache');
    const tx = this.db.transaction('readCache', 'readwrite');
    for (const entry of all) {
      if (entry.key.startsWith(prefix)) {
        await tx.store.delete(entry.key);
      }
    }
  }

  private async evictIfNeeded(): Promise<void> {
    if (!this.db) return;
    const all = await this.db.getAll('readCache');
    let totalSize = all.reduce((sum, e) => sum + e.sizeBytes, 0);
    if (totalSize <= MAX_CACHE_BYTES) return;

    const sorted = all.sort((a, b) => a.createdAt - b.createdAt);
    const tx = this.db.transaction('readCache', 'readwrite');
    for (const entry of sorted) {
      if (totalSize <= MAX_CACHE_BYTES) break;
      totalSize -= entry.sizeBytes;
      await tx.store.delete(entry.key);
    }
  }
}

export const readCache = new ReadCache();
export { DEFAULT_TTL_LIST, DEFAULT_TTL_ITEM };

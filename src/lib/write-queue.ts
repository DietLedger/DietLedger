import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

interface PendingWrite {
  id?: number;
  method: string;
  path: string;
  body: string | null;
  retries: number;
  status: 'pending' | 'in-flight' | 'failed';
  createdAt: number;
  updatedAt: number;
}

interface WriteQueueDB extends DBSchema {
  pendingWrites: {
    key: number;
    value: PendingWrite;
    autoIncrement: true;
  };
}

export type WriteQueueStatus = {
  pending: number;
  failed: number;
};

type StatusChangeCallback = (status: WriteQueueStatus) => void;

const MAX_RETRIES = 10;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 60000, 60000, 60000, 60000, 60000];
const DB_NAME = 'dietledger-write-queue';
const DB_VERSION = 1;

class WriteQueue {
  private db: IDBPDatabase<WriteQueueDB> | null = null;
  private draining = false;
  private statusListeners: Set<StatusChangeCallback> = new Set();
  private baseUrl = '';

  async init(baseUrl: string): Promise<void> {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.db = await openDB<WriteQueueDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pendingWrites')) {
          db.createObjectStore('pendingWrites', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
      },
    });
    this.notifyListeners();
    this.attachConnectivityListeners();
  }

  async enqueue(method: string, path: string, body?: unknown): Promise<void> {
    if (!this.db) return;
    await this.db.add('pendingWrites', {
      method,
      path,
      body: body ? JSON.stringify(body) : null,
      retries: 0,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    this.notifyListeners();
    if (navigator.onLine) this.scheduleDrain();
  }

  async drain(): Promise<void> {
    if (!this.db || this.draining) return;
    this.draining = true;

    try {
      let pending = await this.getPending();
      while (pending.length > 0 && navigator.onLine) {
        for (const write of pending) {
          await this.db!.put('pendingWrites', { ...write, status: 'in-flight' });
          const success = await this.sendWrite(write);
          if (success) {
            await this.db!.delete('pendingWrites', write.id!);
          } else {
            const newRetries = write.retries + 1;
            if (newRetries >= MAX_RETRIES) {
              await this.db!.put('pendingWrites', {
                ...write,
                retries: newRetries,
                status: 'failed',
                updatedAt: Date.now(),
              });
            } else {
              await this.db!.put('pendingWrites', {
                ...write,
                retries: newRetries,
                status: 'pending',
                updatedAt: Date.now(),
              });
              const delay = BACKOFF_MS[Math.min(newRetries - 1, BACKOFF_MS.length - 1)];
              await this.sleep(delay);
            }
          }
        }
        this.notifyListeners();
        pending = await this.getPending();
      }
    } finally {
      this.draining = false;
      this.notifyListeners();
    }
  }

  async getStatus(): Promise<WriteQueueStatus> {
    if (!this.db) return { pending: 0, failed: 0 };
    const all = await this.db.getAll('pendingWrites');
    return {
      pending: all.filter((w) => w.status === 'pending').length,
      failed: all.filter((w) => w.status === 'failed').length,
    };
  }

  onStatusChange(cb: StatusChangeCallback): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async clear(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction('pendingWrites', 'readwrite');
    await tx.store.clear();
    this.notifyListeners();
  }

  private async getPending(): Promise<PendingWrite[]> {
    if (!this.db) return [];
    const all = await this.db.getAll('pendingWrites');
    return all.filter((w) => w.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  }

  private async sendWrite(write: PendingWrite): Promise<boolean> {
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('dietledger_access_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${this.baseUrl}${write.path}`, {
        method: write.method,
        headers,
        body: write.body || undefined,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private scheduleDrain(): void {
    setTimeout(() => this.drain(), 100);
  }

  private notifyListeners(): void {
    if (this.statusListeners.size === 0) return;
    this.getStatus().then((status) => {
      for (const cb of this.statusListeners) cb(status);
    });
  }

  private attachConnectivityListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.drain());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const writeQueue = new WriteQueue();

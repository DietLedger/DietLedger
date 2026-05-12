# NutriLabel Sync Server — Implementation Plan

A multi-server synchronization system that keeps all NutriLabel instances in sync through a central or federated sync server architecture.

---

## Overview

### Goals

- Users can configure **multiple sync servers** (self-hosted or NutriLabel Cloud)
- Sync happens **on app open**, **at configurable intervals**, and **on database change**
- Bidirectional sync with conflict resolution
- Works with the existing IndexedDB client-side storage
- Offline-first: the app works fully offline, syncs when connectivity returns

### Sync Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Instance A │────▶│ Sync Server │◀────│  Instance B │
│  (Browser)  │◀────│  (API)      │────▶│  (Desktop)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  Instance C │
                    │   (Phone)   │
                    └─────────────┘
```

Each instance has its own local IndexedDB. The sync server holds the canonical state. Instances push local changes and pull remote changes.

---

## Data Model

### Sync Server Schema (New Prisma Models)

```prisma
model SyncUser {
  id           String        @id @default(cuid())
  email        String?       @unique
  displayName  String?
  passwordHash String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  devices      SyncDevice[]
  syncRecords  SyncRecord[]
}

model SyncDevice {
  id           String    @id @default(cuid())
  userId       String
  deviceName   String
  deviceType   String    // "browser" | "desktop" | "mobile"
  lastSyncedAt DateTime?
  createdAt    DateTime  @default(now())
  user         SyncUser  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model SyncRecord {
  id           String    @id @default(cuid())
  userId       String
  storeName    String    // "recipes" | "books" | "chapters" | etc.
  recordId     String    // The ID from IndexedDB
  action       String    // "upsert" | "delete"
  data         String    // JSON payload
  version      Int       @default(1)
  checksum     String    // SHA-256 hash of data
  timestamp    DateTime  @default(now())
  deviceId     String?

  user         SyncUser  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, storeName, recordId])
  @@index([userId, storeName])
  @@index([userId, timestamp])
  @@index([timestamp])
}

model SyncConflict {
  id           String   @id @default(cuid())
  userId       String
  storeName    String
  recordId     String
  localData    String   // JSON
  remoteData   String   // JSON
  localVersion Int
  remoteVersion Int
  status       String   @default("pending") // "pending" | "resolved" | "auto-resolved"
  resolution   String?  // JSON of resolved data
  createdAt    DateTime @default(now())
  resolvedAt   DateTime?

  @@index([userId, status])
  @@index([userId, storeName])
}
```

### Client-Side IndexedDB Additions

Add to the existing `NutriLabelDB` schema (version 10):

```typescript
interface SyncServerConfig {
  id: string;
  label: string;          // "My Home Server", "NutriLabel Cloud"
  serverUrl: string;      // "https://sync.myserver.com"
  apiKey: string;         // Per-user API key
  userId: string;
  deviceId: string;
  enabled: boolean;
  autoSync: boolean;
  syncIntervalMinutes: number;  // 0 = disabled, 5 = default
  lastSyncedAt: string | null;
  lastSyncStatus: 'success' | 'error' | 'conflict' | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SyncChangeLog {
  id: string;
  storeName: string;
  recordId: string;
  action: 'upsert' | 'delete';
  timestamp: string;
  synced: boolean;
  syncServerId: string | null;  // Which server this was synced to
}
```

New IndexedDB stores:

```
syncServers:     keyPath: "id"       → SyncServerConfig
syncChangeLog:   keyPath: "id"       → index: "by-synced", "by-storeName", "by-timestamp"
```

---

## Sync Protocol

### Change Tracking

Every mutation to IndexedDB (create, update, delete) also writes to the `syncChangeLog` store. This is the local "outbox" of changes to push.

```
User edits recipe → IndexedDB updated → ChangeLog entry created (synced: false)
```

### Sync Flow

```
1. App Opens → triggerSync()
2. Timer Fires (every N minutes) → triggerSync()
3. User Edits Data → debounce(500ms) → triggerSync()

triggerSync():
  for each configured sync server (parallel):
    if server is enabled:
      await syncWithServer(server)
```

### syncWithServer() — Detailed Protocol

```
Phase 1: PUSH local changes
─────────────────────────
GET /api/sync/push
Body: {
  deviceId: string,
  changes: SyncChangeLog[]  (all where synced=false for this server)
}

Server response: {
  accepted: string[],      // change IDs accepted
  conflicts: Conflict[],   // changes that conflict with newer server data
  serverVersion: number    // current server clock
}

Mark accepted changes as synced=true in local change log.
Queue conflicts for resolution.


Phase 2: PULL remote changes
─────────────────────────
GET /api/sync/pull?since=<lastSyncedAt>&deviceId=<excludeSelf>

Server response: {
  changes: SyncRecord[],
  serverTimestamp: string
}

For each remote change:
  - If action is "upsert" and no local change exists → apply to IndexedDB
  - If action is "upsert" and local version exists:
    - Compare version/timestamp
    - If server is newer → apply (last-write-wins)
    - If local is newer → skip (will be pushed next cycle)
    - If same timestamp, different content → create conflict entry
  - If action is "delete" → remove from IndexedDB (unless locally modified after server timestamp)

Update lastSyncedAt for this server.


Phase 3: Resolve conflicts
─────────────────────────
For any conflicts detected:
  - Auto-resolve if possible (last-write-wins by timestamp)
  - Otherwise, queue for manual resolution in UI
```

### API Endpoints

```
POST   /api/sync/register          — Register a new device
POST   /api/sync/push               — Push local changes
GET    /api/sync/pull?since=...     — Pull remote changes since timestamp
GET    /api/sync/status             — Get sync status (last sync, counts)
POST   /api/sync/conflicts/:id      — Resolve a conflict
GET    /api/sync/conflicts           — List unresolved conflicts
DELETE /api/sync/device/:id          — Remove a device
POST   /api/sync/full-dump           — Full database upload (initial sync)
GET    /api/sync/full-dump           — Full database download (initial sync)
```

### Authentication

Each sync server uses a simple API key model:

1. User registers on the sync server (email + password, or invite code)
2. Server returns an API key
3. API key is stored in `SyncServerConfig.apiKey`
4. All sync requests include `Authorization: Bearer <apiKey>` header

For self-hosted servers, the admin can generate API keys directly.

---

## Implementation Plan

### Phase 1: Client-Side Change Tracking

**Files to modify:**
- `src/lib/storage.ts` — Add change logging to all mutation functions
- `src/lib/types.ts` — Add sync-related types
- `src/lib/sync-store.ts` — New: Zustand store for sync state management

**Tasks:**

1. Add IndexedDB stores `syncServers` and `syncChangeLog` (version bump to 10)
2. Create `logChange(storeName, recordId, action)` helper
3. Wrap every mutation function in `storage.ts` to call `logChange` after the operation:

```typescript
// Example: existing createRecipe function
export async function createRecipe(name: string): Promise<RecipeRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const recipe: RecipeRecord = {
    id: crypto.randomUUID(),
    name: name.trim(),
    servings: 1,
    servingName: 'serving',
    instructions: null,
    ingredientGroups: [],
    createdAt: now,
    updatedAt: now,
    ingredients: [],
  };
  await db.put('recipes', recipe);
  await logChange('recipes', recipe.id, 'upsert');  // NEW
  return recipe;
}
```

4. Create `src/lib/sync-store.ts` — Zustand store managing:
   - List of configured sync servers (`SyncServerConfig[]`)
   - Sync status per server (idle, syncing, error, conflict)
   - `triggerSync()` function
   - `addServer()`, `removeServer()`, `updateServer()` CRUD
   - Auto-sync timer management

5. Stores to track changes in (all existing mutations):
   - `recipes` — createRecipe, updateRecipe, deleteRecipe, addIngredient, removeIngredient, updateIngredient
   - `books` — createBook, updateBook, deleteBook
   - `chapters` — createChapter, updateChapter, deleteChapter, reorderChapters
   - `chapterRecipes` — addRecipeToChapter, removeRecipeFromChapter, reorderChapterRecipes, moveRecipeBetweenChapters
   - `chapterPages` — createChapterPage, updateChapterPage, deleteChapterPage
   - `bookPages` — createBookPage, updateBookPage, deleteBookPage
   - `categories` — createCategory, updateCategory, deleteCategory
   - `recipeCategories` — addCategoryToRecipe, removeCategoryFromRecipe
   - `templates` — createTemplate, updateTemplate, deleteTemplate
   - `mealPlans` — createMealPlan, updateMealPlan, deleteMealPlan
   - `dayPlanEntries` — createDayPlanEntry, updateDayPlanEntry, deleteDayPlanEntry
   - `mealGroups` — createMealGroup, updateMealGroup, deleteMealGroup
   - `groceryChecklists` — createGroceryChecklist, updateGroceryChecklist
   - `customFoods` — createCustomFood, updateCustomFood, deleteCustomFood
   - `nutritionProfiles` — createNutritionProfile, updateNutritionProfile, deleteNutritionProfile
   - `foodLogEntries` — createFoodLogEntry, updateFoodLogEntry, deleteFoodLogEntry
   - `weightEntries` — createWeightEntry, updateWeightEntry, deleteWeightEntry

### Phase 2: Sync Server API

**New files:**
- `src/app/api/sync/register/route.ts`
- `src/app/api/sync/push/route.ts`
- `src/app/api/sync/pull/route.ts`
- `src/app/api/sync/status/route.ts`
- `src/app/api/sync/conflicts/route.ts`
- `src/app/api/sync/conflicts/[id]/route.ts`
- `src/app/api/sync/device/[id]/route.ts`
- `src/app/api/sync/full-dump/route.ts`
- `src/lib/sync-auth.ts` — API key auth middleware

**Prisma additions:**
- Add `SyncUser`, `SyncDevice`, `SyncRecord`, `SyncConflict` models to `schema.prisma`

**Tasks:**

1. Create auth middleware (`sync-auth.ts`) that validates API keys from the `Authorization` header
2. Implement `/api/sync/register` — creates a user/device and returns an API key
3. Implement `/api/sync/push` — accepts changes, writes to `SyncRecord`, detects conflicts
4. Implement `/api/sync/pull` — returns changes since a given timestamp, excluding the caller's device
5. Implement `/api/sync/status` — returns last sync time, pending change count, device info
6. Implement `/api/sync/conflicts` — CRUD for conflict resolution
7. Implement `/api/sync/full-dump` — for initial sync of a new device
8. Run `npx prisma db push` to create the new tables

### Phase 3: Sync Client Engine

**New files:**
- `src/lib/sync-engine.ts` — Core sync logic
- `src/lib/sync-conflict.ts` — Conflict detection and resolution logic

**Tasks:**

1. Implement `syncEngine.pushChanges(server)`:
   - Read all `syncChangeLog` entries where `synced=false` and `syncServerId=null` (or matching server)
   - Batch into chunks of 100
   - POST to `/api/sync/push`
   - Mark accepted entries as `synced=true`

2. Implement `syncEngine.pullChanges(server)`:
   - GET `/api/sync/pull?since=<lastSyncedAt>`
   - For each change, apply to IndexedDB:
     - `upsert`: Use `db.put()` (idempotent)
     - `delete`: Use `db.delete()`
   - Update `lastSyncedAt`

3. Implement `syncEngine.fullSync(server)`:
   - For first-time sync or re-sync:
     - Upload all local data as a full dump
     - Download all server data
     - Merge with local (timestamp-based)

4. Implement conflict detection:
   - Compare `version` and `checksum` fields
   - If same record was modified on two devices:
     - Compare timestamps
     - If within 1 second: flag as conflict
     - Otherwise: last-write-wins

5. Implement auto-resolve rules:
   - Last-write-wins (default, based on `updatedAt`)
   - Field-level merge for non-overlapping field changes
   - Queue remaining conflicts for manual resolution

### Phase 4: Sync Settings UI

**New files:**
- `src/app/(app)/settings/sync/page.tsx` — Sync settings page
- `src/components/sync/sync-server-form.tsx` — Add/edit server form
- `src/components/sync/sync-status-indicator.tsx` — Real-time sync status
- `src/components/sync/conflict-resolver.tsx` — Manual conflict resolution UI

**Tasks:**

1. Create sync settings page with:
   - List of configured servers (name, URL, status indicator, last synced time)
   - "Add Server" button → form for URL, label, API key
   - Per-server controls: sync now, pause, remove, edit interval
   - Global sync toggle
   - Sync interval slider (1 min to 60 min, or manual only)

2. Create sync status indicator component:
   - Shows in app navigation bar
   - Green check: synced
   - Spinning arrow: syncing
   - Yellow warning: conflicts pending
   - Red X: connection error
   - Click → opens sync panel with details

3. Create conflict resolver UI:
   - Side-by-side diff view of conflicting records
   - "Keep Local" / "Keep Remote" / "Merge" buttons
   - Batch resolve option (keep all local / keep all remote)

### Phase 5: Auto-Sync Integration

**Files to modify:**
- `src/app/(app)/layout.tsx` — Initialize sync on app load
- `src/app/page.tsx` or root layout — Show sync status

**Tasks:**

1. On app load (in root layout):
   ```typescript
   useEffect(() => {
     syncStore.triggerSync(); // Sync on open
     const interval = setInterval(() => {
       syncStore.triggerSync(); // Sync at interval
     }, syncIntervalMs);
     return () => clearInterval(interval);
   }, []);
   ```

2. On every data mutation (via existing Zustand stores):
   ```typescript
   // In recipe-store.ts, book-store.ts, etc.
   // After each mutation, notify sync store
   syncStore.onLocalChange();
   ```

3. Implement `onLocalChange()` with debounce:
   ```typescript
   private syncTimeout: NodeJS.Timeout | null = null;

   onLocalChange() {
     if (this.syncTimeout) clearTimeout(this.syncTimeout);
     this.syncTimeout = setTimeout(() => {
       this.triggerSync();
     }, 500); // 500ms debounce
   }
   ```

4. Handle offline/online events:
   ```typescript
   window.addEventListener('online', () => syncStore.triggerSync());
   ```

5. Add visibility change handler:
   ```typescript
   document.addEventListener('visibilitychange', () => {
     if (!document.hidden) syncStore.triggerSync(); // Sync when tab becomes visible
   });
   ```

---

## Multi-Server Sync Behavior

Each server is synced independently and in parallel:

```
Instance has 3 servers configured:
  Server A (Home)     — sync every 5 min
  Server B (Work)     — sync every 10 min
  Server C (Cloud)    — sync every 15 min

On triggerSync():
  Promise.all([
    syncWithServer(serverA),
    syncWithServer(serverB),
    syncWithServer(serverC),
  ])
```

### Change Routing

- A local change is pushed to **all enabled servers**
- The `syncChangeLog` tracks which servers have received each change:
  ```
  changeLog.synced = false  → push to all servers
  changeLog.synced = true   → already pushed to all
  ```
- If a server is temporarily unreachable, its changes remain in the log until connectivity returns

### Data Ownership

- All data belongs to the user (not to a specific server)
- Removing a server only removes the connection, not local data
- Adding a new server triggers a full dump upload on first sync

---

## Security Considerations

1. **API Keys** — Never stored on the sync server in plaintext; use hashed tokens
2. **Transport** — All sync communication over HTTPS only
3. **Data Validation** — Server validates all incoming payloads against expected schemas
4. **Rate Limiting** — Limit sync requests per user (e.g., 60/min)
5. **Payload Size** — Cap individual sync pushes at 1MB per batch
6. **Device Registration** — Users can view and revoke devices
7. **Optional E2E Encryption** — Client encrypts data before pushing, server never sees plaintext

---

## Conflict Resolution Strategy

### Automatic Resolution (Default)

1. **Last-Write-Wins**: Compare `updatedAt` timestamps. Newer wins.
2. **Field-Level Merge**: If two changes modify different fields of the same record, merge both sets of changes.
3. **Delete Wins**: If one side deletes and the other updates, the delete wins (user intent to remove).

### Manual Resolution (When Auto Fails)

- Conflicts where timestamps are within 1 second and data differs are flagged for manual review
- Conflict resolver UI shows side-by-side diff
- User chooses: Keep Local, Keep Remote, or Manual Merge
- Resolution is pushed as a new sync record

---

## File Structure Summary

```
src/
  lib/
    storage.ts              ← Modified: add logChange() calls to all mutations
    types.ts                ← Modified: add sync types
    sync-store.ts           ← NEW: Zustand store for sync state
    sync-engine.ts          ← NEW: Core sync protocol logic
    sync-conflict.ts        ← NEW: Conflict detection/resolution
    sync-auth.ts            ← NEW: API key auth helper
  app/
    (app)/
      settings/
        sync/
          page.tsx          ← NEW: Sync settings page
    api/
      sync/
        register/route.ts   ← NEW: Device registration
        push/route.ts       ← NEW: Push changes
        pull/route.ts       ← NEW: Pull changes
        status/route.ts     ← NEW: Sync status
        full-dump/route.ts  ← NEW: Initial full sync
        conflicts/
          route.ts          ← NEW: List conflicts
          [id]/route.ts     ← NEW: Resolve conflict
        device/
          [id]/route.ts     ← NEW: Remove device
  components/
    sync/
      sync-server-form.tsx          ← NEW
      sync-status-indicator.tsx     ← NEW
      conflict-resolver.tsx         ← NEW
prisma/
  schema.prisma            ← Modified: add SyncUser, SyncDevice, SyncRecord, SyncConflict
```

---

## Testing Checklist

- [ ] Add a sync server and verify connection
- [ ] Create a recipe on Device A, verify it appears on Device B
- [ ] Edit the same recipe on both devices simultaneously, verify conflict handling
- [ ] Go offline, make changes, go online, verify sync resumes
- [ ] Remove a server, verify local data is intact
- [ ] Add a new server, verify full dump uploads
- [ ] Delete a recipe on Device A, verify it deletes on Device B
- [ ] Verify sync happens on app open
- [ ] Verify sync happens at configured intervals
- [ ] Verify sync happens shortly after a local change
- [ ] Verify manual conflict resolution works
- [ ] Test with 3+ servers configured simultaneously
- [ ] Test with large databases (1000+ recipes)
- [ ] Test sync over slow connections
- [ ] Test concurrent sync from multiple devices

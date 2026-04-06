// ============================================================
// 오프라인 / IndexedDB 캐시 서비스 (v2.1)
// 네트워크 없을 때 로컬 작업 → 복귀 시 sync
// ============================================================

const DB_NAME = "webtoon-studio-v2";
const DB_VERSION = 1;

// ─── IndexedDB 스토어 정의 ───────────────────────────────────

const STORES = {
  projects: "projects",
  episodes: "episodes",
  panels: "panels",
  references: "references",
  pendingSync: "pendingSync", // 오프라인 변경사항 큐
} as const;

// ─── DB 초기화 ───────────────────────────────────────────────

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const storeName of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── 제네릭 CRUD ─────────────────────────────────────────────

export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function put<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── 오프라인 sync 큐 ───────────────────────────────────────

interface PendingChange {
  id: string;
  action: "create" | "update" | "delete";
  collection: string;
  data?: unknown;
  timestamp: number;
}

export async function enqueuePendingChange(change: Omit<PendingChange, "id" | "timestamp">): Promise<void> {
  const entry: PendingChange = {
    ...change,
    id: `${change.collection}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
  };
  await put(STORES.pendingSync, entry);
}

export async function getPendingChanges(): Promise<PendingChange[]> {
  const changes = await getAll<PendingChange>(STORES.pendingSync);
  return changes.sort((a, b) => a.timestamp - b.timestamp);
}

export async function clearPendingChange(id: string): Promise<void> {
  await remove(STORES.pendingSync, id);
}

// ─── 네트워크 상태 감지 ──────────────────────────────────────

export function isOnline(): boolean {
  return navigator.onLine;
}

export function onOnlineStatusChange(callback: (online: boolean) => void): () => void {
  const onOnline = () => callback(true);
  const onOffline = () => callback(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

// ─── Sync 실행 ───────────────────────────────────────────────

export async function syncPendingChanges(): Promise<{ synced: number; failed: number }> {
  if (!isOnline()) return { synced: 0, failed: 0 };

  const pending = await getPendingChanges();
  let synced = 0;
  let failed = 0;

  for (const change of pending) {
    try {
      // TODO: Firebase 서비스 호출해서 실제 sync
      // await firebaseService[change.action](change.collection, change.data);
      await clearPendingChange(change.id);
      synced++;
    } catch (err) {
      console.error("[Offline] sync failed for", change.id, err);
      failed++;
    }
  }

  console.log(`[Offline] sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

export const offlineService = {
  openDB,
  getAll,
  getById,
  put,
  remove,
  enqueuePendingChange,
  getPendingChanges,
  clearPendingChange,
  isOnline,
  onOnlineStatusChange,
  syncPendingChanges,
};

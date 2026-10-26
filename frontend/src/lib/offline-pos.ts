
import { ApiError, api } from './api';

export type OfflineOrderStatus = 'queued' | 'syncing' | 'synced' | 'failed';

export interface OfflineOrder {
  id: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: OfflineOrderStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  serverOrderId?: string;
  serverOrderNo?: string;
  error?: string;
}

const DB_NAME = 'koraf-hms-offline-pos';
const DB_VERSION = 1;
const STORE_NAME = 'orders';

let dbPromise: Promise<IDBDatabase> | undefined;
let syncPromise: Promise<void> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = undefined;
        reject(request.error ?? new Error('Could not open the offline order database.'));
      };

      request.onblocked = () => {
        reject(new Error('The offline order database is blocked by another browser tab.'));
      };
    });
  }

  return dbPromise;
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-pos-queue-changed'));
  }
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Offline database transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Offline database transaction was aborted.'));
  });
}

export async function listOfflineOrders(): Promise<OfflineOrder[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      const orders = request.result as OfflineOrder[];
      orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(orders);
    };

    request.onerror = () => reject(request.error);
  });
}

async function saveOrder(order: OfflineOrder): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');

  tx.objectStore(STORE_NAME).put(order);
  await transactionDone(tx);
  notifyQueueChanged();
}

async function updateOrder(
  id: string,
  changes: Partial<OfflineOrder>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const request = store.get(id);

  request.onsuccess = () => {
    const current = request.result as OfflineOrder | undefined;

    if (current) {
      store.put({
        ...current,
        ...changes,
        id: current.id,
        idempotencyKey: current.idempotencyKey,
        payload: current.payload,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  await transactionDone(tx);
  notifyQueueChanged();
}

export async function enqueueOrder(
  payload: Record<string, unknown>,
): Promise<OfflineOrder> {
  // Generate the key once, when this order is first saved.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const order: OfflineOrder = {
    id,
    idempotencyKey: id,
    payload,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };

  // Do not send the order until durable local storage has succeeded.
  await saveOrder(order);
  return order;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Order synchronization failed.';
}

function isPermanentError(error: unknown): boolean {
  // Validation, authorization, conflict and other 4xx errors need
  // user intervention; they should not be retried automatically.
  return error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429;
}

async function syncOne(order: OfflineOrder): Promise<void> {
  await updateOrder(order.id, {
    status: 'syncing',
    attempts: order.attempts + 1,
    error: undefined,
  });

  try {
    const result = await api.post<{
      id?: string;
      orderNo?: string;
    }>('/orders', order.payload, {
      'Idempotency-Key': order.idempotencyKey,
    });

    await updateOrder(order.id, {
      status: 'synced',
      serverOrderId: result?.id,
      serverOrderNo: result?.orderNo,
      error: undefined,
    });
  } catch (error) {
    await updateOrder(order.id, {
      status: isPermanentError(error) ? 'failed' : 'queued',
      error: getErrorMessage(error),
    });
  }
}

export function syncPendingOrders(): Promise<void> {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;

    const orders = await listOfflineOrders();

    for (const order of orders) {
      if (!navigator.onLine) break;

      // Don't automatically retry orders that need human intervention.
      if (order.status !== 'queued') continue;

      await syncOne(order);
    }
  })().finally(() => {
    syncPromise = undefined;
  });

  return syncPromise;
}

export async function retryFailedOrder(id: string): Promise<void> {
  const orders = await listOfflineOrders();
  const order = orders.find((item) => item.id === id);

  if (!order || order.status !== 'failed') return;

  // Reuse the same key and payload. Never create a new key for a retry.
  await updateOrder(id, { status: 'queued', error: undefined });
  await syncPendingOrders();
}

export async function getPosMenuData<T>(path: string): Promise<T> {
  const cacheKey = `koraf-hms:pos-menu:${path}`;

  try {
    const data = await api.get<T>(path);

    // Save successful menu responses for offline use.
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          data,
        }),
      );
    } catch {
      // The online menu still works if browser storage is unavailable.
    }

    return data;
  } catch (error) {
    // Don't hide server errors such as permission or validation failures.
    if (error instanceof ApiError) {
      throw error;
    }

    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached) as {
        savedAt: string;
        data: T;
      };

      return parsed.data;
    }

    throw new Error(
      'Menu is not cached on this device. Connect to the internet and open this sales point first.',
    );
  }
}

export function subscribeToQueueChanges(callback: () => void): () => void {
  window.addEventListener('offline-pos-queue-changed', callback);
  return () => window.removeEventListener('offline-pos-queue-changed', callback);
}

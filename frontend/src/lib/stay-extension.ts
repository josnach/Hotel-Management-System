
const STORAGE_PREFIX = 'hms:stay-extension:idempotency:';

const memoryKeys = new Map<string, string>();

export function getStayExtensionKey(stayId: string): string {
  const storageKey = `${STORAGE_PREFIX}${stayId}`;

  try {
    const existing = localStorage.getItem(storageKey);

    if (existing && /^[a-zA-Z0-9_-]{16,128}$/.test(existing)) {
      return existing;
    }
  } catch {
    // Fall back to an in-memory key if browser storage is unavailable.
  }

  const memoryKey = memoryKeys.get(stayId);
  if (memoryKey) return memoryKey;

  const key = crypto.randomUUID();

  memoryKeys.set(stayId, key);

  try {
    localStorage.setItem(storageKey, key);
  } catch {
    // The in-memory key still protects retries within this page session.
  }

  return key;
}

export function clearStayExtensionKey(stayId: string): void {
  memoryKeys.delete(stayId);

  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${stayId}`);
  } catch {
    // Nothing else to clear if browser storage is unavailable.
  }
}

/**
 * Minimal IndexedDB key-value store. Two object stores:
 *   kv     — the cached catalogue and other small state
 *   covers — cover image blobs keyed by Drive file id
 * Everything here is a cache: any failure (private mode, quota) falls back to "not cached".
 */
const DB_NAME = 'pelagic'
const DB_VERSION = 1
export type StoreName = 'kv' | 'covers'

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      if (!db.objectStoreNames.contains('covers')) db.createObjectStore('covers')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbp.catch(() => (dbp = null))
  return dbp
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result as T)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(store, 'readonly', (s) => s.get(key))
  } catch {
    return undefined
  }
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.put(value, key))
  } catch {
    /* cache only */
  }
}

export async function idbClear(store: StoreName): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.clear())
  } catch {
    /* cache only */
  }
}

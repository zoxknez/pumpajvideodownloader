// Minimal IndexedDB store for persisting FileSystemDirectoryHandle (Chromium-only)
// Falls back gracefully when not supported.

const DB_NAME = 'app-settings';
const STORE = 'fs';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, val: any): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.put(val, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

async function idbDel(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

const KEY_DEFAULT_DIR = 'defaultDirHandle';

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

export async function setDefaultDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await idbSet(KEY_DEFAULT_DIR, handle);
  try { window.dispatchEvent(new CustomEvent('default-dir-changed', { detail: { name: (handle as any)?.name || '' } })); } catch {}
}

export async function getDefaultDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const val = await idbGet<FileSystemDirectoryHandle>(KEY_DEFAULT_DIR);
  return (val as any) || null;
}

export async function clearDefaultDirHandle(): Promise<void> {
  await idbDel(KEY_DEFAULT_DIR);
  try { window.dispatchEvent(new CustomEvent('default-dir-changed', { detail: { name: '' } })); } catch {}
}

export async function ensureWritePermission(handle: FileSystemHandle): Promise<boolean> {
  try {
    if ('requestPermission' in handle) {
      const cur = await (handle as any).queryPermission?.({ mode: 'readwrite' });
      if (cur === 'granted') return true;
      const res = await (handle as any).requestPermission?.({ mode: 'readwrite' });
      return res === 'granted';
    }
  } catch {}
  return false;
}

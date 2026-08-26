// Local pending store for source files (IndexedDB).
// Uploaded files live here as Blobs until "Sync" commits them to the
// repository; queued deletions are executed on sync as well.
const DB_NAME = "stammgit-pending";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("files");      // name -> { blob, type }
      req.result.createObjectStore("deletions");  // name -> true
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); resolve(result.result !== undefined ? result.result : result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function pendingPutFile(name, blob) {
  return tx("files", "readwrite", (s) => s.put({ blob, type: blob.type }, name));
}
export async function pendingGetFile(name) {
  return tx("files", "readonly", (s) => s.get(name)).then(r => r || null);
}
export async function pendingListFiles() {
  return tx("files", "readonly", (s) => s.getAllKeys()).then(r => r || []);
}
export async function pendingRemoveFile(name) {
  return tx("files", "readwrite", (s) => s.delete(name));
}
export async function pendingQueueDeletion(name) {
  return tx("deletions", "readwrite", (s) => s.put(true, name));
}
export async function pendingListDeletions() {
  return tx("deletions", "readonly", (s) => s.getAllKeys()).then(r => r || []);
}
export async function pendingClearDeletion(name) {
  return tx("deletions", "readwrite", (s) => s.delete(name));
}

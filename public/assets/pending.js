// Local pending store for source files (IndexedDB).
// Uploaded files live here as Blobs until "Sync" commits them to the
// repository; queued deletions are executed on sync as well.
const DB_NAME = "stammgit-pending";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("files");      // [tree, name] -> { blob, type }; legacy: name
      req.result.createObjectStore("deletions");  // [tree, name] -> true; legacy: name
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
    t.oncomplete = () => { db.close(); resolve(result.result); };
    t.onabort = () => { db.close(); reject(t.error || result.error || new Error("Local file transaction aborted.")); };
  });
}

export async function pendingPutFile(name, blob, tree = "") {
  // Byte buffers avoid WebKit failing an IndexedDB transaction for Blob/File
  // values. Existing Blob records stay readable: callers already wrap blob in
  // new Blob([record.blob], { type: record.type }).
  const bytes = await blob.arrayBuffer();
  return tx("files", "readwrite", (s) => s.put({ blob: bytes, type: blob.type, tree }, tree ? [tree, name] : name));
}
export async function pendingGetFile(name, tree = "") {
  return tx("files", "readonly", (s) => s.get(tree ? [tree, name] : name)).then(r => r || null);
}
export async function pendingListFiles(tree = "") {
  return tx("files", "readonly", (s) => s.getAllKeys()).then(keys => (keys || []).filter(key => tree ? Array.isArray(key) && key[0] === tree : typeof key === "string").map(key => tree ? key[1] : key));
}
export async function pendingRemoveFile(name, tree = "") {
  return tx("files", "readwrite", (s) => s.delete(tree ? [tree, name] : name));
}
export async function pendingQueueDeletion(name, tree = "") {
  return tx("deletions", "readwrite", (s) => s.put(true, tree ? [tree, name] : name));
}
export async function pendingListDeletions(tree = "") {
  return tx("deletions", "readonly", (s) => s.getAllKeys()).then(keys => (keys || []).filter(key => tree ? Array.isArray(key) && key[0] === tree : typeof key === "string").map(key => tree ? key[1] : key));
}
export async function pendingClearDeletion(name, tree = "") {
  return tx("deletions", "readwrite", (s) => s.delete(tree ? [tree, name] : name));
}

// Old string keys stay intact unless their owner is unambiguous. Chronicle
// paths carry that owner; shared file/deletion names need a single known tree.
export async function migrateLegacyPending(tree, soleTree = false) {
  for (const store of ["files", "deletions"]) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(store, "readwrite"), records = transaction.objectStore(store);
      const cursor = records.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result; if (!item) return;
        const key = item.key;
        if (typeof key === "string" && (key.startsWith(`chronicle/${tree}/`) || (soleTree && !key.startsWith("chronicle/")))) {
          const target = [tree, key], existing = records.get(target);
          existing.onsuccess = () => {
            // Never overwrite a newer scoped draft with an old record.
            if (existing.result === undefined) { records.put(item.value, target); item.delete(); }
            item.continue();
          };
        } else item.continue();
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    });
  }
  const remaining = [...await pendingListFiles(), ...await pendingListDeletions()];
  return remaining.some(name => !name.startsWith("chronicle/") || name.startsWith(`chronicle/${tree}/`));
}

// Uploaded source paths are shared server-side, even though local drafts are scoped.
export async function pendingFileNames() {
  return tx("files", "readonly", s => s.getAllKeys()).then(keys => (keys || []).map(key => Array.isArray(key) ? key[1] : key));
}

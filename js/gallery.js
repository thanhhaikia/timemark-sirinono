// Photos taken in the app, kept in IndexedDB so the in-app gallery works offline.

const DB = 'timemark_sirinono';
const STORE = 'photos';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** photo: { blob, thumb, name, created, meta } → id */
export const addPhoto = (photo) => run('readwrite', (s) => s.add(photo));
export const getPhoto = (id) => run('readonly', (s) => s.get(id));
export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id));
export const clearPhotos = () => run('readwrite', (s) => s.clear());

export async function listPhotos() {
  const all = (await run('readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => b.created - a.created);
}

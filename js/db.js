const DB_NAME = 'uchet-db';
const DB_VERSION = 1;
let dbInstance = null;

const MACHINES_SEED = [
  { id: 'm1', number: 1, model: 'DS600', order: 1 },
  { id: 'm2', number: 2, model: 'DS600', order: 2 },
  { id: 'm3', number: 3, model: 'DS300', order: 3 },
  { id: 'm4', number: 4, model: 'DS300', order: 4 },
  { id: 'm5', number: 5, model: 'DS600', order: 5 },
  { id: 'm6', number: 6, model: 'DS600', order: 6 },
  { id: 'm7', number: 7, model: 'DS600', order: 7 },
  { id: 'm8', number: 8, model: 'DS900', order: 8 },
  { id: 'm9', number: 9, model: 'DS900', order: 9 },
  { id: 'm10', number: 10, model: 'DS300', order: 10 },
  { id: 'm11', number: 11, model: 'DS1500', order: 11 }
];

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('machines')) {
        const store = db.createObjectStore('machines', { keyPath: 'id' });
        store.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('machineId', 'machineId', { unique: false });
        store.createIndex('orderNo', 'orderNo', { unique: false });
      }
      if (!db.objectStoreNames.contains('history')) {
        const store = db.createObjectStore('history', { keyPath: 'id' });
        store.createIndex('eventDate', 'eventDate', { unique: false });
        store.createIndex('orderNo', 'orderNo', { unique: false });
        store.createIndex('machineId', 'machineId', { unique: false });
      }
    };
    req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(storeName, obj) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// НОВОЕ: Удаление записи (нужно для отмены выполненных действий)
async function deleteItem(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getTasksByMachine(machineId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readonly');
    const index = tx.objectStore('tasks').index('machineId');
    const req = index.getAll(machineId);
    req.onsuccess = () => {
      const tasks = req.result.sort((a, b) => a.pos - b.pos);
      resolve(tasks);
    };
    req.onerror = () => reject(req.error);
  });
}

async function seedDB() {
  const machines = await getAll('machines');
  if (machines.length === 0) {
    for (const m of MACHINES_SEED) {
      await put('machines', m);
    }
  }
}
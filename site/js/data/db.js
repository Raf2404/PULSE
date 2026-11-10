// @ts-check
/**
 * Stockage local (IndexedDB). Toutes les données de santé restent sur l'appareil.
 *
 * Magasins :
 * - samples  : mesures brutes, clé = sampleKey (dédoublonnage), index [type, start] et start
 * - workouts : séances, clé = workoutKey, index start
 * - journal  : journal du soir, clé = date
 * - daily    : résumés quotidiens (scores, Phase 1), clé = date
 * - meta     : réglages et profil, clé = key
 */
import { sampleKey, workoutKey } from './schema.js';

/** @typedef {import('./schema.js').Sample} Sample */
/** @typedef {import('./schema.js').Workout} Workout */
/** @typedef {import('./schema.js').JournalEntry} JournalEntry */

export const DB_NAME = 'pulse';
export const DB_VERSION = 1;
export const STORES = /** @type {const} */ (['samples', 'workouts', 'journal', 'daily', 'meta']);

/** @typedef {typeof STORES[number]} StoreName */

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/**
 * Transforme une requête IndexedDB en promesse.
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Attend la fin d'une transaction.
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction annulée'));
  });
}

/** @returns {Promise<IDBDatabase>} */
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const samples = db.createObjectStore('samples', { keyPath: 'id' });
      samples.createIndex('type_start', ['type', 'start']);
      samples.createIndex('start', 'start');
      const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
      workouts.createIndex('start', 'start');
      db.createObjectStore('journal', { keyPath: 'date' });
      db.createObjectStore('daily', { keyPath: 'date' });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Une autre version du site a été ouverte : on libère la base pour qu'elle puisse migrer.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => console.warn('PULSE : base bloquée par un autre onglet ouvert.');
  });
  return dbPromise;
}

/** Ferme la connexion (utile pour les tests et avant une suppression). */
export async function closeDb() {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}

/**
 * Écrit des objets par paquets dans un magasin (une transaction par paquet,
 * pour ne pas bloquer l'interface sur de gros imports).
 * @param {StoreName} store
 * @param {object[]} rows
 * @param {{ chunkSize?: number, onProgress?: (written: number, total: number) => void }} [opts]
 */
async function putAll(store, rows, opts = {}) {
  const db = await openDb();
  const chunkSize = opts.chunkSize ?? 5000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const row of rows.slice(i, i + chunkSize)) os.put(row);
    await done(tx);
    opts.onProgress?.(Math.min(i + chunkSize, rows.length), rows.length);
  }
}

/**
 * Enregistre des mesures (les doublons sont écrasés grâce à la clé).
 * @param {Sample[]} samples
 * @param {{ onProgress?: (written: number, total: number) => void }} [opts]
 */
export function putSamples(samples, opts) {
  return putAll('samples', samples.map((s) => ({ ...s, id: sampleKey(s) })), opts);
}

/** @param {Workout[]} workouts */
export function putWorkouts(workouts) {
  return putAll('workouts', workouts.map((w) => ({ ...w, id: workoutKey(w) })));
}

/** @param {JournalEntry[]} entries */
export function putJournal(entries) {
  return putAll('journal', entries);
}

/**
 * Mesures d'un type entre deux instants (début inclus, fin exclue), triées par début.
 * @param {Sample['type']} type
 * @param {number} from
 * @param {number} to
 * @returns {Promise<Sample[]>}
 */
export async function getSamples(type, from, to) {
  const db = await openDb();
  const tx = db.transaction('samples', 'readonly');
  const range = IDBKeyRange.bound([type, from], [type, to], false, true);
  const rows = /** @type {(Sample & { id: string })[]} */ (await request(tx.objectStore('samples').index('type_start').getAll(range)));
  return rows.map((r) => /** @type {Sample} */ (stripId(r)));
}

/**
 * Séances commencées entre deux instants, triées par début.
 * @param {number} from
 * @param {number} to
 * @returns {Promise<Workout[]>}
 */
export async function getWorkouts(from, to) {
  const db = await openDb();
  const tx = db.transaction('workouts', 'readonly');
  const range = IDBKeyRange.bound(from, to, false, true);
  const rows = /** @type {(Workout & { id: string })[]} */ (await request(tx.objectStore('workouts').index('start').getAll(range)));
  return rows.map(stripId);
}

/** @returns {Promise<JournalEntry[]>} */
export async function getJournal() {
  const db = await openDb();
  return request(db.transaction('journal', 'readonly').objectStore('journal').getAll());
}

/**
 * Bornes temporelles des mesures stockées (null si vide).
 * @returns {Promise<{ first: number, last: number } | null>}
 */
export async function getSampleRange() {
  const db = await openDb();
  const index = db.transaction('samples', 'readonly').objectStore('samples').index('start');
  const firstCursor = await request(index.openCursor(null, 'next'));
  if (!firstCursor) return null;
  const first = /** @type {Sample} */ (firstCursor.value).start;
  const lastCursor = await request(index.openCursor(null, 'prev'));
  const last = lastCursor ? /** @type {Sample} */ (lastCursor.value).start : first;
  return { first, last };
}

/** Nombre d'éléments par magasin. */
export async function counts() {
  const db = await openDb();
  const tx = db.transaction(STORES, 'readonly');
  /** @type {Record<StoreName, number>} */
  const out = { samples: 0, workouts: 0, journal: 0, daily: 0, meta: 0 };
  await Promise.all(STORES.map(async (s) => { out[s] = await request(tx.objectStore(s).count()); }));
  return out;
}

/**
 * @param {string} key
 * @returns {Promise<unknown>}
 */
export async function getMeta(key) {
  const db = await openDb();
  const row = await request(db.transaction('meta', 'readonly').objectStore('meta').get(key));
  return row ? row.value : undefined;
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export async function setMeta(key, value) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await done(tx);
}

/** Vide toutes les données de santé (garde les réglages si keepMeta). */
export async function clearHealthData({ keepMeta = true } = {}) {
  const db = await openDb();
  const stores = keepMeta ? STORES.filter((s) => s !== 'meta') : [...STORES];
  const tx = db.transaction(stores, 'readwrite');
  for (const s of stores) tx.objectStore(s).clear();
  await done(tx);
}

/** Supprime complètement la base de l'appareil. */
export async function deleteEverything() {
  await closeDb();
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(undefined);
  });
}

/**
 * Demande au navigateur de ne pas effacer les données en cas de manque de place.
 * @returns {Promise<boolean>}
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* navigateur sans support */ }
  return false;
}

/**
 * Retire la clé technique `id` ajoutée au stockage.
 * @template {{ id?: string }} T
 * @param {T} row
 * @returns {Omit<T, 'id'>}
 */
function stripId(row) {
  const { id: _id, ...rest } = row;
  return rest;
}

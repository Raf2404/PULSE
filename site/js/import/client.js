// @ts-check
/**
 * Pilote l'import depuis la page : lance le worker, relaie la progression,
 * puis recalcule les scores. Les données démo sont remplacées par les vraies.
 */
import * as db from '../data/db.js';
import { recompute } from '../data/pipeline.js';

/** @typedef {import('./healthxml.js').ParseStats} ParseStats */

/** Fenêtre gardée lors d'un import (jours). */
export const IMPORT_DAYS = 120;

/**
 * @param {File} file
 * @param {(ratio: number, label: string) => void} onProgress
 * @returns {Promise<ParseStats & { written: number }>}
 */
export async function importAppleHealth(file, onProgress) {
  if ((await db.getMeta('mode')) === 'demo') await db.clearHealthData();
  onProgress(0, 'Lecture du fichier');

  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress(msg.ratio * 0.8, `Lecture du fichier · ${new Intl.NumberFormat('fr-FR').format(msg.written)} mesures`);
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve({ ...msg.stats, written: msg.written });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Erreur pendant la lecture du fichier.')); };
    worker.postMessage({ file, days: IMPORT_DAYS, now: Date.now() });
  });

  await recompute({ onProgress: (r, label) => onProgress(0.8 + r * 0.2, label) });
  await db.setMeta('mode', 'apple');
  await db.setMeta('lastImport', { at: Date.now(), fileName: file.name, size: file.size, sources: result.sources, counts: result.counts, workouts: result.workouts });
  await db.requestPersistence();
  return result;
}

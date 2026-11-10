// @ts-check
/**
 * Chaîne de calcul : mesures brutes (IndexedDB) → agrégats du jour → scores → magasin « daily ».
 * Lancée après un import, le chargement de la démo ou un changement de profil.
 * L'interface lit ensuite seulement les résumés quotidiens (rapide).
 */
import * as db from './db.js';
import { buildDays } from '../scoring/daily.js';
import { computeScores } from '../scoring/scores.js';
import { hrMaxOf, normalizeProfile } from './profile.js';

/** @typedef {import('../scoring/scores.js').DayRecord} DayRecord */
/** @typedef {import('./schema.js').Sample} Sample */

const TYPES = /** @type {const} */ ([
  'sleep', 'hr', 'rhr', 'hrv', 'resp', 'spo2', 'wrist_temp', 'steps', 'active_energy',
  'vo2max', 'weight', 'water', 'protein', 'menstrual', 'mindful',
]);

/**
 * Recalcule tous les résumés quotidiens et les enregistre.
 * @param {{ onProgress?: (ratio: number, label: string) => void }} [opts]
 * @returns {Promise<DayRecord[]>}
 */
export async function recompute(opts = {}) {
  const progress = opts.onProgress ?? (() => {});
  progress(0, 'Lecture des mesures');
  /** @type {Map<string, Sample[]>} */
  const byType = new Map();
  let i = 0;
  for (const t of TYPES) {
    byType.set(t, await db.getAllSamplesOfType(t));
    progress((++i / TYPES.length) * 0.6, 'Lecture des mesures');
  }
  const workouts = await db.getAllWorkouts();
  const profile = normalizeProfile(await db.getMeta('profile'));
  progress(0.65, 'Calcul des nuits et de l\'effort');
  await tick();
  const { days, hrRestUsed } = buildDays({ byType, workouts, hrMax: hrMaxOf(profile), hrRest: null });
  progress(0.85, 'Calcul des scores');
  await tick();
  const records = computeScores(days);
  await db.replaceAll('daily', records);
  await db.setMeta('computedAt', Date.now());
  await db.setMeta('hrRestUsed', hrRestUsed);
  progress(1, 'Terminé');
  return records;
}

/**
 * Résumés quotidiens enregistrés, triés par date.
 * @returns {Promise<DayRecord[]>}
 */
export async function loadRecords() {
  const rows = /** @type {DayRecord[]} */ (await db.getAll('daily'));
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Laisse respirer l'interface entre deux étapes lourdes. */
function tick() {
  return new Promise((r) => setTimeout(r, 0));
}

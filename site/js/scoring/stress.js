// @ts-check
/**
 * Moniteur de stress (Phase 3) : FC des heures calmes de la journée (peu de pas, pas de séance)
 * comparée à TA FC habituelle dans les mêmes conditions sur 14 jours. Échelle 0–3.
 * Indicatif : la FC monte aussi avec le café, la chaleur, la digestion…
 */
import { CONFIG } from './config.js';
import { clamp, mean, median, round, sd } from './stats.js';

/** @typedef {import('./scores.js').DayRecord} DayRecord */

/**
 * Heures « calmes » d'une journée (hors sommeil, hors séance, peu de pas).
 * @param {DayRecord} r
 * @returns {{ hour: number, hr: number }[]}
 */
function calmHours(r) {
  const out = [];
  const wake = r.night ? new Date(r.night.end).getHours() : 7;
  for (let h = Math.max(wake + 1, 8); h < 22; h++) {
    const hr = r.hrByHour[h];
    if (hr === null || r.workoutByHour[h] || r.stepsByHour[h] > CONFIG.stress.sedentaryStepsPerHour) continue;
    // Une séance juste avant fausse l'heure suivante (FC encore haute).
    if (h > 0 && r.workoutByHour[h - 1]) continue;
    out.push({ hour: h, hr });
  }
  return out;
}

/**
 * Référence personnelle : FC des heures calmes sur les 14 jours précédents.
 * @param {DayRecord[]} records triés @param {string} date
 */
export function stressBaseline(records, date) {
  const prev = records.filter((r) => r.date < date).slice(-14);
  const values = prev.flatMap((r) => calmHours(r).map((h) => h.hr));
  if (values.length < 20) return null;
  return { median: /** @type {number} */ (median(values)), sd: Math.max(/** @type {number} */ (sd(values)), 3) };
}

/** @param {number | null} score */
export function stressLevel(score) {
  if (score === null) return null;
  const [a, b, c] = CONFIG.stress.levels;
  if (score < a) return { key: 'low', label: 'Calme' };
  if (score < b) return { key: 'medium', label: 'Modéré' };
  if (score < c) return { key: 'high', label: 'Élevé' };
  return { key: 'very_high', label: 'Très élevé' };
}

/**
 * Stress heure par heure d'une journée.
 * @param {DayRecord} r @param {{ median: number, sd: number } | null} base
 */
export function stressOfDay(r, base) {
  if (!base) return { hours: [], average: null, peakHour: null };
  const hours = calmHours(r).map(({ hour, hr }) => ({ hour, hr, score: round(clamp(1 + (hr - base.median) / base.sd, 0, 3), 1) }));
  const avg = mean(hours.map((h) => h.score));
  const peak = hours.reduce((best, h) => (!best || h.score > best.score ? h : best), /** @type {typeof hours[number] | null} */ (null));
  return { hours, average: avg === null ? null : round(avg, 1), peakHour: peak ? peak.hour : null };
}

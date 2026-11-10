// @ts-check
/**
 * Suivi du cycle menstruel (Phase 4, facultatif) : à partir du flux saisi dans Apple Santé,
 * jour et phase du cycle. En phase lutéale, la FC repos et la température montent naturellement
 * et la VFC baisse un peu : les scores en tiennent compte pour ne pas pénaliser à tort.
 */
import { CONFIG } from './config.js';

/** @typedef {import('./daily.js').DayPhys} DayPhys */
/** @typedef {'menstrual' | 'follicular' | 'ovulation' | 'luteal'} CyclePhase */

const FLOW = new Set(['light', 'medium', 'heavy', 'unspecified']);
const DAY = 86400000;

export const PHASE_LABELS = /** @type {const} */ ({
  menstrual: 'Règles',
  follicular: 'Phase folliculaire',
  ovulation: 'Ovulation (estimée)',
  luteal: 'Phase lutéale',
});

/** @param {string} date */
const t = (date) => new Date(`${date}T12:00:00`).getTime();

/**
 * Jour et phase du cycle pour chaque date (seulement si un début de règles est connu, ≤ 45 jours avant).
 * @param {DayPhys[]} days triés
 * @returns {Map<string, { day: number, phase: CyclePhase }>}
 */
export function cyclePhases(days) {
  /** @type {string[]} */
  const starts = [];
  let lastFlow = -Infinity;
  for (const d of days) {
    if (d.menstrual && FLOW.has(d.menstrual)) {
      if (t(d.date) - lastFlow > CONFIG.cycle.newCycleGapDays * DAY) starts.push(d.date);
      lastFlow = t(d.date);
    }
  }
  /** @type {Map<string, { day: number, phase: CyclePhase }>} */
  const out = new Map();
  for (const d of days) {
    const start = [...starts].reverse().find((s) => s <= d.date);
    if (!start) continue;
    const day = Math.round((t(d.date) - t(start)) / DAY) + 1;
    if (day > CONFIG.cycle.maxCycleDays) continue;
    const phase = day <= 5 ? 'menstrual' : day <= 13 ? 'follicular' : day <= 15 ? 'ovulation' : 'luteal';
    out.set(d.date, { day, phase });
  }
  return out;
}

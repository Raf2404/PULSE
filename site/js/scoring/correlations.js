// @ts-check
/**
 * Corrélations du journal du soir : compare la nuit suivante (VFC, score sommeil, récupération)
 * les soirs avec et sans un facteur. Statistiques simples pré-calculées : c'est tout ce que l'IA reçoit.
 * Formulation prudente (« en moyenne »), jamais causale ni médicale.
 */
import { mean, round } from './stats.js';
import { localDateKey } from '../data/schema.js';

/** @typedef {import('./scores.js').DayRecord} DayRecord */
/** @typedef {import('../data/schema.js').JournalEntry} JournalEntry */

export const FACTORS = /** @type {const} */ ({
  alcohol: { label: 'alcool', test: (/** @type {JournalEntry} */ j) => j.alcohol > 0 },
  lateCaffeine: { label: 'caféine tardive', test: (/** @type {JournalEntry} */ j) => j.lateCaffeine },
  screens: { label: 'écrans avant de dormir', test: (/** @type {JournalEntry} */ j) => j.screens },
  lateMeal: { label: 'repas tardif', test: (/** @type {JournalEntry} */ j) => j.lateMeal },
  stress: { label: 'stress élevé', test: (/** @type {JournalEntry} */ j) => j.stress >= 4 },
});

export const OUTCOMES = /** @type {const} */ ({
  hrv: { label: 'ta VFC', get: (/** @type {DayRecord} */ r) => r.hrv },
  sleepScore: { label: 'ton score sommeil', get: (/** @type {DayRecord} */ r) => r.sleepScore },
  recovery: { label: 'ta récupération', get: (/** @type {DayRecord} */ r) => r.recovery },
});

/**
 * @typedef {object} Correlation
 * @property {keyof typeof FACTORS} factor
 * @property {keyof typeof OUTCOMES} outcome
 * @property {number} diffPct       écart relatif moyen avec / sans (%)
 * @property {number} withMean
 * @property {number} withoutMean
 * @property {number} nWith
 * @property {number} nWithout
 * @property {string} text
 */

/** Minimum de soirs de chaque côté pour parler d'une tendance. */
export const MIN_EVENINGS = 3;

/**
 * @param {DayRecord[]} records @param {JournalEntry[]} journal
 * @returns {Correlation[]} triées par effet décroissant (une par facteur : l'effet le plus net)
 */
export function computeCorrelations(records, journal) {
  const byDate = new Map(records.map((r) => [r.date, r]));
  /** @type {{ j: JournalEntry, next: DayRecord }[]} */
  const pairs = [];
  for (const j of journal) {
    const d = new Date(`${j.date}T12:00:00`);
    d.setDate(d.getDate() + 1);
    const next = byDate.get(localDateKey(d));
    if (next && next.night) pairs.push({ j, next });
  }
  /** @type {Correlation[]} */
  const out = [];
  for (const [fk, f] of Object.entries(FACTORS)) {
    /** @type {Correlation | null} */
    let best = null;
    for (const [ok, o] of Object.entries(OUTCOMES)) {
      const yes = pairs.filter((p) => f.test(p.j)).map((p) => o.get(p.next)).filter((v) => v !== null).map(Number);
      const no = pairs.filter((p) => !f.test(p.j)).map((p) => o.get(p.next)).filter((v) => v !== null).map(Number);
      if (yes.length < MIN_EVENINGS || no.length < MIN_EVENINGS) continue;
      const my = /** @type {number} */ (mean(yes));
      const mn = /** @type {number} */ (mean(no));
      if (mn === 0) continue;
      const diffPct = round(((my - mn) / Math.abs(mn)) * 100);
      const c = {
        factor: /** @type {keyof typeof FACTORS} */ (fk),
        outcome: /** @type {keyof typeof OUTCOMES} */ (ok),
        diffPct,
        withMean: round(my, 1),
        withoutMean: round(mn, 1),
        nWith: yes.length,
        nWithout: no.length,
        text: `Les soirs avec ${f.label}, ${o.label} ${diffPct < 0 ? 'baisse' : 'monte'} de ${Math.abs(diffPct)} % en moyenne (${yes.length} soirs).`,
      };
      if (!best || Math.abs(c.diffPct) > Math.abs(best.diffPct)) best = c;
    }
    if (best && Math.abs(best.diffPct) >= 3) out.push(best);
  }
  return out.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
}

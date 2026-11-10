// @ts-check
/**
 * Résumés bruts (sans score) pour l'aperçu des données : dernière nuit, période couverte.
 * Fonctions pures, testées dans tests/summary.test.js.
 */

/** @typedef {import('./schema.js').Sample} Sample */
/** @typedef {import('./schema.js').SleepSample} SleepSample */
/** @typedef {import('./schema.js').QuantitySample} QuantitySample */

/**
 * @typedef {object} NightSummary
 * @property {number} start        coucher (ms)
 * @property {number} end          lever (ms)
 * @property {number} asleepMin    minutes endormi (hors éveils)
 * @property {number} inBedMin
 * @property {number | null} hrvAvg VFC moyenne pendant la nuit (ms)
 * @property {number | null} rhr    FC repos du jour du réveil (bpm)
 */

const MIN = 60 * 1000;
/** Écart max entre deux phases pour les considérer dans la même nuit. */
const NIGHT_GAP = 90 * MIN;
const ASLEEP_STAGES = new Set(['core', 'deep', 'rem', 'asleep']);

/** Une nuit dont la dernière phase date de moins de 30 min est considérée comme en cours. */
const IN_PROGRESS = 30 * MIN;

/**
 * Reconstitue la dernière nuit terminée à partir des phases de sommeil, de la VFC et de la FC repos.
 * Fonctionne avec ou sans échantillon « au lit » (certaines montres n'en écrivent pas).
 * Si `now` est fourni, une nuit encore en cours (ex. ouverture de l'app à 2 h du matin) est ignorée
 * au profit de la précédente.
 * @param {{ sleep: Sample[], hrv: Sample[], rhr: Sample[], now?: number }} input
 * @returns {NightSummary | null}
 */
export function summarizeLastNight({ sleep, hrv, rhr, now }) {
  const stages = /** @type {SleepSample[]} */ (sleep.filter((s) => s.type === 'sleep' && s.value !== 'in_bed'))
    .sort((a, b) => a.start - b.start);
  if (stages.length === 0) return null;

  // Regroupe les phases en nuits : un trou de plus de 90 min sépare deux nuits.
  /** @type {SleepSample[][]} */
  const nights = [[stages[0]]];
  for (const s of stages.slice(1)) {
    const current = nights[nights.length - 1];
    const currentEnd = Math.max(...current.map((x) => x.end));
    if (s.start - currentEnd <= NIGHT_GAP) current.push(s);
    else nights.push([s]);
  }
  /** @param {SleepSample[]} n */
  const endOf = (n) => Math.max(...n.map((x) => x.end));
  let night = nights[nights.length - 1];
  if (now !== undefined && now - endOf(night) < IN_PROGRESS) {
    if (nights.length < 2) return null;
    night = nights[nights.length - 2];
  }
  const sleepStart = night[0].start;
  const sleepEnd = endOf(night);

  // Fenêtre « au lit » qui recouvre ces phases, si elle existe.
  const inBed = sleep.filter((s) => s.type === 'sleep' && s.value === 'in_bed' && s.start <= sleepEnd && s.end >= sleepStart);
  const start = Math.min(sleepStart, ...inBed.map((s) => s.start));
  const end = Math.max(sleepEnd, ...inBed.map((s) => s.end));

  const asleepMin = night.filter((s) => ASLEEP_STAGES.has(s.value)).reduce((acc, s) => acc + (s.end - s.start) / MIN, 0);
  const nightHrv = /** @type {QuantitySample[]} */ (hrv).filter((s) => s.type === 'hrv' && s.start >= start && s.start <= end);
  const hrvAvg = nightHrv.length ? nightHrv.reduce((a, s) => a + s.value, 0) / nightHrv.length : null;

  // FC repos : première mesure après le coucher, dans les 24 h.
  const rhrAfter = /** @type {QuantitySample[]} */ (rhr)
    .filter((s) => s.type === 'rhr' && s.start >= start && s.start < start + 24 * 60 * MIN)
    .sort((a, b) => a.start - b.start);
  const rhrValue = rhrAfter.length ? rhrAfter[0].value : null;

  return {
    start,
    end,
    asleepMin: Math.round(asleepMin),
    inBedMin: Math.round((end - start) / MIN),
    hrvAvg: hrvAvg === null ? null : Math.round(hrvAvg * 10) / 10,
    rhr: rhrValue,
  };
}

/**
 * Durée lisible : 452 → « 7 h 32 ».
 * @param {number} minutes
 */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

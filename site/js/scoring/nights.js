// @ts-check
/**
 * Reconstitution des nuits à partir des phases de sommeil (toutes sources confondues).
 * - Les phases d'une même source sont regroupées en sommeils (un trou > 90 min sépare deux sommeils).
 * - Pour chaque date de réveil, on garde le sommeil principal : celui d'une source qui donne
 *   les phases détaillées (profond/paradoxal) de préférence, puis le plus long.
 * - Si seule une fenêtre « au lit » existe (iPhone sans montre), elle sert de repli (précision réduite).
 */
import { CONFIG } from './config.js';
import { localDateKey } from '../data/schema.js';

/** @typedef {import('../data/schema.js').Sample} Sample */
/** @typedef {import('../data/schema.js').SleepSample} SleepSample */
/** @typedef {import('../data/schema.js').SleepStage} SleepStage */

/**
 * @typedef {object} Night
 * @property {string} date          date du réveil (AAAA-MM-JJ, heure locale)
 * @property {number} start         coucher (début « au lit » ou endormissement)
 * @property {number} end           lever
 * @property {number} sleepStart    première phase de sommeil
 * @property {number} sleepEnd      fin de la dernière phase
 * @property {number} inBedMin
 * @property {number} asleepMin
 * @property {number} awakeMin
 * @property {number} deepMin
 * @property {number} remMin
 * @property {number} coreMin
 * @property {boolean} hasStages    phases détaillées disponibles
 * @property {boolean} inBedOnly    seulement une fenêtre « au lit » (pas de mesure du sommeil réel)
 * @property {string} source
 * @property {{ stage: SleepStage, start: number, end: number }[]} segments
 */

const MIN = 60000;
const ASLEEP = new Set(['core', 'deep', 'rem', 'asleep']);

/**
 * @param {SleepSample[]} stages triées par début, une seule source
 * @returns {SleepSample[][]}
 */
function cluster(stages) {
  /** @type {SleepSample[][]} */
  const out = [];
  let end = -Infinity;
  for (const s of stages) {
    const startsNew = out.length === 0 || s.start - end > CONFIG.sleep.gapMin * MIN;
    if (startsNew) out.push([s]);
    else out[out.length - 1].push(s);
    end = startsNew ? s.end : Math.max(end, s.end);
  }
  return out;
}

/**
 * Supprime les chevauchements dans une liste de phases (la phase la plus « profonde » gagne
 * rarement : on garde simplement l'ordre chronologique et on coupe ce qui déborde).
 * @param {SleepSample[]} stages
 */
function flatten(stages) {
  /** @type {{ stage: SleepStage, start: number, end: number }[]} */
  const segs = [];
  let cursor = -Infinity;
  for (const s of [...stages].sort((a, b) => a.start - b.start)) {
    const start = Math.max(s.start, cursor);
    if (s.end <= start) continue;
    segs.push({ stage: s.value, start, end: s.end });
    cursor = s.end;
  }
  return segs;
}

/**
 * @param {SleepSample[]} group phases d'un même sommeil (une source)
 * @param {SleepSample[]} inBedAll fenêtres « au lit » de toutes les sources
 * @param {boolean} inBedOnly
 * @returns {Night}
 */
function toNight(group, inBedAll, inBedOnly) {
  const segments = flatten(group);
  const sleepStart = segments[0].start;
  const sleepEnd = segments[segments.length - 1].end;
  /** @param {(s: { stage: SleepStage }) => boolean} pred */
  const minutes = (pred) => segments.filter(pred).reduce((a, s) => a + (s.end - s.start) / MIN, 0);

  const overlapping = inBedAll.filter((b) => b.start < sleepEnd && b.end > sleepStart);
  const start = Math.min(sleepStart, ...overlapping.map((b) => b.start));
  const end = Math.max(sleepEnd, ...overlapping.map((b) => b.end));
  const deepMin = minutes((s) => s.stage === 'deep');
  const remMin = minutes((s) => s.stage === 'rem');

  return {
    date: localDateKey(sleepEnd),
    start,
    end,
    sleepStart,
    sleepEnd,
    inBedMin: Math.round((end - start) / MIN),
    asleepMin: Math.round(inBedOnly ? (sleepEnd - sleepStart) / MIN : minutes((s) => ASLEEP.has(s.stage))),
    awakeMin: Math.round(minutes((s) => s.stage === 'awake')),
    deepMin: Math.round(deepMin),
    remMin: Math.round(remMin),
    coreMin: Math.round(minutes((s) => s.stage === 'core')),
    hasStages: deepMin + remMin > 0,
    inBedOnly,
    source: group[0].source,
    segments: inBedOnly ? [] : segments,
  };
}

/**
 * Construit la nuit principale de chaque date de réveil.
 * @param {Sample[]} sleepSamples mesures de type « sleep »
 * @returns {Map<string, Night>}
 */
export function buildNights(sleepSamples) {
  const sleep = /** @type {SleepSample[]} */ (sleepSamples.filter((s) => s.type === 'sleep'));
  const inBedAll = sleep.filter((s) => s.value === 'in_bed');

  /** @type {Map<string, SleepSample[]>} */
  const bySource = new Map();
  for (const s of sleep) {
    if (s.value === 'in_bed') continue;
    const list = bySource.get(s.source) ?? [];
    list.push(s);
    bySource.set(s.source, list);
  }

  /** @type {Night[]} */
  const candidates = [];
  for (const list of bySource.values()) {
    list.sort((a, b) => a.start - b.start);
    for (const group of cluster(list)) candidates.push(toNight(group, inBedAll, false));
  }
  // Repli : fenêtres « au lit » sans aucune phase mesurée autour.
  /** @type {Map<string, SleepSample[]>} */
  const inBedBySource = new Map();
  for (const b of inBedAll) {
    const list = inBedBySource.get(b.source) ?? [];
    list.push(b);
    inBedBySource.set(b.source, list);
  }
  for (const list of inBedBySource.values()) {
    list.sort((a, b) => a.start - b.start);
    for (const group of cluster(list)) {
      const n = toNight(group, [], true);
      if (!candidates.some((c) => !c.inBedOnly && c.sleepStart < n.sleepEnd && c.sleepEnd > n.sleepStart)) candidates.push(n);
    }
  }

  /** @type {Map<string, Night>} */
  const nights = new Map();
  for (const n of candidates) {
    if (n.asleepMin < CONFIG.sleep.mainSleepMinMin) continue; // siestes
    const current = nights.get(n.date);
    if (!current || better(n, current)) nights.set(n.date, n);
  }
  return nights;
}

/**
 * @param {Night} a @param {Night} b
 * @returns {boolean} a est-elle une meilleure nuit principale que b ?
 */
function better(a, b) {
  if (a.inBedOnly !== b.inBedOnly) return !a.inBedOnly;
  if (a.hasStages !== b.hasStages) return a.hasStages;
  return a.asleepMin > b.asleepMin;
}

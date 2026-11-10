// @ts-check
/**
 * Lecture en flux de l'export Apple Santé (export.xml), sans charger le fichier entier :
 * on reçoit des morceaux de texte, on repère les balises <Record>, <Workout> et <WorkoutStatistics>,
 * et on produit des mesures au format commun (schema.js). Fonctions pures, testées dans node.
 */
import { validateSample, validateWorkout } from '../data/schema.js';

/** @typedef {import('../data/schema.js').Sample} Sample */
/** @typedef {import('../data/schema.js').Workout} Workout */
/** @typedef {import('../data/schema.js').WorkoutType} WorkoutType */

/**
 * Convertit une date Apple « 2026-11-09 23:10:00 +0100 » en timestamp (ms). Rapide, sans Date.parse.
 * @param {string} s
 * @returns {number}
 */
export function parseAppleDate(s) {
  if (s.length < 19) return Number.NaN;
  const y = +s.slice(0, 4);
  const mo = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  const h = +s.slice(11, 13);
  const mi = +s.slice(14, 16);
  const se = +s.slice(17, 19);
  let offsetMin = 0;
  const tz = s.slice(20).trim();
  if (/^[+-]\d{4}$/.test(tz)) {
    offsetMin = (+tz.slice(1, 3) * 60 + +tz.slice(3, 5)) * (tz[0] === '-' ? -1 : 1);
  }
  return Date.UTC(y, mo - 1, d, h, mi, se) - offsetMin * 60000;
}

/** @param {string} s */
function decodeEntities(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return '\'';
    return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

const ATTR_RE = /([\w:]+)="([^"]*)"/g;

/**
 * Attributs d'une balise.
 * @param {string} tag
 * @returns {Record<string, string>}
 */
export function parseAttributes(tag) {
  /** @type {Record<string, string>} */
  const out = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(tag)) !== null) out[m[1]] = decodeEntities(m[2]);
  return out;
}

/** @typedef {(value: number, unit: string) => number | null} Convert */

/** @type {Convert} */
const same = (v) => v;
/** Fraction (0,97) ou pourcentage (97) → pourcentage. @type {Convert} */
const percent = (v) => (v <= 1 ? v * 100 : v);

/**
 * Types quantitatifs HealthKit → type PULSE, unité, conversion.
 * @type {Record<string, { type: import('../data/schema.js').QuantityType, unit: string, convert: Convert }>}
 */
export const QUANTITY_MAP = {
  HKQuantityTypeIdentifierHeartRate: { type: 'hr', unit: 'bpm', convert: same },
  HKQuantityTypeIdentifierRestingHeartRate: { type: 'rhr', unit: 'bpm', convert: same },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { type: 'hrv', unit: 'ms', convert: same },
  HKQuantityTypeIdentifierRespiratoryRate: { type: 'resp', unit: '/min', convert: same },
  HKQuantityTypeIdentifierOxygenSaturation: { type: 'spo2', unit: '%', convert: percent },
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: {
    type: 'wrist_temp', unit: '°C', convert: (v, u) => (u.toLowerCase().includes('f') ? (v - 32) / 1.8 : v),
  },
  HKQuantityTypeIdentifierStepCount: { type: 'steps', unit: 'count', convert: same },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    type: 'active_energy', unit: 'kcal', convert: (v, u) => (u === 'kJ' ? v / 4.184 : v),
  },
  HKQuantityTypeIdentifierAppleExerciseTime: { type: 'exercise_min', unit: 'min', convert: same },
  HKQuantityTypeIdentifierVO2Max: { type: 'vo2max', unit: 'mL/kg/min', convert: same },
  HKQuantityTypeIdentifierBodyMass: {
    type: 'weight', unit: 'kg', convert: (v, u) => (u === 'lb' ? v * 0.45359237 : u === 'g' ? v / 1000 : v),
  },
  HKQuantityTypeIdentifierBodyFatPercentage: { type: 'body_fat', unit: '%', convert: percent },
  HKQuantityTypeIdentifierDietaryWater: {
    type: 'water', unit: 'mL', convert: (v, u) => (u === 'L' ? v * 1000 : u === 'fl_oz_us' ? v * 29.5735 : u === 'cL' ? v * 10 : v),
  },
  HKQuantityTypeIdentifierDietaryProtein: { type: 'protein', unit: 'g', convert: (v, u) => (u === 'mg' ? v / 1000 : v) },
};

/** Phases de sommeil HealthKit → PULSE. */
export const SLEEP_MAP = /** @type {Record<string, import('../data/schema.js').SleepStage>} */ ({
  HKCategoryValueSleepAnalysisInBed: 'in_bed',
  HKCategoryValueSleepAnalysisAsleep: 'asleep',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleep',
  HKCategoryValueSleepAnalysisAsleepCore: 'core',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAwake: 'awake',
});

const FLOW_MAP = /** @type {Record<string, import('../data/schema.js').MenstrualSample['value']>} */ ({
  HKCategoryValueMenstrualFlowNone: 'none',
  HKCategoryValueMenstrualFlowLight: 'light',
  HKCategoryValueMenstrualFlowMedium: 'medium',
  HKCategoryValueMenstrualFlowHeavy: 'heavy',
  HKCategoryValueMenstrualFlowUnspecified: 'unspecified',
});

/** Types de séances HealthKit → PULSE. */
const WORKOUT_MAP = /** @type {Record<string, WorkoutType>} */ ({
  Running: 'running',
  Cycling: 'cycling',
  HandCycling: 'cycling',
  TraditionalStrengthTraining: 'strength',
  FunctionalStrengthTraining: 'strength',
  CoreTraining: 'strength',
  Walking: 'walking',
  Hiking: 'hiking',
  Swimming: 'swimming',
  Rowing: 'rowing',
  HighIntensityIntervalTraining: 'hiit',
  CrossTraining: 'hiit',
  MixedCardio: 'hiit',
  Yoga: 'yoga',
  Pilates: 'yoga',
  MindAndBody: 'yoga',
  Flexibility: 'mobility',
  Cooldown: 'mobility',
  Soccer: 'team_sport',
  Basketball: 'team_sport',
  Rugby: 'team_sport',
  Handball: 'team_sport',
  Volleyball: 'team_sport',
  Hockey: 'team_sport',
  AmericanFootball: 'team_sport',
  Tennis: 'racket',
  Badminton: 'racket',
  TableTennis: 'racket',
  Squash: 'racket',
  Racquetball: 'racket',
  Pickleball: 'racket',
});

/** @param {string} hk */
export function workoutTypeOf(hk) {
  return WORKOUT_MAP[hk.replace('HKWorkoutActivityType', '')] ?? 'other';
}

/** @param {number} v @param {string} unit */
function toKm(v, unit) {
  if (unit === 'mi') return v * 1.609344;
  if (unit === 'm') return v / 1000;
  if (unit === 'yd') return v * 0.0009144;
  return v;
}

/** @param {number} v @param {string} unit */
function toMinutes(v, unit) {
  if (unit === 'hr' || unit === 'h') return v * 60;
  if (unit === 's') return v / 60;
  return v;
}

/**
 * @typedef {object} ParseStats
 * @property {Record<string, number>} counts   mesures gardées par type PULSE
 * @property {number} workouts
 * @property {number} skippedOld             mesures plus anciennes que la fenêtre
 * @property {number} invalid
 * @property {string[]} sources
 * @property {number | null} first
 * @property {number | null} last
 * @property {number} bytes                  caractères lus
 */

/**
 * Analyseur incrémental de export.xml.
 */
export class HealthXmlParser {
  /**
   * @param {{ cutoff: number, onSample: (s: Sample) => void, onWorkout: (w: Workout) => void }} opts
   *   cutoff : on ignore ce qui se termine avant (ms)
   */
  constructor(opts) {
    this.cutoff = opts.cutoff;
    this.onSample = opts.onSample;
    this.onWorkout = opts.onWorkout;
    this.buf = '';
    /** Préfixe de date (« AAAA-MM-JJ ») sous lequel tout est ignoré sans analyse complète. */
    const c = new Date(opts.cutoff - 2 * 86400000);
    this.cutoffPrefix = `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, '0')}-${String(c.getUTCDate()).padStart(2, '0')}`;
    /** @type {{ attrs: Record<string, string>, stats: Record<string, string>[] } | null} */
    this.workout = null;
    /** @type {Set<string>} */
    this.sourceSet = new Set();
    /** @type {ParseStats} */
    this.stats = { counts: {}, workouts: 0, skippedOld: 0, invalid: 0, sources: [], first: null, last: null, bytes: 0 };
  }

  /** @param {string} text morceau de texte suivant */
  push(text) {
    this.stats.bytes += text.length;
    this.buf += text;
    let pos = 0;
    for (;;) {
      const lt = this.buf.indexOf('<', pos);
      if (lt === -1) { pos = this.buf.length; break; }
      const gt = this.buf.indexOf('>', lt);
      if (gt === -1) { pos = lt; break; }
      this.tag(this.buf.slice(lt + 1, gt));
      pos = gt + 1;
    }
    this.buf = this.buf.slice(pos);
  }

  /** Fin du fichier. */
  end() {
    this.buf = '';
    this.stats.sources = [...this.sourceSet].sort();
    return this.stats;
  }

  /** @param {string} t contenu entre < et > */
  tag(t) {
    if (t.startsWith('Record ')) this.record(t);
    else if (t.startsWith('Workout ')) this.workoutStart(t);
    else if (t.startsWith('WorkoutStatistics ') && this.workout) this.workout.stats.push(parseAttributes(t));
    else if (t === '/Workout' && this.workout) this.workoutEnd();
  }

  /** @param {string} t */
  record(t) {
    // Filtrage rapide sur la date de fin avant toute analyse détaillée.
    const ei = t.indexOf('endDate="');
    if (ei !== -1 && t.slice(ei + 9, ei + 19) < this.cutoffPrefix) { this.stats.skippedOld++; return; }
    const ti = t.indexOf('type="');
    if (ti === -1) return;
    const hkType = t.slice(ti + 6, t.indexOf('"', ti + 6));
    const q = QUANTITY_MAP[hkType];
    const isSleep = hkType === 'HKCategoryTypeIdentifierSleepAnalysis';
    const isFlow = hkType === 'HKCategoryTypeIdentifierMenstrualFlow';
    const isMindful = hkType === 'HKCategoryTypeIdentifierMindfulSession';
    if (!q && !isSleep && !isFlow && !isMindful) return;

    const a = parseAttributes(t);
    const start = parseAppleDate(a.startDate ?? '');
    const end = parseAppleDate(a.endDate ?? a.startDate ?? '');
    if (end < this.cutoff) { this.stats.skippedOld++; return; }
    const source = (a.sourceName ?? '').trim() || 'Inconnu';

    /** @type {Sample | null} */
    let sample = null;
    if (q) {
      const raw = Number(a.value);
      const value = q.convert(raw, a.unit ?? '');
      if (value === null || !Number.isFinite(value)) { this.stats.invalid++; return; }
      sample = { type: q.type, value: Math.round(value * 1000) / 1000, unit: q.unit, start, end, source };
    } else if (isSleep) {
      const stage = SLEEP_MAP[a.value ?? ''];
      if (!stage) { this.stats.invalid++; return; }
      sample = { type: 'sleep', value: stage, unit: '', start, end, source };
    } else if (isFlow) {
      const flow = FLOW_MAP[a.value ?? ''];
      if (!flow) { this.stats.invalid++; return; }
      sample = { type: 'menstrual', value: flow, unit: '', start, end, source };
    } else {
      sample = { type: 'mindful', value: Math.round(((end - start) / 60000) * 10) / 10, unit: 'min', start, end, source };
    }
    if (!validateSample(sample).ok) { this.stats.invalid++; return; }
    this.count(sample.type, start, source);
    this.onSample(sample);
  }

  /** @param {string} t */
  workoutStart(t) {
    const a = parseAttributes(t);
    if (t.endsWith('/')) { this.workout = { attrs: a, stats: [] }; this.workoutEnd(); return; }
    this.workout = { attrs: a, stats: [] };
  }

  workoutEnd() {
    const w = this.workout;
    this.workout = null;
    if (!w) return;
    const a = w.attrs;
    const start = parseAppleDate(a.startDate ?? '');
    const end = parseAppleDate(a.endDate ?? '');
    if (!(end >= this.cutoff)) { this.stats.skippedOld++; return; }
    /** @param {string} suffix */
    const stat = (suffix) => w.stats.find((s) => (s.type ?? '').endsWith(suffix));
    const energy = stat('ActiveEnergyBurned');
    const hr = stat('HeartRate');
    const dist = w.stats.find((s) => (s.type ?? '').includes('Distance'));
    let calories = energy?.sum ? Number(energy.sum) * (energy.unit === 'kJ' ? 1 / 4.184 : 1) : a.totalEnergyBurned ? Number(a.totalEnergyBurned) * (a.totalEnergyBurnedUnit === 'kJ' ? 1 / 4.184 : 1) : null;
    let distanceKm = dist?.sum ? toKm(Number(dist.sum), dist.unit ?? 'km') : a.totalDistance ? toKm(Number(a.totalDistance), a.totalDistanceUnit ?? 'km') : null;
    if (calories !== null && !Number.isFinite(calories)) calories = null;
    if (distanceKm !== null && (!Number.isFinite(distanceKm) || distanceKm === 0)) distanceKm = null;
    const avgHr = hr?.average ? Math.round(Number(hr.average)) : null;
    const maxHr = hr?.maximum ? Math.round(Number(hr.maximum)) : null;
    const durationMin = a.duration ? toMinutes(Number(a.duration), a.durationUnit ?? 'min') : (end - start) / 60000;
    /** @type {Workout} */
    const workout = {
      type: workoutTypeOf(a.workoutActivityType ?? ''),
      start,
      end,
      durationMin: Math.round(durationMin * 10) / 10,
      calories: calories === null ? null : Math.round(calories),
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
      avgHr: avgHr !== null && Number.isFinite(avgHr) ? avgHr : null,
      maxHr: maxHr !== null && Number.isFinite(maxHr) ? Math.max(maxHr, avgHr ?? 0) : null,
      source: (a.sourceName ?? '').trim() || 'Inconnu',
    };
    if (!validateWorkout(workout).ok) { this.stats.invalid++; return; }
    this.stats.workouts++;
    this.count('workout', start, workout.source);
    this.onWorkout(workout);
  }

  /** @param {string} type @param {number} start @param {string} source */
  count(type, start, source) {
    if (type !== 'workout') this.stats.counts[type] = (this.stats.counts[type] ?? 0) + 1;
    this.sourceSet.add(source);
    if (this.stats.first === null || start < this.stats.first) this.stats.first = start;
    if (this.stats.last === null || start > this.stats.last) this.stats.last = start;
  }
}

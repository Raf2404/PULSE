// @ts-check
/**
 * Agrégats physiologiques par jour, calculés à partir des mesures brutes.
 * - VFC, FC repos, respiration, SpO2, température : uniquement pendant la nuit principale.
 * - Pas et énergie : par jour, en gardant la source la plus complète (iPhone + montre se recoupent).
 * - Charge cardio (TRIMP d'Edwards) et effort sur toute la journée, et pour chaque séance.
 * - FC, pas et séances heure par heure (moniteur de stress).
 */
import { CONFIG } from './config.js';
import { buildNights } from './nights.js';
import { mean, round, sum } from './stats.js';
import { localDateKey } from '../data/schema.js';

/** @typedef {import('../data/schema.js').Sample} Sample */
/** @typedef {import('../data/schema.js').QuantitySample} QuantitySample */
/** @typedef {import('../data/schema.js').Workout} Workout */
/** @typedef {import('./nights.js').Night} Night */

/**
 * @typedef {object} WorkoutDetail
 * @property {Workout['type']} type
 * @property {number} start
 * @property {number} end
 * @property {number} durationMin
 * @property {number | null} calories
 * @property {number | null} distanceKm
 * @property {number | null} avgHr
 * @property {number | null} maxHr
 * @property {string} source
 * @property {number} trimp
 * @property {number} strain
 * @property {number[]} zoneMin minutes en Z1..Z5
 */

/**
 * @typedef {object} DayPhys
 * @property {string} date
 * @property {Night | null} night
 * @property {number | null} hrv        VFC nocturne moyenne (ms, SDNN)
 * @property {number | null} rhr        FC repos (bpm)
 * @property {'night' | 'apple' | null} rhrSource
 * @property {number | null} resp
 * @property {number | null} spo2
 * @property {number | null} tempAbs    température au poignet (°C)
 * @property {number | null} steps
 * @property {number | null} activeKcal
 * @property {number} trimp
 * @property {number} strain            effort 0–21
 * @property {number[]} zoneMin
 * @property {WorkoutDetail[]} workouts
 * @property {(number | null)[]} hrByHour    FC moyenne par heure (24)
 * @property {number[]} stepsByHour
 * @property {boolean[]} workoutByHour
 * @property {number | null} vo2max
 * @property {number | null} weight
 * @property {number | null} water      mL
 * @property {number | null} protein    g
 * @property {string | null} menstrual  flux saisi ce jour-là
 * @property {number} mindfulMin
 * @property {boolean} hasHr
 */

const MIN = 60000;
const DAY = 24 * 60 * MIN;

/**
 * Bornes basses des zones cardio (bpm), méthode Karvonen.
 * @param {number} hrRest @param {number} hrMax
 */
export function zoneFloors(hrRest, hrMax) {
  return CONFIG.strain.zones.map((p) => hrRest + p * (hrMax - hrRest));
}

/**
 * Zone (0 = sous Z1, 1..5) d'une fréquence cardiaque.
 * @param {number} hr @param {number[]} floors
 */
export function zoneOf(hr, floors) {
  for (let z = floors.length - 1; z >= 0; z--) if (hr >= floors[z]) return z + 1;
  return 0;
}

/**
 * Effort 0–21 à partir d'une charge TRIMP (compression logarithmique).
 * @param {number} trimp
 */
export function strainFromTrimp(trimp) {
  return round(CONFIG.strain.max * (1 - Math.exp(-trimp / CONFIG.strain.k)), 1);
}

/**
 * TRIMP d'Edwards pondéré par le temps : chaque mesure de FC compte jusqu'à la suivante
 * (plafonné à quelques minutes pour les mesures isolées).
 * @param {QuantitySample[]} hr triées
 * @param {number[]} floors
 * @param {number} from @param {number} to bornes de la période
 */
export function trimpOf(hr, floors, from, to) {
  const zoneMin = [0, 0, 0, 0, 0];
  const cap = CONFIG.strain.maxSampleGapMin * MIN;
  for (let i = 0; i < hr.length; i++) {
    const s = hr[i];
    if (s.start < from || s.start >= to) continue;
    const next = i + 1 < hr.length ? hr[i + 1].start : s.start + MIN;
    const dur = Math.min(Math.max(next - s.start, 0), cap, to - s.start);
    const z = zoneOf(s.value, floors);
    if (z > 0) zoneMin[z - 1] += dur / MIN;
  }
  const trimp = zoneMin.reduce((acc, m, i) => acc + m * CONFIG.strain.zoneWeights[i], 0);
  return { trimp: round(trimp, 1), zoneMin: zoneMin.map((m) => round(m, 1)) };
}

/**
 * Index trié pour retrouver vite les mesures d'une période.
 * @param {QuantitySample[]} list triée par début
 * @param {number} from @param {number} to
 */
function slice(list, from, to) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start < from) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < list.length && list[i].start < to; i++) out.push(list[i]);
  return out;
}

/**
 * Somme par jour en gardant, pour chaque jour, la source la plus élevée.
 * @param {QuantitySample[]} list
 * @returns {Map<string, number>}
 */
function dailyMaxSource(list) {
  /** @type {Map<string, Map<string, number>>} */
  const acc = new Map();
  for (const s of list) {
    const d = localDateKey(s.start);
    const m = acc.get(d) ?? new Map();
    m.set(s.source, (m.get(s.source) ?? 0) + s.value);
    acc.set(d, m);
  }
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const [d, m] of acc) out.set(d, Math.max(...m.values()));
  return out;
}

/**
 * Supprime les séances en double (même séance enregistrée par deux apps).
 * @param {Workout[]} workouts
 */
export function dedupeWorkouts(workouts) {
  const sorted = [...workouts].sort((a, b) => a.start - b.start);
  /** @type {Workout[]} */
  const kept = [];
  for (const w of sorted) {
    const dup = kept.findIndex((k) => {
      const overlap = Math.min(k.end, w.end) - Math.max(k.start, w.start);
      return overlap > 0.5 * Math.min(k.end - k.start, w.end - w.start);
    });
    if (dup === -1) kept.push(w);
    else if ((w.avgHr !== null && kept[dup].avgHr === null) || (w.end - w.start > kept[dup].end - kept[dup].start && (w.avgHr !== null) === (kept[dup].avgHr !== null))) kept[dup] = w;
  }
  return kept;
}

/**
 * @typedef {object} PhysInput
 * @property {Map<string, Sample[]>} byType mesures par type, triées par début
 * @property {Workout[]} workouts
 * @property {number} hrMax
 * @property {number | null} hrRest FC repos de référence pour les zones (sinon médiane des nuits)
 * @property {string[]} [dates] limiter le calcul à ces jours
 */

/**
 * Calcule les agrégats de chaque jour couvert par les données.
 * @param {PhysInput} input
 * @returns {{ days: DayPhys[], hrRestUsed: number }}
 */
export function buildDays(input) {
  const { byType } = input;
  /** @param {string} t */
  const q = (t) => /** @type {QuantitySample[]} */ (byType.get(t) ?? []);
  const nights = buildNights(byType.get('sleep') ?? []);
  const hr = q('hr');
  const appleRhr = new Map(q('rhr').map((s) => [localDateKey(s.start), s.value]));

  // Toutes les dates présentes dans les données.
  const dateSet = new Set(input.dates ?? []);
  if (!input.dates) {
    for (const list of byType.values()) for (const s of list) dateSet.add(localDateKey(s.start));
    for (const n of nights.keys()) dateSet.add(n);
    for (const w of input.workouts) dateSet.add(localDateKey(w.start));
  }
  const dates = [...dateSet].sort();

  // FC repos nocturne pour chaque nuit (sert aussi de FC repos de référence pour les zones).
  /** @type {Map<string, number>} */
  const nightRhr = new Map();
  for (const [d, n] of nights) {
    const values = slice(hr, n.sleepStart, n.sleepEnd).map((s) => s.value).sort((a, b) => a - b);
    if (values.length >= 3) {
      const k = Math.max(3, Math.round(values.length * CONFIG.rhr.lowestFraction));
      nightRhr.set(d, round(/** @type {number} */ (mean(values.slice(0, k))), 1));
    }
  }
  const restCandidates = [...nightRhr.values(), ...appleRhr.values()].sort((a, b) => a - b);
  const hrRestUsed = input.hrRest ?? (restCandidates.length ? restCandidates[Math.floor(restCandidates.length / 2)] : 60);
  const floors = zoneFloors(hrRestUsed, input.hrMax);

  const steps = dailyMaxSource(q('steps'));
  const energy = dailyMaxSource(q('active_energy'));
  const water = dailyMaxSource(q('water'));
  const protein = dailyMaxSource(q('protein'));
  const mindful = dailyMaxSource(q('mindful'));
  const workouts = dedupeWorkouts(input.workouts);

  /** @type {DayPhys[]} */
  const days = [];
  for (const date of dates) {
    const [y, m, d] = date.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d).getTime();
    const dayEnd = new Date(y, m - 1, d + 1).getTime();
    const night = nights.get(date) ?? null;

    /** @param {string} t @returns {number | null} */
    const nightMean = (t) => {
      if (!night) return null;
      const v = slice(q(t), night.start, night.end + MIN).map((s) => s.value);
      return v.length ? /** @type {number} */ (mean(v)) : null;
    };

    const dayHr = slice(hr, dayStart, dayEnd);
    const { trimp, zoneMin } = trimpOf(dayHr, floors, dayStart, dayEnd);

    const dayWorkouts = workouts.filter((w) => w.start >= dayStart && w.start < dayEnd).map((w) => {
      const whr = slice(hr, w.start, w.end);
      let t;
      if (whr.length >= 3) t = trimpOf(whr, floors, w.start, w.end);
      else {
        // Pas de FC détaillée : on suppose toute la séance à la FC moyenne.
        const z = w.avgHr ? zoneOf(w.avgHr, floors) : 0;
        const zm = [0, 0, 0, 0, 0];
        if (z > 0) zm[z - 1] = w.durationMin;
        t = { trimp: z > 0 ? w.durationMin * CONFIG.strain.zoneWeights[z - 1] : 0, zoneMin: zm };
      }
      return { ...w, trimp: t.trimp, strain: strainFromTrimp(t.trimp), zoneMin: t.zoneMin };
    });
    // La journée compte au moins la charge de ses séances (si la FC de la journée est incomplète).
    const workoutTrimp = sum(dayWorkouts.map((w) => w.trimp));
    const dayTrimp = Math.max(trimp, workoutTrimp);

    /** @type {(number | null)[]} */
    const hrByHour = [];
    const stepsByHour = [];
    const workoutByHour = [];
    const daySteps = slice(q('steps'), dayStart, dayEnd);
    for (let h = 0; h < 24; h++) {
      const from = new Date(y, m - 1, d, h).getTime();
      const to = new Date(y, m - 1, d, h + 1).getTime();
      const v = dayHr.filter((s) => s.start >= from && s.start < to).map((s) => s.value);
      hrByHour.push(v.length ? round(/** @type {number} */ (mean(v)), 1) : null);
      stepsByHour.push(Math.round(sum(daySteps.filter((s) => s.start >= from && s.start < to).map((s) => s.value))));
      workoutByHour.push(dayWorkouts.some((w) => w.start < to && w.end > from));
    }

    const temp = nightMean('wrist_temp');
    const spo2 = nightMean('spo2');
    const resp = nightMean('resp');
    const hrv = nightMean('hrv');
    const rhrNight = nightRhr.get(date) ?? null;
    const rhrApple = appleRhr.get(date) ?? null;
    /** @param {string} t */
    const lastOfDay = (t) => {
      const v = slice(q(t), dayStart, dayEnd);
      return v.length ? v[v.length - 1].value : null;
    };
    const flow = /** @type {Sample[]} */ (byType.get('menstrual') ?? []).filter((s) => s.start >= dayStart && s.start < dayEnd);

    days.push({
      date,
      night,
      hrv: hrv === null ? null : round(hrv, 1),
      rhr: rhrNight ?? rhrApple,
      rhrSource: rhrNight !== null ? 'night' : rhrApple !== null ? 'apple' : null,
      resp: resp === null ? null : round(resp, 1),
      spo2: spo2 === null ? null : round(spo2, 1),
      tempAbs: temp === null ? null : round(temp, 2),
      steps: steps.has(date) ? Math.round(/** @type {number} */ (steps.get(date))) : null,
      activeKcal: energy.has(date) ? Math.round(/** @type {number} */ (energy.get(date))) : null,
      trimp: dayTrimp,
      strain: strainFromTrimp(dayTrimp),
      zoneMin,
      workouts: dayWorkouts,
      hrByHour,
      stepsByHour,
      workoutByHour,
      vo2max: lastOfDay('vo2max'),
      weight: lastOfDay('weight'),
      water: water.has(date) ? Math.round(/** @type {number} */ (water.get(date))) : null,
      protein: protein.has(date) ? Math.round(/** @type {number} */ (protein.get(date))) : null,
      menstrual: flow.length ? String(flow[flow.length - 1].value) : null,
      mindfulMin: Math.round(mindful.get(date) ?? 0),
      hasHr: dayHr.length > 0,
    });
  }
  return { days, hrRestUsed: round(hrRestUsed, 1) };
}

/**
 * Regroupe une liste de mesures par type, triées par début.
 * @param {Sample[]} samples
 */
export function groupByType(samples) {
  /** @type {Map<string, Sample[]>} */
  const out = new Map();
  for (const s of samples) {
    const list = out.get(s.type) ?? [];
    list.push(s);
    out.set(s.type, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.start - b.start);
  return out;
}

export { DAY };

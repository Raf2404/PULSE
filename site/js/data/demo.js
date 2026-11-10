// @ts-check
/**
 * Générateur de données démo : 90 jours réalistes, au même format que l'import Apple Santé.
 *
 * Modèle (volontairement simple mais cohérent) :
 * - VFC nocturne (SDNN) autour de 55 ms, bruit log-normal autocorrélé, légère progression de forme.
 * - FC repos autour de 54 bpm, effets opposés à la VFC.
 * - Effets : alcool la veille (VFC −9 % par verre, FC +2,5 bpm), grosse séance la veille,
 *   nuit courte, et un épisode « malade » de 4 jours (FC +8, température +0,6 °C, VFC −30 %,
 *   respiration +2/min, SpO2 −2 %), précédé d'une nuit de signes avant-coureurs.
 * - Sommeil : coucher ~23 h en semaine, plus tard le week-end, cycles de ~90 min
 *   (profond surtout en début de nuit, paradoxal en fin de nuit), quelques réveils.
 * - Séances : semaine type muscu / course / vélo, ~12 % de séances sautées, aucune pendant la maladie.
 * - Deux nuits sans montre (données manquantes) pour tester la robustesse.
 *
 * Déterministe : même graine + même date de fin = mêmes données.
 */
import { localDateKey } from './schema.js';

/** @typedef {import('./schema.js').Sample} Sample */
/** @typedef {import('./schema.js').QuantitySample} QuantitySample */
/** @typedef {import('./schema.js').SleepSample} SleepSample */
/** @typedef {import('./schema.js').SleepStage} SleepStage */
/** @typedef {import('./schema.js').Workout} Workout */
/** @typedef {import('./schema.js').WorkoutType} WorkoutType */
/** @typedef {import('./schema.js').JournalEntry} JournalEntry */

export const DEMO_SOURCE = 'Montre démo PULSE';

/** Profil fictif utilisé par la démo. */
export const DEMO_PROFILE = Object.freeze({
  firstName: 'Alex',
  birthYear: 1994,
  sex: 'm',
  heightCm: 178,
  weightKg: 74,
  hrMax: 190,
  hrRest: 54,
  hrvBase: 55,
});

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * Vérité terrain par nuit/jour, pour les tests et le débogage (jamais affichée telle quelle).
 * @typedef {object} DemoDayTruth
 * @property {string} date               jour (le matin du réveil)
 * @property {boolean} sick
 * @property {boolean} prodrome          nuit de signes avant-coureurs
 * @property {boolean} missingNight      montre non portée cette nuit
 * @property {number} alcoholPrevEvening verres la veille au soir
 * @property {number} prevDayTrimp       charge cardio de la veille
 * @property {number} sleepMin           minutes endormi
 * @property {number} hrvNight           VFC nocturne moyenne visée (ms)
 * @property {number} rhr                FC repos visée (bpm)
 * @property {number} tempDelta          écart de température visé (°C)
 */

/**
 * @typedef {object} DemoData
 * @property {Sample[]} samples
 * @property {Workout[]} workouts
 * @property {JournalEntry[]} journal
 * @property {DemoDayTruth[]} truth
 * @property {{ start: number, end: number, days: number, seed: number }} range
 */

/**
 * Générateur pseudo-aléatoire reproductible (mulberry32).
 * @param {number} seed
 */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** @type {number | null} */
  let spare = null;
  return {
    next,
    /** @param {number} min @param {number} max */
    uniform: (min, max) => min + (max - min) * next(),
    /** @param {number} p */
    chance: (p) => next() < p,
    /** Loi normale (Box-Muller). @param {number} [mean] @param {number} [sd] */
    normal(mean = 0, sd = 1) {
      if (spare !== null) { const v = spare; spare = null; return mean + sd * v; }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return mean + sd * r * Math.cos(2 * Math.PI * v);
    },
    /** @template T @param {readonly T[]} arr @returns {T} */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** @typedef {ReturnType<typeof createRng>} Rng */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** @param {number} v @param {number} [d] */
const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };

/**
 * Zones de FC (méthode Karvonen) : bornes basses en bpm de Z1 à Z5.
 * @param {number} hrRest @param {number} hrMax
 */
function zoneFloors(hrRest, hrMax) {
  const reserve = hrMax - hrRest;
  return [0.5, 0.6, 0.7, 0.8, 0.9].map((p) => hrRest + p * reserve);
}

/**
 * TRIMP d'Edwards à partir de FC minute par minute (minutes en zone × poids 1..5).
 * Utilisé ici seulement pour moduler la récupération du lendemain.
 * @param {number[]} hrPerMin @param {number} hrRest @param {number} hrMax
 */
function edwardsTrimp(hrPerMin, hrRest, hrMax) {
  const floors = zoneFloors(hrRest, hrMax);
  let trimp = 0;
  for (const hr of hrPerMin) {
    for (let z = 4; z >= 0; z--) {
      if (hr >= floors[z]) { trimp += z + 1; break; }
    }
  }
  return trimp;
}

/**
 * Plan de séance de la journée (null = repos).
 * Semaine type : lun muscu, mer course qualitative, jeu muscu, sam vélo long, dim footing (1 sur 2).
 * @param {number} weekday 0 = dimanche
 * @param {Rng} rng
 * @returns {{ type: WorkoutType, startHour: number, durationMin: number, intensity: 'easy' | 'moderate' | 'hard' } | null}
 */
function plannedWorkout(weekday, rng) {
  switch (weekday) {
    case 1: return { type: 'strength', startHour: 18.5, durationMin: Math.round(rng.uniform(55, 70)), intensity: 'moderate' };
    case 3: return { type: 'running', startHour: 18.75, durationMin: Math.round(rng.uniform(40, 50)), intensity: 'hard' };
    case 4: return { type: 'strength', startHour: 18.5, durationMin: Math.round(rng.uniform(50, 65)), intensity: 'moderate' };
    case 6: return { type: 'cycling', startHour: 10, durationMin: Math.round(rng.uniform(80, 110)), intensity: 'moderate' };
    case 0: return rng.chance(0.5) ? { type: 'running', startHour: 10.5, durationMin: Math.round(rng.uniform(30, 40)), intensity: 'easy' } : null;
    default: return null;
  }
}

/**
 * FC minute par minute d'une séance.
 * @param {WorkoutType} type @param {'easy' | 'moderate' | 'hard'} intensity
 * @param {number} durationMin @param {number} fatigue 0 (frais) à 1 (fatigué) @param {Rng} rng
 */
function workoutHeartRate(type, intensity, durationMin, fatigue, rng) {
  const { hrRest, hrMax } = DEMO_PROFILE;
  const reserve = hrMax - hrRest;
  /** @param {number} pct */
  const atPct = (pct) => hrRest + pct * reserve;
  const drift = fatigue * 4; // un corps fatigué monte un peu plus haut pour le même effort
  /** @type {number[]} */
  const out = [];
  for (let m = 0; m < durationMin; m++) {
    const progress = m / durationMin;
    let target;
    if (type === 'strength') {
      // séries (≈ 1 min d'effort) entrecoupées de repos
      const inSet = m % 3 === 0;
      target = inSet ? atPct(rng.uniform(0.62, 0.74)) : atPct(rng.uniform(0.42, 0.52));
    } else {
      const warm = Math.min(1, m / 8);
      const cool = progress > 0.9 ? (1 - progress) / 0.1 : 1;
      let main;
      if (intensity === 'easy') main = 0.64;
      else if (type === 'cycling') main = 0.66 + 0.06 * Math.sin(m / 9);
      else {
        // course qualitative : fractionné 4 min vite / 2 min récup après l'échauffement
        const block = (m - 10) % 6;
        main = m >= 10 && progress < 0.88 && block < 4 ? 0.86 : 0.72;
      }
      target = atPct(0.45 + (main - 0.45) * warm * (0.4 + 0.6 * cool));
    }
    out.push(Math.round(clamp(rng.normal(target + drift, 2.5), hrRest + 10, hrMax)));
  }
  return out;
}

/**
 * Découpe une nuit en phases (cycles de ~90 min).
 * @param {number} sleepStart @param {number} wake
 * @param {{ alcohol: number, sick: boolean }} ctx @param {Rng} rng
 * @returns {{ stage: SleepStage, start: number, end: number }[]}
 */
function buildHypnogram(sleepStart, wake, ctx, rng) {
  /** @type {{ stage: SleepStage, start: number, end: number }[]} */
  const segs = [];
  let t = sleepStart;
  /** @param {SleepStage} stage @param {number} minutes */
  const push = (stage, minutes) => {
    const end = Math.min(wake, t + Math.max(1, Math.round(minutes)) * MIN);
    if (end <= t) return;
    const last = segs[segs.length - 1];
    if (last && last.stage === stage) last.end = end;
    else segs.push({ stage, start: t, end });
    t = end;
  };
  let cycle = 0;
  while (t < wake - 2 * MIN) {
    const cycleLen = rng.uniform(85, 100);
    // profond surtout dans les 2 premiers cycles ; paradoxal (REM) de plus en plus long
    let deep = cycle === 0 ? rng.uniform(26, 38) : cycle === 1 ? rng.uniform(16, 26) : cycle === 2 ? rng.uniform(4, 10) : rng.uniform(0, 4);
    let rem = clamp(8 + cycle * 6 + rng.normal(0, 3), 4, 35);
    if (ctx.alcohol > 0 && cycle < 2) rem *= 0.4; // l'alcool écrase le REM en début de nuit
    if (ctx.sick) deep *= 0.8;
    const core = Math.max(10, cycleLen - deep - rem);
    push('core', core * 0.55);
    if (deep > 1) push('deep', deep);
    push('core', core * 0.45);
    push('rem', rem);
    const wakeChance = 0.25 + (ctx.alcohol > 0 && cycle >= 2 ? 0.35 : 0) + (ctx.sick ? 0.4 : 0);
    if (rng.chance(wakeChance)) push('awake', rng.uniform(1, ctx.sick ? 12 : 5));
    cycle++;
  }
  return segs;
}

/**
 * Génère les données démo.
 * @param {{ end?: Date, days?: number, seed?: number }} [opts]
 *   `end` = instant « maintenant » (par défaut l'heure actuelle) ; la dernière nuit se termine ce matin.
 * @returns {DemoData}
 */
export function generateDemo(opts = {}) {
  const now = opts.end ?? new Date();
  const days = opts.days ?? 90;
  const seed = opts.seed ?? 2404;
  const rng = createRng(seed);
  const P = DEMO_PROFILE;
  const nowMs = now.getTime();

  /** @type {Sample[]} */
  const samples = [];
  /** @type {Workout[]} */
  const workouts = [];
  /** @type {JournalEntry[]} */
  const journal = [];
  /** @type {DemoDayTruth[]} */
  const truth = [];

  /**
   * @param {QuantitySample['type']} type @param {number} value @param {string} unit
   * @param {number} start @param {number} [end]
   */
  const q = (type, value, unit, start, end = start) => {
    if (start > nowMs) return;
    samples.push({ type, value, unit, start, end: Math.min(end, nowMs), source: DEMO_SOURCE });
  };
  /** @param {SleepStage} stage @param {number} start @param {number} end */
  const sleepSample = (stage, start, end) => {
    if (start > nowMs) return;
    samples.push({ type: 'sleep', value: stage, unit: '', start, end: Math.min(end, nowMs), source: DEMO_SOURCE });
  };

  // Jour i = matin du réveil. i = days-1 → ce matin.
  // `hour` peut être négatif (la veille au soir) ou dépasser 24 : Date gère le débordement en heure locale.
  /** @param {number} i @param {number} hour */
  const at = (i, hour) => new Date(
    now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i), 0, Math.round(hour * 60),
  ).getTime();

  const sickDays = new Set([days - 32, days - 31, days - 30, days - 29]);
  const prodromeDay = days - 33;
  const recoveryDays = new Set([days - 28, days - 27]); // convalescence : pas de sport intense
  const missingNights = new Set([20, days - 19]);

  let hrvNoise = 0; // bruit autocorrélé (AR1)
  let prevDayTrimp = 0;
  let prevAlcohol = 0;
  let prevEveningLate = 0; // heures de coucher décalées la veille

  for (let i = 0; i < days; i++) {
    const dayStart = at(i, 0);
    const weekday = new Date(dayStart).getDay();
    const sick = sickDays.has(i);
    const prodrome = i === prodromeDay;
    const sickLevel = sick ? [0.8, 1, 0.75, 0.45][[...sickDays].indexOf(i)] : prodrome ? 0.3 : 0;
    const missingNight = missingNights.has(i);
    const progress = i / days; // légère amélioration de forme sur la période

    // ---------- Nuit qui se termine le matin du jour i ----------
    const prevWeekday = (weekday + 6) % 7; // jour de la veille au soir
    const weekendNight = prevWeekday === 5 || prevWeekday === 6; // ven. et sam. soir
    let bedHour = weekendNight ? 24.4 + rng.normal(0, 0.6) : 23.25 + rng.normal(0, 0.35);
    bedHour += prevEveningLate;
    if (sickLevel >= 0.45) bedHour = 22.2 + rng.normal(0, 0.3);
    let wakeHour = weekendNight ? 9.2 + rng.normal(0, 0.6) : 7 + rng.normal(0, 0.08);
    if (sick) wakeHour = 8.6 + rng.normal(0, 0.4);
    const bed = at(i, bedHour - 24); // heure négative = la veille au soir
    const wake = at(i, wakeHour);
    const latency = rng.uniform(6, 20) * MIN * (prevAlcohol > 0 ? 0.6 : 1);
    const sleepStart = bed + latency;
    const hypnogram = buildHypnogram(sleepStart, wake, { alcohol: prevAlcohol, sick: sickLevel >= 0.45 }, rng);
    const asleepMin = hypnogram.filter((s) => s.stage !== 'awake').reduce((acc, s) => acc + (s.end - s.start) / MIN, 0);
    const sleepDeficitH = Math.max(0, 7.5 - asleepMin / 60);

    // Physiologie de la nuit
    hrvNoise = 0.55 * hrvNoise + rng.normal(0, 0.085);
    // Pendant la maladie, l'état du corps domine les variations du quotidien.
    const noise = hrvNoise * (1 - 0.7 * sickLevel);
    const lnHrv = Math.log(P.hrvBase)
      + 0.06 * progress
      + noise
      - 0.095 * Math.min(prevAlcohol, 4)
      - 0.0007 * Math.max(0, prevDayTrimp - 60)
      - 0.03 * sleepDeficitH
      - 0.45 * sickLevel;
    const hrvNight = Math.exp(lnHrv);
    const rhr = P.hrRest - 1.2 * progress + rng.normal(0, 1.1)
      + 2.5 * Math.min(prevAlcohol, 3)
      + 0.012 * Math.max(0, prevDayTrimp - 60)
      + 8 * sickLevel;
    const tempDelta = rng.normal(0, 0.12) + 0.6 * sickLevel;
    const resp = 14.2 + rng.normal(0, 0.35) + 2 * sickLevel + 0.3 * Math.min(prevAlcohol, 3);
    const spo2 = 97 + rng.normal(0, 0.6) - 2 * sickLevel;

    truth.push({
      date: localDateKey(wake), sick, prodrome, missingNight,
      alcoholPrevEvening: prevAlcohol, prevDayTrimp: round(prevDayTrimp),
      sleepMin: round(asleepMin), hrvNight: round(hrvNight, 1), rhr: round(rhr, 1), tempDelta: round(tempDelta, 2),
    });

    if (!missingNight) {
      sleepSample('in_bed', bed, wake);
      for (const s of hypnogram) sleepSample(s.stage, s.start, s.end);
      // FC pendant le sommeil toutes les 5 min (plus basse en profond)
      for (const s of hypnogram) {
        for (let t = s.start; t < s.end; t += 5 * MIN) {
          const offset = s.stage === 'deep' ? -2 : s.stage === 'rem' ? 3 : s.stage === 'awake' ? 8 : 1;
          q('hr', Math.round(rhr + offset + rng.normal(0, 1.5)), 'bpm', t);
        }
      }
      // VFC : 4 à 6 mesures pendant la nuit
      const nHrv = 4 + Math.floor(rng.uniform(0, 3));
      for (let k = 0; k < nHrv; k++) {
        const t = sleepStart + ((k + 0.5) / nHrv) * (wake - sleepStart);
        q('hrv', round(clamp(hrvNight * Math.exp(rng.normal(0, 0.14)), 8, 250), 1), 'ms', t, t + MIN);
      }
      // Respiration toutes les ~30 min, SpO2 quelques fois, température une fois
      for (let t = sleepStart + 20 * MIN; t < wake; t += 30 * MIN) {
        q('resp', round(clamp(resp + rng.normal(0, 0.5), 8, 30), 1), '/min', t, t + MIN);
      }
      for (let k = 0; k < 3; k++) {
        const t = sleepStart + rng.uniform(0.1, 0.9) * (wake - sleepStart);
        q('spo2', round(clamp(spo2 + rng.normal(0, 0.8), 88, 100), 0), '%', t, t + MIN);
      }
      q('wrist_temp', round(35.9 + tempDelta, 2), '°C', sleepStart, wake);
    }
    // FC repos : estimée par la montre dès le réveil, même sans les données de la nuit
    q('rhr', Math.round(rhr), 'bpm', wake + 30 * MIN, wake + 30 * MIN);

    // ---------- Journée du jour i ----------
    const restOnly = sick || prodrome || recoveryDays.has(i);
    let plan = restOnly ? null : plannedWorkout(weekday, rng);
    if (plan && rng.chance(0.12)) plan = null; // séance sautée
    if (plan && recoveryDays.has(i - 1) && plan.intensity === 'hard') plan = { ...plan, intensity: 'moderate' };

    const recoveryFatigue = clamp((Math.log(P.hrvBase) - lnHrv) / 0.4, 0, 1);
    let dayTrimp = 0;
    /** @type {[number, number] | null} */
    let workoutWindow = null;
    if (plan) {
      const start = at(i, plan.startHour + rng.normal(0, 0.15));
      const hrSeries = workoutHeartRate(plan.type, plan.intensity, plan.durationMin, recoveryFatigue, rng);
      const end = start + plan.durationMin * MIN;
      if (end <= nowMs) {
        hrSeries.forEach((hr, m) => q('hr', hr, 'bpm', start + m * MIN, start + (m + 1) * MIN));
        const avgHr = Math.round(hrSeries.reduce((a, b) => a + b, 0) / hrSeries.length);
        const maxHr = Math.max(...hrSeries);
        const kcal = Math.round(hrSeries.reduce((acc, hr) => acc + Math.max(1, (hr - 60) * 0.085), 0));
        const distanceKm = plan.type === 'running' ? round(plan.durationMin / rng.uniform(5.2, 6.1), 2)
          : plan.type === 'cycling' ? round((plan.durationMin / 60) * rng.uniform(24, 28), 1) : null;
        workouts.push({
          type: plan.type, start, end, durationMin: plan.durationMin,
          calories: kcal, distanceKm, avgHr, maxHr, source: DEMO_SOURCE,
        });
        q('exercise_min', plan.durationMin, 'min', start, end);
        dayTrimp = edwardsTrimp(hrSeries, P.hrRest, P.hrMax);
        workoutWindow = [start, end];
      }
    }

    // Soirée : alcool, coucher tardif, journal
    const fridayOrSaturday = weekday === 5 || weekday === 6;
    let alcohol = 0;
    if (!sick && !prodrome) {
      if (fridayOrSaturday && rng.chance(0.5)) alcohol = 1 + Math.floor(rng.uniform(0, 3));
      else if (rng.chance(0.06)) alcohol = 1;
    }
    let lateTonight = alcohol > 0 ? rng.uniform(0.3, 1) : 0;
    if (!fridayOrSaturday && !sick && rng.chance(0.12)) lateTonight += rng.uniform(0.8, 1.5); // nuit courte en semaine
    const nextBed = at(i, 23 + lateTonight); // borne de fin approximative de la journée active

    // FC de journée toutes les 5 min, hors séance (marche le matin et en fin de journée)
    for (let t = wake + 5 * MIN; t < nextBed - 15 * MIN; t += 5 * MIN) {
      if (workoutWindow && t >= workoutWindow[0] - 5 * MIN && t < workoutWindow[1] + 10 * MIN) continue;
      const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
      const walking = (h > 8.2 && h < 8.7) || (h > 17.6 && h < 18.1) || rng.chance(0.06);
      const base = P.hrRest + 14 + 6 * sickLevel + (walking ? rng.uniform(20, 35) : 0);
      q('hr', Math.round(clamp(rng.normal(base, 3), 40, 170)), 'bpm', t);
    }
    // VFC de journée (plus basse et bruitée : à ignorer par les scores, qui ne gardent que la nuit)
    q('hrv', round(clamp(hrvNight * 0.75 * Math.exp(rng.normal(0, 0.25)), 8, 250), 1), 'ms', at(i, 14 + rng.uniform(0, 4)));

    // Pas et énergie active par heure
    const stepsFactor = sick ? 0.25 : prodrome ? 0.7 : weekday === 0 ? 0.8 : 1;
    for (let h = Math.ceil(wakeHour); h < 23; h++) {
      const t = at(i, h);
      const commute = h === 8 || h === 18 ? 1800 : h === 12 || h === 13 ? 900 : 350;
      const steps = Math.round(clamp(rng.normal(commute, commute * 0.35), 0, 6000) * stepsFactor);
      q('steps', steps, 'count', t, t + HOUR);
      q('active_energy', round(steps * 0.04 + rng.uniform(4, 10), 1), 'kcal', t, t + HOUR);
    }
    // Énergie de la séance
    const lastWorkout = workouts[workouts.length - 1];
    if (plan && lastWorkout && lastWorkout.start >= dayStart && lastWorkout.calories) {
      q('active_energy', lastWorkout.calories, 'kcal', lastWorkout.start, lastWorkout.end);
    }

    // Journal du soir rempli ~70 % du temps (jamais le soir même : il n'est pas encore passé)
    const eveningDone = at(i, 22) <= nowMs;
    if (eveningDone && rng.chance(0.7)) {
      journal.push({
        date: localDateKey(dayStart),
        lateCaffeine: rng.chance(0.18),
        alcohol,
        screens: rng.chance(lateTonight > 0.5 ? 0.8 : 0.4),
        lateMeal: rng.chance(alcohol > 0 ? 0.5 : 0.15),
        stress: clamp(Math.round(rng.normal(sick ? 3 : 2.3, 0.9)), 1, 5),
        notes: '',
      });
    }

    // Mesures de forme ponctuelles
    if (i % 7 === 3) q('weight', round(P.weightKg - 0.8 * progress + rng.normal(0, 0.3), 1), 'kg', at(i, 7.3));
    if (i % 10 === 5) q('vo2max', round(47 + 2 * progress + rng.normal(0, 0.3), 1), 'mL/kg/min', at(i, 20));

    prevDayTrimp = dayTrimp;
    prevAlcohol = alcohol;
    prevEveningLate = lateTonight;
  }

  samples.sort((a, b) => a.start - b.start);
  return {
    samples,
    workouts,
    journal,
    truth,
    range: { start: at(0, 0) - 2 * HOUR, end: nowMs, days, seed },
  };
}

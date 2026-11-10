// @ts-check
/**
 * Scores du jour (section 5), calculés dans l'ordre chronologique :
 * lignes de base 30 j → besoin de sommeil → score sommeil → récupération → effort cible → charge → alerte.
 * Chaque utilisateur est comparé à lui-même, jamais à une norme générale.
 */
import { CONFIG } from './config.js';
import { clamp, mean, median, present, round, sd, sum } from './stats.js';

/** @typedef {import('./daily.js').DayPhys} DayPhys */

/**
 * @typedef {object} Baseline
 * @property {number | null} median
 * @property {number | null} sd       écart-type (avec plancher)
 * @property {number} n
 */

/** @typedef {'green' | 'yellow' | 'red'} Zone */

/**
 * @typedef {object} SleepPillars
 * @property {number | null} duration
 * @property {number | null} efficiency
 * @property {number | null} regularity
 * @property {number | null} stages
 * @property {number | null} regularityDevMin écart moyen coucher/lever vs 7 j
 * @property {number | null} deepPct
 * @property {number | null} remPct
 */

/**
 * @typedef {object} DayScores
 * @property {string} date
 * @property {{ lnHrv: Baseline, rhr: Baseline, resp: Baseline, temp: Baseline, sleepScore: Baseline }} baseline
 * @property {number} nightsInBaseline
 * @property {'none' | 'calibrating' | 'full'} calibration
 * @property {number} needMin           besoin de sommeil de la nuit (min)
 * @property {number} baseNeedMin
 * @property {number} debtMin           dette des 7 nuits précédentes (min)
 * @property {number} strainAdjMin
 * @property {number | null} sleepScore
 * @property {SleepPillars} pillars
 * @property {number | null} recovery
 * @property {Zone | null} zone
 * @property {{ z: Record<string, number | null>, weights: Record<string, number>, S: number | null, tempPenalty: number, tempDelta: number | null }} recoveryDetail
 * @property {boolean} reducedPrecision
 * @property {string[]} missing         métriques absentes cette nuit
 * @property {[number, number] | null} target effort conseillé [min, max]
 * @property {number | null} targetPoint effort à viser
 * @property {number | null} acwr
 * @property {{ kind: 'strain' | 'load', text: string } | null} alert
 * @property {number | null} tempDelta
 */

/** @typedef {DayPhys & DayScores} DayRecord */

/**
 * @param {number[]} values
 * @param {number} floor
 * @returns {Baseline}
 */
function baselineOf(values, floor) {
  const m = median(values);
  const s = sd(values);
  return { median: m === null ? null : round(m, 3), sd: s === null ? (values.length ? floor : null) : round(Math.max(s, floor), 3), n: values.length };
}

/** @param {number | null} x @param {Baseline} b */
function z(x, b) {
  if (x === null || b.median === null || b.sd === null || b.n < CONFIG.baseline.minNights) return null;
  return (x - b.median) / b.sd;
}

/**
 * Minutes depuis midi (pour moyenner des heures de coucher autour de minuit).
 * @param {number} t
 */
function minutesFromNoon(t) {
  const d = new Date(t);
  const m = d.getHours() * 60 + d.getMinutes();
  return m < 12 * 60 ? m + 12 * 60 : m - 12 * 60;
}
/** @param {number} t */
function minutesOfDay(t) {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Score d'une phase : 100 dans la cible, puis décroissance linéaire.
 * @param {number} pct @param {number[]} target
 */
function stageScore(pct, target) {
  const dist = pct < target[0] ? target[0] - pct : pct > target[1] ? pct - target[1] : 0;
  return clamp(100 * (1 - dist / CONFIG.sleep.stageTolerance), 0, 100);
}

/**
 * Moyenne pondérée sur les piliers disponibles (poids redistribués).
 * @param {Record<string, number | null>} values
 * @param {Record<string, number>} weights
 */
function weighted(values, weights) {
  let acc = 0;
  let w = 0;
  for (const [k, v] of Object.entries(values)) {
    if (v === null) continue;
    acc += v * weights[k];
    w += weights[k];
  }
  return w === 0 ? null : acc / w;
}

/**
 * Contribution d'une nuit à la dette : manque par rapport au besoin de base (+ ajustement effort),
 * plafonné à ±1 h. Une nuit plus longue que le besoin rembourse la dette.
 * @param {{ baseNeedMin: number, strainAdjMin: number, night: { asleepMin: number } | null }} r
 */
export function nightDebt(r) {
  if (!r.night) return 0;
  const cap = CONFIG.sleep.debtCapPerNightMin;
  return clamp(r.baseNeedMin + r.strainAdjMin - r.night.asleepMin, -cap, cap);
}

/** @param {number | null} recovery @returns {Zone | null} */
export function zoneOfRecovery(recovery) {
  if (recovery === null) return null;
  if (recovery >= CONFIG.recovery.green) return 'green';
  if (recovery <= CONFIG.recovery.red) return 'red';
  return 'yellow';
}

/**
 * Effort conseillé : la fourchette de la couleur (section 5.4).
 * @param {number | null} recovery
 * @returns {[number, number] | null}
 */
export function targetStrain(recovery) {
  const zone = zoneOfRecovery(recovery);
  if (!zone) return null;
  const [lo, hi] = CONFIG.strain.target[zone];
  return [lo, hi];
}

/**
 * Effort à viser dans la fourchette : plus la récupération est haute dans sa zone, plus on vise haut.
 * @param {number | null} recovery
 */
export function targetPoint(recovery) {
  const zone = zoneOfRecovery(recovery);
  if (!zone || recovery === null) return null;
  const [lo, hi] = CONFIG.strain.target[zone];
  const [rLo, rHi] = zone === 'green' ? [CONFIG.recovery.green, 100] : zone === 'yellow' ? [CONFIG.recovery.red + 1, CONFIG.recovery.green - 1] : [0, CONFIG.recovery.red];
  const pos = clamp((recovery - rLo) / Math.max(1, rHi - rLo), 0, 1);
  return Math.round(lo + pos * (hi - lo));
}

/**
 * Calcule les scores de tous les jours (ordre chronologique).
 * @param {DayPhys[]} days triés par date
 * @returns {DayRecord[]}
 */
export function computeScores(days) {
  const C = CONFIG;
  /** @type {DayRecord[]} */
  const out = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const n = day.night;
    const dayTime = new Date(`${day.date}T12:00:00`).getTime();
    // Jours précédents dans la fenêtre (en jours calendaires, pas en index).
    const windowStart = dayTime - C.baseline.windowDays * 86400000;
    const prev = out.filter((r) => {
      const t = new Date(`${r.date}T12:00:00`).getTime();
      return t >= windowStart && t < dayTime;
    });

    const baseline = {
      lnHrv: baselineOf(present(prev.map((r) => (r.hrv ? Math.log(r.hrv) : null))), C.baseline.sdFloor.lnHrv),
      rhr: baselineOf(present(prev.map((r) => r.rhr)), C.baseline.sdFloor.rhr),
      resp: baselineOf(present(prev.map((r) => r.resp)), C.baseline.sdFloor.resp),
      temp: baselineOf(present(prev.map((r) => r.tempAbs)), C.baseline.sdFloor.temp),
      sleepScore: baselineOf(present(prev.map((r) => r.sleepScore)), C.baseline.sdFloor.sleepScore),
    };
    const nightsInBaseline = prev.filter((r) => r.night !== null).length;
    const calibration = nightsInBaseline < C.baseline.minNights ? 'none' : nightsInBaseline < C.baseline.fullNights ? 'calibrating' : 'full';

    // ---- Besoin de sommeil : base apprise + 25 % de la dette + ajustement selon l'effort de la veille
    const greenNights = out.filter((r) => r.zone === 'green' && r.night).map((r) => /** @type {number} */ (r.night?.asleepMin));
    const baseNeedMin = greenNights.length >= C.sleep.learnMinNights
      ? Math.round(clamp(/** @type {number} */ (mean(greenNights.slice(-30))), C.sleep.baseNeedBounds[0], C.sleep.baseNeedBounds[1]))
      : C.sleep.baseNeedMin;
    const debtWindow = out.filter((r) => {
      const t = new Date(`${r.date}T12:00:00`).getTime();
      return t >= dayTime - C.sleep.debtDays * 86400000 && t < dayTime && r.night;
    });
    const debtMin = Math.round(Math.max(0, sum(debtWindow.map(nightDebt))));
    const yesterday = out.length ? out[out.length - 1] : null;
    const yStrain = yesterday && new Date(`${yesterday.date}T12:00:00`).getTime() === dayTime - 86400000 ? yesterday.strain : 0;
    const strainAdjMin = Math.round(clamp((yStrain - C.sleep.strainAdjustFrom) / (C.strain.max - C.sleep.strainAdjustFrom), 0, 1) * C.sleep.strainAdjustMaxMin);
    const needMin = Math.round(baseNeedMin + C.sleep.debtWeight * debtMin + strainAdjMin);

    // ---- Score de sommeil (4 piliers)
    /** @type {SleepPillars} */
    let pillars = { duration: null, efficiency: null, regularity: null, stages: null, regularityDevMin: null, deepPct: null, remPct: null };
    let sleepScore = null;
    if (n) {
      const duration = clamp((n.asleepMin / needMin) * 100, 0, 100);
      const efficiency = n.inBedOnly ? null : clamp((n.asleepMin / Math.max(1, n.inBedMin)) / C.sleep.efficiencyMax * 100, 0, 100);
      const recent = out.slice(-C.sleep.regularityDays).filter((r) => r.night && new Date(`${r.date}T12:00:00`).getTime() >= dayTime - C.sleep.regularityDays * 86400000);
      let regularity = null;
      let regularityDevMin = null;
      if (recent.length >= 3) {
        const bedMean = /** @type {number} */ (mean(recent.map((r) => minutesFromNoon(/** @type {number} */ (r.night?.start)))));
        const wakeMean = /** @type {number} */ (mean(recent.map((r) => minutesOfDay(/** @type {number} */ (r.night?.end)))));
        regularityDevMin = Math.round((Math.abs(minutesFromNoon(n.start) - bedMean) + Math.abs(minutesOfDay(n.end) - wakeMean)) / 2);
        regularity = clamp(100 * (1 - regularityDevMin / C.sleep.regularityZeroMin), 0, 100);
      }
      let stages = null;
      let deepPct = null;
      let remPct = null;
      if (n.hasStages && n.asleepMin > 0) {
        deepPct = n.deepMin / n.asleepMin;
        remPct = n.remMin / n.asleepMin;
        stages = (stageScore(deepPct, C.sleep.deepTarget) + stageScore(remPct, C.sleep.remTarget)) / 2;
      }
      pillars = {
        duration: round(duration),
        efficiency: efficiency === null ? null : round(efficiency),
        regularity: regularity === null ? null : round(regularity),
        stages: stages === null ? null : round(stages),
        regularityDevMin,
        deepPct: deepPct === null ? null : round(deepPct * 100, 1),
        remPct: remPct === null ? null : round(remPct * 100, 1),
      };
      const s = weighted({ duration, efficiency, regularity, stages }, C.sleep.weights);
      sleepScore = s === null ? null : Math.round(s);
    }

    // ---- Récupération
    const lnHrv = day.hrv ? Math.log(day.hrv) : null;
    const zs = {
      hrv: n ? z(lnHrv, baseline.lnHrv) : null,
      rhr: n ? z(day.rhr, baseline.rhr) : null,
      sleep: z(sleepScore, baseline.sleepScore),
      resp: n ? z(day.resp, baseline.resp) : null,
    };
    const missing = [];
    if (!n) missing.push('nuit');
    else {
      if (day.hrv === null) missing.push('VFC');
      if (day.rhr === null) missing.push('FC repos');
      if (day.resp === null) missing.push('respiration');
      if (!n.hasStages) missing.push('phases de sommeil');
    }
    let recovery = null;
    let S = null;
    let tempPenalty = 0;
    const tempDelta = day.tempAbs !== null && baseline.temp.median !== null && baseline.temp.n >= C.baseline.minNights
      ? round(day.tempAbs - baseline.temp.median, 2) : null;
    /** @type {Record<string, number>} */
    const usedWeights = {};
    if (n && calibration !== 'none' && (zs.hrv !== null || zs.rhr !== null)) {
      const available = Object.entries(zs).filter(([, v]) => v !== null);
      const totalAbs = sum(available.map(([k]) => Math.abs(C.recovery.weights[/** @type {keyof typeof C.recovery.weights} */ (k)])));
      S = 0;
      for (const [k, v] of available) {
        const w = C.recovery.weights[/** @type {keyof typeof C.recovery.weights} */ (k)] / totalAbs;
        usedWeights[k] = round(w, 3);
        S += w * clamp(/** @type {number} */ (v), -4, 4);
      }
      recovery = 100 / (1 + Math.exp(-C.recovery.slope * S));
      if (tempDelta !== null && Math.abs(tempDelta) > C.recovery.tempDeviation) {
        tempPenalty = C.recovery.tempPenalty;
        recovery -= tempPenalty;
      }
      recovery = Math.round(clamp(recovery, 1, 99));
    }
    const reducedPrecision = recovery !== null && (day.hrv === null || !n?.hasStages || day.rhrSource === 'apple');
    const zone = zoneOfRecovery(recovery);

    // ---- Charge d'entraînement (moyenne effort 7 j ÷ 28 j, jours sans données comptés à 0)
    const strainOn = (/** @type {number} */ k) => {
      const key = new Date(dayTime - k * 86400000);
      const date = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, '0')}-${String(key.getDate()).padStart(2, '0')}`;
      return k === 0 ? day.strain : (out.find((r) => r.date === date)?.strain ?? null);
    };
    const chronic = [];
    for (let k = 0; k < C.load.chronicDays; k++) chronic.push(strainOn(k));
    const known = chronic.filter((v) => v !== null).length;
    let acwr = null;
    if (known >= 21) {
      const acute = /** @type {number} */ (mean(chronic.slice(0, C.load.acuteDays).map((v) => v ?? 0)));
      const chr = /** @type {number} */ (mean(chronic.map((v) => v ?? 0)));
      acwr = chr > 0 ? round(acute / chr, 2) : null;
    }

    // ---- Alerte : dérive inhabituelle (formulée sans diagnostic)
    /** @type {DayScores['alert']} */
    let alert = null;
    const rhrRise = day.rhr !== null && baseline.rhr.median !== null && baseline.rhr.n >= C.baseline.minNights ? day.rhr - baseline.rhr.median : null;
    if (rhrRise !== null && rhrRise >= C.alert.rhrRiseBpm
      && ((tempDelta !== null && tempDelta >= C.alert.tempRise) || (zs.resp !== null && zs.resp >= C.alert.respZ) || (zs.hrv !== null && zs.hrv <= C.alert.hrvZ))) {
      alert = {
        kind: 'strain',
        text: `Ta FC repos est ${Math.round(rhrRise)} bpm au-dessus de ton habitude${tempDelta !== null && tempDelta >= C.alert.tempRise ? ' et ta température est en hausse' : ''}. Ton corps lutte peut-être contre quelque chose : journée calme conseillée.`,
      };
    } else if (acwr !== null && acwr > C.load.risk) {
      alert = { kind: 'load', text: 'Ta charge des 7 derniers jours monte très vite par rapport à ton habitude : prévois une journée plus légère pour éviter la blessure.' };
    }

    out.push({
      ...day,
      baseline,
      nightsInBaseline,
      calibration,
      needMin,
      baseNeedMin,
      debtMin,
      strainAdjMin,
      sleepScore,
      pillars,
      recovery,
      zone,
      recoveryDetail: {
        z: Object.fromEntries(Object.entries(zs).map(([k, v]) => [k, v === null ? null : round(v, 2)])),
        weights: usedWeights,
        S: S === null ? null : round(S, 3),
        tempPenalty,
        tempDelta,
      },
      reducedPrecision,
      missing,
      target: targetStrain(recovery),
      targetPoint: targetPoint(recovery),
      acwr,
      alert,
      tempDelta,
    });
  }
  return out;
}

/**
 * Heure de coucher conseillée pour couvrir le besoin avant l'heure de réveil visée.
 * @param {{ needMin: number, latencyMin: number, wakeMinutes: number }} o
 * @returns {number} minutes depuis minuit (peut être négatif = la veille… normalisé 0–1439)
 */
export function bedtimeFor({ needMin, latencyMin, wakeMinutes }) {
  const m = wakeMinutes - needMin - latencyMin;
  return ((Math.round(m / 5) * 5) % 1440 + 1440) % 1440;
}

/**
 * Besoin pour la nuit à venir (vu d'aujourd'hui) : base + dette incluant la dernière nuit + effort du jour.
 * @param {DayRecord[]} records
 */
export function tonightNeed(records) {
  const C = CONFIG;
  const last = records[records.length - 1];
  if (!last) return { needMin: C.sleep.baseNeedMin, debtMin: 0, strainAdjMin: 0, baseNeedMin: C.sleep.baseNeedMin };
  const recent = records.slice(-C.sleep.debtDays);
  const debtMin = Math.round(Math.max(0, sum(recent.map(nightDebt))));
  const strainAdjMin = Math.round(clamp((last.strain - C.sleep.strainAdjustFrom) / (C.strain.max - C.sleep.strainAdjustFrom), 0, 1) * C.sleep.strainAdjustMaxMin);
  return { needMin: Math.round(last.baseNeedMin + C.sleep.debtWeight * debtMin + strainAdjMin), debtMin, strainAdjMin, baseNeedMin: last.baseNeedMin };
}

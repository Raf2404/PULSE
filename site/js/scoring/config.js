// @ts-check
/**
 * Tous les poids et seuils des scores (cahier des charges, section 5).
 * V1 réglable : on ajuste ici après tests réels, jamais en dur dans le code.
 */
export const CONFIG = Object.freeze({
  baseline: {
    /** Fenêtre glissante (jours) pour médiane et écart-type. */
    windowDays: 30,
    /** Nuits minimum avant d'afficher un score (badge « calibration »). */
    minNights: 4,
    /** Nuits pour une précision complète. */
    fullNights: 14,
    /** Écarts-types planchers, pour éviter des z énormes quand les valeurs sont très stables. */
    sdFloor: { lnHrv: 0.06, rhr: 1.2, resp: 0.35, temp: 0.12, sleepScore: 6 },
  },

  recovery: {
    /** S = Σ poids × z ; le signe donne le sens (FC repos haute = moins bien). */
    weights: { hrv: 0.5, rhr: -0.25, sleep: 0.15, resp: -0.1 },
    /** Récupération = 100 / (1 + e^(−pente × S)). */
    slope: 1.5,
    green: 67,
    red: 33,
    /** Écart de température (°C) au-delà duquel on retire des points et on alerte. */
    tempDeviation: 0.5,
    tempPenalty: 10,
  },

  sleep: {
    weights: { duration: 0.4, efficiency: 0.2, regularity: 0.2, stages: 0.2 },
    /** Efficacité (endormi / au lit) à partir de laquelle le pilier vaut 100. */
    efficiencyMax: 0.85,
    /** Écart moyen coucher/lever vs 7 jours : 0 min = 100, ≥ 90 min = 0. */
    regularityZeroMin: 90,
    regularityDays: 7,
    deepTarget: [0.13, 0.23],
    remTarget: [0.2, 0.25],
    /** Points de pourcentage hors cible pour tomber à 0 sur une phase. */
    stageTolerance: 0.12,
    /** Besoin de base par défaut (min), puis appris. */
    baseNeedMin: 480,
    baseNeedBounds: [390, 570],
    /** Nuits suivies d'une récup verte nécessaires pour apprendre la base. */
    learnMinNights: 5,
    debtWeight: 0.25,
    debtDays: 7,
    /** Dette comptée au maximum par nuit (min). */
    debtCapPerNightMin: 60,
    /** Ajustement effort : 0 à +45 min si l'effort de la veille dépasse 14. */
    strainAdjustFrom: 14,
    strainAdjustMaxMin: 45,
    /** Une nuit doit durer au moins ça (min endormi) pour être la nuit principale. */
    mainSleepMinMin: 180,
    /** Trou entre deux phases qui sépare deux sommeils (min). */
    gapMin: 90,
  },

  strain: {
    /** Zones en % de la réserve cardiaque (Karvonen) : bornes basses Z1..Z5. */
    zones: [0.5, 0.6, 0.7, 0.8, 0.9],
    zoneWeights: [1, 2, 3, 4, 5],
    /** Effort = 21 × (1 − e^(−TRIMP / k)). Calibré : 1 h en Z3 ≈ 13. */
    k: 170,
    max: 21,
    /** Durée max attribuée à une mesure de FC isolée (min). */
    maxSampleGapMin: 5,
    /** Effort conseillé selon la couleur de la récupération. */
    target: { green: [14, 18], yellow: [10, 14], red: [0, 10] },
  },

  load: {
    acuteDays: 7,
    chronicDays: 28,
    optimal: [0.8, 1.3],
    risk: 1.5,
  },

  rhr: {
    /** FC repos nocturne = moyenne des X % de mesures les plus basses pendant le sommeil. */
    lowestFraction: 0.2,
  },

  alert: {
    rhrRiseBpm: 4,
    tempRise: 0.3,
    respZ: 2,
    hrvZ: -1.5,
  },

  xp: {
    /** XP cumulée pour atteindre le niveau n = base × n^exposant (niveau 1 = 0). */
    base: 100,
    exponent: 1.5,
    maxLevel: 50,
    ranks: [
      { from: 1, name: 'Rookie' },
      { from: 10, name: 'Athlète' },
      { from: 20, name: 'Pro' },
      { from: 30, name: 'Élite' },
      { from: 40, name: 'Légende' },
    ],
    points: {
      sleepNeedMet: 50,
      regularBedtime: 30,
      programSessionDone: 80,
      strainInTarget: 40,
      journalFilled: 10,
      restOnRedDay: 40,
      breathing: 15,
    },
    regularBedtimeToleranceMin: 30,
    /** Séances de respiration comptées en XP par jour. */
    breathingPerDayMax: 2,
    breathingMinSec: 120,
  },

  stress: {
    /** Heures sédentaires : peu de pas, hors séance. */
    sedentaryStepsPerHour: 500,
    /** Seuils du niveau de stress (0–3). */
    levels: [0.8, 1.6, 2.4],
  },
});

/** @typedef {typeof CONFIG} Config */

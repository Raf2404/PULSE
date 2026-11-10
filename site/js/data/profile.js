// @ts-check
/** Profil utilisateur et réglages (stockés dans le magasin « meta », clé « profile »). */

/**
 * @typedef {'bienveillant' | 'direct' | 'sergent'} CoachStyle
 * @typedef {'sleep' | 'fitness' | 'weight' | 'performance' | 'energy'} Goal
 * @typedef {'strength' | 'running' | 'cycling' | 'swimming' | 'team_sport' | 'racket' | 'yoga' | 'other'} Sport
 */

/**
 * @typedef {object} Profile
 * @property {string} firstName
 * @property {number | null} birthYear
 * @property {'f' | 'm' | 'x' | null} sex
 * @property {number | null} heightCm
 * @property {number | null} weightKg
 * @property {number | null} hrMax       saisie manuelle (sinon estimée)
 * @property {Goal[]} goals
 * @property {Sport[]} sports
 * @property {CoachStyle} coachStyle
 * @property {string} wakeTime           heure de réveil visée « HH:MM »
 * @property {'metric' | 'imperial'} units
 * @property {'dark' | 'light' | 'auto'} theme
 * @property {boolean} healthConsent     consentement au traitement local des données de santé
 * @property {boolean} aiConsent         consentement à l'envoi de résumés chiffrés à l'API Claude
 * @property {boolean} trackCycle        prendre en compte le cycle menstruel s'il est saisi
 */

/** @type {Profile} */
export const DEFAULT_PROFILE = Object.freeze({
  firstName: '',
  birthYear: null,
  sex: null,
  heightCm: null,
  weightKg: null,
  hrMax: null,
  goals: [],
  sports: [],
  coachStyle: 'bienveillant',
  wakeTime: '07:00',
  units: 'metric',
  theme: 'dark',
  healthConsent: false,
  aiConsent: false,
  trackCycle: false,
});

/**
 * Complète un profil partiel avec les valeurs par défaut.
 * @param {unknown} raw
 * @returns {Profile}
 */
export function normalizeProfile(raw) {
  const p = typeof raw === 'object' && raw !== null ? /** @type {Partial<Profile>} */ (raw) : {};
  return { ...DEFAULT_PROFILE, ...p };
}

/** @param {Profile} p @param {Date} [now] */
export function ageOf(p, now = new Date()) {
  return p.birthYear ? now.getFullYear() - p.birthYear : null;
}

/**
 * FC max : saisie, sinon formule de Tanaka (208 − 0,7 × âge), sinon 190.
 * @param {Profile} p @param {Date} [now]
 */
export function hrMaxOf(p, now = new Date()) {
  if (p.hrMax) return p.hrMax;
  const age = ageOf(p, now);
  return age ? Math.round(208 - 0.7 * age) : 190;
}

/** « 07:30 » → 450 minutes. @param {string} hhmm */
export function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 7) * 60 + (Number.isFinite(m) ? m : 0);
}

export const COACH_STYLES = /** @type {const} */ ({
  bienveillant: { label: 'Bienveillant', hint: 'Encourageant et doux, jamais culpabilisant.' },
  direct: { label: 'Direct', hint: 'Concis, factuel, droit au but.' },
  sergent: { label: 'Sergent instructeur', hint: 'Exigeant et piquant, mais toujours motivant.' },
});

export const GOALS = /** @type {const} */ ({
  sleep: 'Mieux dormir',
  energy: 'Comprendre ma fatigue',
  fitness: 'Être en meilleure forme',
  performance: 'Progresser en sport',
  weight: 'Perdre du poids',
});

export const SPORTS = /** @type {const} */ ({
  strength: 'Musculation',
  running: 'Course',
  cycling: 'Vélo',
  swimming: 'Natation',
  team_sport: 'Sports co',
  racket: 'Raquette',
  yoga: 'Yoga / mobilité',
  other: 'Autre',
});

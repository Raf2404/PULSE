// @ts-check
/**
 * Format d'échange commun à toutes les sources (import export.zip, Raccourcis, démo).
 * Chaque source produit des mesures `Sample`, des séances `Workout` et, pour le journal
 * du soir, des `JournalEntry`. Les dates sont des timestamps en millisecondes (epoch).
 */

/** Types de mesures numériques, avec leur unité attendue et une plage plausible. */
export const QUANTITY_TYPES = /** @type {const} */ ({
  hr: { unit: 'bpm', min: 25, max: 240 },
  rhr: { unit: 'bpm', min: 25, max: 130 },
  hrv: { unit: 'ms', min: 1, max: 400 },
  resp: { unit: '/min', min: 4, max: 60 },
  spo2: { unit: '%', min: 50, max: 100 },
  wrist_temp: { unit: '°C', min: 30, max: 42 },
  steps: { unit: 'count', min: 0, max: 100000 },
  active_energy: { unit: 'kcal', min: 0, max: 20000 },
  exercise_min: { unit: 'min', min: 0, max: 1440 },
  vo2max: { unit: 'mL/kg/min', min: 10, max: 95 },
  weight: { unit: 'kg', min: 20, max: 400 },
  body_fat: { unit: '%', min: 2, max: 80 },
  mindful: { unit: 'min', min: 0, max: 1440 },
  water: { unit: 'mL', min: 0, max: 20000 },
  protein: { unit: 'g', min: 0, max: 1000 },
});

/** Phases de sommeil (mesure de catégorie : `value` est une de ces chaînes). */
export const SLEEP_STAGES = /** @type {const} */ (['in_bed', 'awake', 'core', 'deep', 'rem', 'asleep']);

/** Flux menstruel (mesure de catégorie, si l'utilisatrice le saisit dans Santé). */
export const MENSTRUAL_FLOWS = /** @type {const} */ (['none', 'light', 'medium', 'heavy', 'unspecified']);

/** Types de séances reconnus. */
export const WORKOUT_TYPES = /** @type {const} */ ([
  'strength', 'running', 'cycling', 'walking', 'hiking', 'swimming', 'rowing',
  'hiit', 'yoga', 'mobility', 'team_sport', 'racket', 'other',
]);

/** @typedef {keyof typeof QUANTITY_TYPES} QuantityType */
/** @typedef {typeof SLEEP_STAGES[number]} SleepStage */
/** @typedef {typeof WORKOUT_TYPES[number]} WorkoutType */

/**
 * @typedef {object} QuantitySample
 * @property {QuantityType} type
 * @property {number} value
 * @property {string} unit
 * @property {number} start  timestamp ms
 * @property {number} end    timestamp ms (>= start)
 * @property {string} source nom de l'appareil ou de l'app d'origine
 */

/**
 * @typedef {object} SleepSample
 * @property {'sleep'} type
 * @property {SleepStage} value
 * @property {''} unit
 * @property {number} start
 * @property {number} end
 * @property {string} source
 */

/**
 * @typedef {object} MenstrualSample
 * @property {'menstrual'} type
 * @property {typeof MENSTRUAL_FLOWS[number]} value
 * @property {''} unit
 * @property {number} start
 * @property {number} end
 * @property {string} source
 */

/** @typedef {QuantitySample | SleepSample | MenstrualSample} Sample */

/**
 * @typedef {object} Workout
 * @property {WorkoutType} type
 * @property {number} start
 * @property {number} end
 * @property {number} durationMin
 * @property {number | null} calories    kcal actives
 * @property {number | null} distanceKm
 * @property {number | null} avgHr
 * @property {number | null} maxHr
 * @property {string} source
 */

/**
 * @typedef {object} JournalEntry
 * @property {string} date          jour du soir concerné, AAAA-MM-JJ (heure locale)
 * @property {boolean} lateCaffeine caféine après 14 h
 * @property {number} alcohol       nombre de verres
 * @property {boolean} screens      écrans dans l'heure avant le coucher
 * @property {boolean} lateMeal     repas lourd dans les 2 h avant le coucher
 * @property {number} stress        1 (calme) à 5 (très stressé)
 * @property {string} notes
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok
 * @property {string[]} errors
 */

const MAX_DURATION_MS = 7 * 24 * 3600 * 1000;

/** @param {unknown} v @returns {v is number} */
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Vérifie les champs communs start / end / source.
 * @param {Record<string, unknown>} o
 * @param {string[]} errors
 */
function checkTiming(o, errors) {
  if (!isFiniteNumber(o.start)) errors.push('start doit être un timestamp en ms');
  if (!isFiniteNumber(o.end)) errors.push('end doit être un timestamp en ms');
  if (isFiniteNumber(o.start) && isFiniteNumber(o.end)) {
    if (o.end < o.start) errors.push('end est avant start');
    if (o.end - o.start > MAX_DURATION_MS) errors.push('durée supérieure à 7 jours');
  }
  if (typeof o.source !== 'string' || o.source.trim() === '') errors.push('source manquante');
}

/**
 * Valide une mesure du format commun.
 * @param {unknown} s
 * @returns {ValidationResult}
 */
export function validateSample(s) {
  /** @type {string[]} */
  const errors = [];
  if (!isObject(s)) return { ok: false, errors: ['la mesure doit être un objet'] };

  if (s.type === 'sleep' || s.type === 'menstrual') {
    const allowed = /** @type {readonly string[]} */ (s.type === 'sleep' ? SLEEP_STAGES : MENSTRUAL_FLOWS);
    if (typeof s.value !== 'string' || !allowed.includes(s.value)) {
      errors.push(`${s.type} : valeur inconnue ${String(s.value)}`);
    }
    if (s.unit !== '') errors.push(`${s.type} : mesure de catégorie sans unité`);
  } else if (typeof s.type === 'string' && Object.hasOwn(QUANTITY_TYPES, s.type)) {
    const spec = QUANTITY_TYPES[/** @type {QuantityType} */ (s.type)];
    if (!isFiniteNumber(s.value)) {
      errors.push(`${s.type} : valeur non numérique`);
    } else if (s.value < spec.min || s.value > spec.max) {
      errors.push(`${s.type} : valeur ${s.value} hors plage [${spec.min}, ${spec.max}]`);
    }
    if (s.unit !== spec.unit) errors.push(`${s.type} : unité attendue « ${spec.unit} », reçue « ${String(s.unit)} »`);
  } else {
    errors.push(`type de mesure inconnu : ${String(s.type)}`);
  }

  checkTiming(s, errors);
  return { ok: errors.length === 0, errors };
}

/**
 * Valide une séance.
 * @param {unknown} w
 * @returns {ValidationResult}
 */
export function validateWorkout(w) {
  /** @type {string[]} */
  const errors = [];
  if (!isObject(w)) return { ok: false, errors: ['la séance doit être un objet'] };

  if (!WORKOUT_TYPES.includes(/** @type {WorkoutType} */ (w.type))) errors.push(`type de séance inconnu : ${String(w.type)}`);
  checkTiming(w, errors);
  if (!isFiniteNumber(w.durationMin) || w.durationMin <= 0) errors.push('durationMin doit être > 0');

  for (const key of ['calories', 'distanceKm', 'avgHr', 'maxHr']) {
    const v = w[key];
    if (v !== null && (!isFiniteNumber(v) || v < 0)) errors.push(`${key} doit être un nombre positif ou null`);
  }
  if (isFiniteNumber(w.avgHr) && isFiniteNumber(w.maxHr) && w.avgHr > w.maxHr) errors.push('avgHr supérieure à maxHr');
  return { ok: errors.length === 0, errors };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valide une entrée du journal du soir.
 * @param {unknown} j
 * @returns {ValidationResult}
 */
export function validateJournalEntry(j) {
  /** @type {string[]} */
  const errors = [];
  if (!isObject(j)) return { ok: false, errors: ['l\'entrée doit être un objet'] };
  if (typeof j.date !== 'string' || !DATE_RE.test(j.date)) errors.push('date attendue au format AAAA-MM-JJ');
  for (const key of ['lateCaffeine', 'screens', 'lateMeal']) {
    if (typeof j[key] !== 'boolean') errors.push(`${key} doit être vrai/faux`);
  }
  if (!Number.isInteger(j.alcohol) || /** @type {number} */ (j.alcohol) < 0 || /** @type {number} */ (j.alcohol) > 20) {
    errors.push('alcohol doit être un entier entre 0 et 20');
  }
  if (!Number.isInteger(j.stress) || /** @type {number} */ (j.stress) < 1 || /** @type {number} */ (j.stress) > 5) {
    errors.push('stress doit être un entier entre 1 et 5');
  }
  if (typeof j.notes !== 'string') errors.push('notes doit être un texte');
  return { ok: errors.length === 0, errors };
}

/**
 * Clé de dédoublonnage d'une mesure : type + début + fin + source (+ phase pour le sommeil).
 * Deux imports du même export produisent donc les mêmes clés. La fin est incluse car deux
 * mesures distinctes peuvent commencer au même instant (ex. énergie horaire et énergie d'une
 * séance qui démarre pile à l'heure).
 * @param {Sample} s
 */
export function sampleKey(s) {
  return s.type === 'sleep' || s.type === 'menstrual'
    ? `${s.type}:${s.value}|${s.start}|${s.end}|${s.source}`
    : `${s.type}|${s.start}|${s.end}|${s.source}`;
}

/** @param {Workout} w */
export function workoutKey(w) {
  return `${w.type}|${w.start}|${w.source}`;
}

/**
 * Sépare un lot en éléments valides et rejetés (sans lever d'exception).
 * @template T
 * @param {unknown[]} items
 * @param {(x: unknown) => ValidationResult} validate
 * @returns {{ valid: T[], rejected: { item: unknown, errors: string[] }[] }}
 */
export function partition(items, validate) {
  /** @type {T[]} */
  const valid = [];
  /** @type {{ item: unknown, errors: string[] }[]} */
  const rejected = [];
  for (const item of items) {
    const r = validate(item);
    if (r.ok) valid.push(/** @type {T} */ (item));
    else rejected.push({ item, errors: r.errors });
  }
  return { valid, rejected };
}

/**
 * Date locale AAAA-MM-JJ d'un timestamp (utilisée partout pour rattacher une mesure à un jour).
 * @param {number | Date} t
 */
export function localDateKey(t) {
  const d = t instanceof Date ? t : new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

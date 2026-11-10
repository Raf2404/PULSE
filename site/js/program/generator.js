// @ts-check
/**
 * Programmes d'entraînement : modèles de séances (A/B/C…) déroulés sur 4 à 12 semaines,
 * progression hebdomadaire et semaine allégée toutes les 4 semaines.
 * Le coach IA peut fournir ses propres modèles ; sans clé, le générateur à règles les construit.
 */
import { available, EXERCISE_BY_ID } from './exercises.js';
import { localDateKey } from '../data/schema.js';

/** @typedef {import('./exercises.js').Equipment} Equipment */
/** @typedef {import('./exercises.js').Sensitive} Sensitive */
/** @typedef {import('./exercises.js').Exercise} Exercise */

/**
 * @typedef {'muscle' | 'endurance' | 'weight' | 'general'} ProgramGoal
 * @typedef {'beginner' | 'intermediate' | 'advanced'} Level
 */

/**
 * @typedef {object} Questionnaire
 * @property {ProgramGoal} goal
 * @property {Level} level
 * @property {number[]} days        jours d'entraînement (1 = lundi … 7 = dimanche)
 * @property {Equipment} equipment
 * @property {Sensitive[]} injuries
 * @property {number} weeks         4 à 12
 * @property {'run' | 'ride' | 'none'} cardio sport d'endurance préféré
 */

/**
 * @typedef {object} ExerciseBlock
 * @property {string} exerciseId
 * @property {string} name
 * @property {number} sets
 * @property {string} reps          « 10 », « 8-12 », « 30 s »
 * @property {number} restSec
 * @property {string} cue
 */

/**
 * @typedef {object} CardioBlock
 * @property {'run' | 'ride'} mode
 * @property {number} durationMin
 * @property {1 | 2 | 3 | 4 | 5} zone
 * @property {string} description
 * @property {{ reps: number, workMin: number, restMin: number, zone: number } | null} intervals
 */

/**
 * @typedef {object} SessionTemplate
 * @property {string} key
 * @property {string} title
 * @property {'strength' | 'cardio' | 'mobility'} kind
 * @property {string} focus
 * @property {ExerciseBlock[]} exercises
 * @property {CardioBlock | null} cardio
 */

/**
 * @typedef {object} Program
 * @property {string} id
 * @property {string} title
 * @property {ProgramGoal} goal
 * @property {Level} level
 * @property {number} weeks
 * @property {string} startDate     lundi de la première semaine
 * @property {number[]} days
 * @property {'active' | 'done' | 'archived'} status
 * @property {SessionTemplate[]} templates
 * @property {Questionnaire} questionnaire
 * @property {'rules' | 'coach'} author
 * @property {string} [notes]
 */

/**
 * @typedef {object} PlannedSession
 * @property {string} id
 * @property {string} programId
 * @property {string} date
 * @property {number} week
 * @property {boolean} deload
 * @property {string} templateKey
 * @property {string} title
 * @property {'strength' | 'cardio' | 'mobility'} kind
 * @property {string} focus
 * @property {ExerciseBlock[]} exercises
 * @property {CardioBlock | null} cardio
 * @property {boolean} done
 * @property {number | null} rpe
 * @property {number | null} doneAt
 * @property {'normal' | 'light' | 'rest'} version
 * @property {string | null} adjustNote
 */

export const GOAL_LABELS = /** @type {const} */ ({
  muscle: 'Prendre du muscle',
  endurance: 'Courir / rouler plus longtemps',
  weight: 'Perdre du poids',
  general: 'Forme générale',
});

export const LEVEL_LABELS = /** @type {const} */ ({ beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Confirmé' });

/**
 * Choisit le premier exercice disponible d'un groupe, en évitant les doublons.
 * @param {Exercise[]} pool @param {Exercise['group']} group @param {Set<string>} used @param {number} [skip]
 */
function pick(pool, group, used, skip = 0) {
  const list = pool.filter((e) => e.group === group && !used.has(e.id));
  // Préfère le matériel le plus « complet » disponible (barre > haltères > poids du corps).
  const order = { gym: 0, dumbbells: 1, none: 2 };
  list.sort((a, b) => order[a.equipment] - order[b.equipment]);
  const e = list[Math.min(skip, list.length - 1)];
  if (e) used.add(e.id);
  return e ?? null;
}

/**
 * @param {Exercise | null} e @param {number} sets @param {string} reps @param {number} restSec
 * @returns {ExerciseBlock | null}
 */
function block(e, sets, reps, restSec) {
  return e ? { exerciseId: e.id, name: e.name, sets, reps, restSec, cue: e.cue } : null;
}

/**
 * Séance de musculation.
 * @param {Exercise[]} pool @param {'full' | 'upper' | 'lower'} split @param {Level} level @param {ProgramGoal} goal @param {number} variant
 */
function strengthTemplate(pool, split, level, goal, variant) {
  const used = new Set();
  const sets = level === 'beginner' ? 3 : level === 'intermediate' ? 3 : 4;
  const reps = goal === 'muscle' ? '8-12' : goal === 'weight' ? '12-15' : '10-12';
  const rest = goal === 'muscle' ? 90 : 60;
  /** @type {(ExerciseBlock | null)[]} */
  let blocks = [];
  if (split === 'full') {
    blocks = [
      block(pick(pool, 'legs', used, variant), sets, reps, rest),
      block(pick(pool, 'push', used, variant), sets, reps, rest),
      block(pick(pool, 'pull', used, variant), sets, reps, rest),
      block(pick(pool, 'legs', used, variant + 1), sets - 1, reps, rest),
      block(pick(pool, 'core', used, variant), 3, '30 s', 45),
    ];
  } else if (split === 'upper') {
    blocks = [
      block(pick(pool, 'push', used, variant), sets, reps, rest),
      block(pick(pool, 'pull', used, variant), sets, reps, rest),
      block(pick(pool, 'push', used, variant + 1), sets - 1, reps, rest),
      block(pick(pool, 'pull', used, variant + 1), sets - 1, reps, rest),
      block(pick(pool, 'core', used, variant), 3, '30 s', 45),
    ];
  } else {
    blocks = [
      block(pick(pool, 'legs', used, variant), sets, reps, rest + 30),
      block(pick(pool, 'legs', used, variant + 1), sets, reps, rest),
      block(pick(pool, 'legs', used, variant + 2), sets - 1, '12', rest),
      block(pick(pool, 'core', used, variant), 3, '30 s', 45),
      block(pick(pool, 'core', used, variant + 1), 3, '10 par côté', 45),
    ];
  }
  return /** @type {ExerciseBlock[]} */ (blocks.filter(Boolean));
}

/**
 * Construit les modèles de séances selon l'objectif et le nombre de jours.
 * @param {Questionnaire} q
 * @returns {SessionTemplate[]}
 */
export function buildTemplates(q) {
  const pool = available({ equipment: q.equipment, injuries: q.injuries });
  const n = Math.max(1, Math.min(6, q.days.length));
  const mode = q.cardio === 'none' ? 'run' : q.cardio;
  const modeLabel = mode === 'run' ? 'Course' : 'Vélo';
  const easyMin = q.level === 'beginner' ? 25 : q.level === 'intermediate' ? 35 : 45;

  /** @type {(key: string, variant: number, split: 'full' | 'upper' | 'lower') => SessionTemplate} */
  const strength = (key, variant, split) => ({
    key,
    title: split === 'full' ? `Corps entier ${key}` : split === 'upper' ? 'Haut du corps' : 'Jambes et gainage',
    kind: 'strength',
    focus: split === 'full' ? 'Force globale' : split === 'upper' ? 'Poussée et tirage' : 'Jambes',
    exercises: strengthTemplate(pool, split, q.level, q.goal, variant),
    cardio: null,
  });
  /** @type {(key: string, kind: 'easy' | 'intervals' | 'long') => SessionTemplate} */
  const cardio = (key, kind) => ({
    key,
    title: kind === 'easy' ? `${modeLabel} facile` : kind === 'intervals' ? `${modeLabel} fractionné` : `${modeLabel} longue`,
    kind: 'cardio',
    focus: kind === 'easy' ? 'Endurance de base' : kind === 'intervals' ? 'Vitesse' : 'Endurance longue',
    exercises: [],
    cardio: kind === 'easy'
      ? { mode, durationMin: easyMin, zone: 2, description: 'Allure où tu peux parler en phrases complètes.', intervals: null }
      : kind === 'intervals'
        ? { mode, durationMin: easyMin + 10, zone: 4, description: '10 min d\'échauffement, puis les répétitions, 5 min de retour au calme.', intervals: { reps: q.level === 'beginner' ? 4 : 6, workMin: 3, restMin: 2, zone: 4 } }
        : { mode, durationMin: Math.round(easyMin * 1.8), zone: 2, description: 'Sortie longue, régulière, sans regarder la vitesse.', intervals: null },
  });
  /** @type {SessionTemplate} */
  const mobility = {
    key: 'M',
    title: 'Mobilité',
    kind: 'mobility',
    focus: 'Souplesse et récupération',
    exercises: pool.filter((e) => e.kind === 'mobility').map((e) => ({ exerciseId: e.id, name: e.name, sets: 2, reps: '30 s', restSec: 15, cue: e.cue })),
    cardio: null,
  };

  if (q.goal === 'muscle') {
    if (n <= 3) return [strength('A', 0, 'full'), strength('B', 1, 'full'), strength('C', 2, 'full')].slice(0, Math.max(2, n));
    return [strength('A', 0, 'upper'), strength('B', 0, 'lower'), strength('C', 1, 'upper'), strength('D', 1, 'lower'), cardio('E', 'easy'), mobility].slice(0, n);
  }
  if (q.goal === 'endurance') {
    const list = [cardio('A', 'easy'), cardio('B', 'intervals'), cardio('C', 'long'), strength('D', 0, 'full'), cardio('E', 'easy'), mobility];
    return n <= 2 ? [cardio('A', 'easy'), cardio('C', 'long')] : list.slice(0, n);
  }
  if (q.goal === 'weight') {
    return [strength('A', 0, 'full'), cardio('B', 'easy'), strength('C', 1, 'full'), cardio('D', 'intervals'), cardio('E', 'long'), mobility].slice(0, Math.max(2, n));
  }
  return [strength('A', 0, 'full'), cardio('B', 'easy'), mobility, strength('C', 1, 'full'), cardio('D', 'intervals'), cardio('E', 'long')].slice(0, Math.max(2, n));
}

/**
 * Applique la progression d'une semaine à un modèle.
 * @param {SessionTemplate} t @param {number} week 1..n @param {boolean} deload
 * @returns {{ exercises: ExerciseBlock[], cardio: CardioBlock | null }}
 */
export function progressTemplate(t, week, deload) {
  const cycleWeek = ((week - 1) % 4) + 1; // 1,2,3 progressent, 4 = allègement
  const exercises = t.exercises.map((e) => {
    if (deload) return { ...e, sets: Math.max(1, e.sets - 1) };
    const extraSets = cycleWeek === 3 && e.sets < 5 ? 1 : 0;
    return { ...e, sets: e.sets + extraSets };
  });
  let cardio = t.cardio;
  if (cardio) {
    const factor = deload ? 0.7 : 1 + 0.08 * (cycleWeek - 1) + 0.05 * Math.floor((week - 1) / 4);
    cardio = {
      ...cardio,
      durationMin: Math.round(cardio.durationMin * factor),
      intervals: cardio.intervals ? { ...cardio.intervals, reps: deload ? Math.max(2, cardio.intervals.reps - 2) : cardio.intervals.reps + (cycleWeek - 1) } : null,
    };
  }
  return { exercises, cardio };
}

/** Lundi de la semaine d'une date. @param {Date} d */
export function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/**
 * Crée un programme et ses séances planifiées.
 * @param {Questionnaire} q
 * @param {{ now?: Date, templates?: SessionTemplate[], title?: string, author?: 'rules' | 'coach', notes?: string }} [opts]
 * @returns {{ program: Program, sessions: PlannedSession[] }}
 */
export function createProgram(q, opts = {}) {
  const now = opts.now ?? new Date();
  const weeks = Math.max(4, Math.min(12, Math.round(q.weeks)));
  const days = [...new Set(q.days)].filter((d) => d >= 1 && d <= 7).sort();
  const templates = opts.templates?.length ? opts.templates : buildTemplates({ ...q, days });
  const id = `prog-${now.getTime().toString(36)}`;
  // Démarre cette semaine si un jour d'entraînement reste à venir, sinon la semaine suivante.
  const todayIso = ((now.getDay() + 6) % 7) + 1;
  const start = mondayOf(now);
  if (!days.some((d) => d >= todayIso)) start.setDate(start.getDate() + 7);

  /** @type {Program} */
  const program = {
    id,
    title: opts.title ?? `${GOAL_LABELS[q.goal]} · ${weeks} semaines`,
    goal: q.goal,
    level: q.level,
    weeks,
    startDate: localDateKey(start),
    days,
    status: 'active',
    templates,
    questionnaire: { ...q, days, weeks },
    author: opts.author ?? 'rules',
    notes: opts.notes,
  };

  /** @type {PlannedSession[]} */
  const sessions = [];
  const todayKey = localDateKey(now);
  for (let w = 1; w <= weeks; w++) {
    const deload = w % 4 === 0 && w !== weeks;
    days.forEach((dow, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + (w - 1) * 7 + (dow - 1));
      const key = localDateKey(date);
      if (key < todayKey) return;
      const t = templates[i % templates.length];
      const { exercises, cardio } = progressTemplate(t, w, deload);
      sessions.push({
        id: `${id}-${key}`,
        programId: id,
        date: key,
        week: w,
        deload,
        templateKey: t.key,
        title: t.title,
        kind: t.kind,
        focus: t.focus,
        exercises,
        cardio,
        done: false,
        rpe: null,
        doneAt: null,
        version: 'normal',
        adjustNote: null,
      });
    });
  }
  return { program, sessions };
}

/**
 * Version allégée d'une séance (récupération rouge) : −40 % de volume, cardio ramené en zone 2.
 * @param {PlannedSession} s
 * @returns {PlannedSession}
 */
export function lightVersion(s) {
  return {
    ...s,
    version: 'light',
    exercises: s.exercises.map((e) => ({ ...e, sets: Math.max(1, Math.round(e.sets * 0.6)) })),
    cardio: s.cardio ? { ...s.cardio, durationMin: Math.round(s.cardio.durationMin * 0.6), zone: 2, intervals: null, description: 'Version allégée : allure facile, sans fractionné.' } : null,
    adjustNote: 'Récupération basse : séance allégée proposée automatiquement.',
  };
}

/**
 * Ajuste la séance du jour selon la récupération (programme adaptatif).
 * @param {PlannedSession} s @param {'green' | 'yellow' | 'red' | null} zone
 */
export function adaptSession(s, zone) {
  if (s.done || s.version !== 'normal') return s;
  if (zone === 'red') return lightVersion(s);
  if (zone === 'yellow') return { ...s, adjustNote: 'Récupération moyenne : fais la séance prévue sans chercher de record.' };
  if (zone === 'green') return { ...s, adjustNote: 'Bonne récupération : c\'est le jour pour pousser un peu.' };
  return s;
}

/**
 * Normalise des modèles proposés par le coach IA (noms d'exercices libres acceptés).
 * @param {unknown} raw
 * @returns {SessionTemplate[]}
 */
export function sanitizeTemplates(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {SessionTemplate[]} */
  const out = [];
  raw.slice(0, 7).forEach((t, i) => {
    if (typeof t !== 'object' || t === null) return;
    const o = /** @type {Record<string, unknown>} */ (t);
    const kind = o.kind === 'cardio' || o.kind === 'mobility' ? o.kind : 'strength';
    const exercises = Array.isArray(o.exercises) ? o.exercises.slice(0, 10).map((e) => {
      const x = /** @type {Record<string, unknown>} */ (e ?? {});
      const lib = typeof x.exerciseId === 'string' ? EXERCISE_BY_ID.get(x.exerciseId) : undefined;
      return {
        exerciseId: lib?.id ?? 'custom',
        name: String(x.name ?? lib?.name ?? 'Exercice').slice(0, 80),
        sets: Math.max(1, Math.min(8, Math.round(Number(x.sets) || 3))),
        reps: String(x.reps ?? '10').slice(0, 20),
        restSec: Math.max(0, Math.min(300, Math.round(Number(x.restSec) || 60))),
        cue: String(x.cue ?? lib?.cue ?? '').slice(0, 200),
      };
    }) : [];
    const c = /** @type {Record<string, unknown> | null} */ (typeof o.cardio === 'object' ? o.cardio : null);
    out.push({
      key: String.fromCharCode(65 + i),
      title: String(o.title ?? `Séance ${String.fromCharCode(65 + i)}`).slice(0, 60),
      kind,
      focus: String(o.focus ?? '').slice(0, 60),
      exercises,
      cardio: c ? {
        mode: c.mode === 'ride' ? 'ride' : 'run',
        durationMin: Math.max(10, Math.min(240, Math.round(Number(c.durationMin) || 30))),
        zone: /** @type {1 | 2 | 3 | 4 | 5} */ (Math.max(1, Math.min(5, Math.round(Number(c.zone) || 2)))),
        description: String(c.description ?? '').slice(0, 200),
        intervals: null,
      } : null,
    });
  });
  return out;
}

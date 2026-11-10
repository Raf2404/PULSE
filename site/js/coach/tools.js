// @ts-check
/**
 * Outils du coach IA (exécutés dans le navigateur, sur les données locales).
 * Chaque entrée est validée avant exécution : avec le streaming des entrées d'outils,
 * le serveur ne garantit plus leur forme.
 */

/** @typedef {import('../vendor/anthropic.js').Anthropic.Tool} Tool */

/**
 * Carte affichée sous une réponse du coach.
 * @typedef {{ kind: 'chart', metric: ChartMetric, days: number } | { kind: 'session', date: string } | { kind: 'program', programId: string } | { kind: 'memory', key: string, value: string }} Card
 */
/** @typedef {'recovery' | 'sleepScore' | 'hrv' | 'rhr' | 'strain' | 'steps' | 'sleepDuration'} ChartMetric */

/**
 * Ce que l'app met à disposition des outils.
 * @typedef {object} ToolHost
 * @property {(days: number) => object[]} metrics
 * @property {(days: number) => object[]} workouts
 * @property {(input: Record<string, unknown>) => Promise<{ programId: string, summary: string }>} createProgram
 * @property {(mode: 'light' | 'normal' | 'rest', reason: string) => Promise<string>} adjustToday
 * @property {(key: string, value: string) => Promise<void>} saveMemory
 * @property {(date: string) => boolean} hasSession
 */

const CHART_METRICS = ['recovery', 'sleepScore', 'hrv', 'rhr', 'strain', 'steps', 'sleepDuration'];

/** @type {Tool[]} */
export const TOOLS = [
  {
    name: 'get_metrics',
    description: 'Renvoie les résumés quotidiens (récupération, sommeil, VFC, FC repos, respiration, effort, pas, dette de sommeil) des N derniers jours, du plus ancien au plus récent.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 120, description: 'Nombre de jours (1 à 120).' } },
      required: ['days'],
    },
  },
  {
    name: 'get_workouts',
    description: 'Renvoie les séances des N derniers jours : type, durée, FC moyenne et max, minutes par zone cardio, effort, distance.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 120 } },
      required: ['days'],
    },
  },
  {
    name: 'create_program',
    description: 'Crée un programme d\'entraînement de 4 à 12 semaines et remplace le programme en cours. À appeler seulement quand objectif, niveau, jours, matériel et blessures sont connus. « templates » est facultatif : sans lui, l\'app construit des séances adaptées.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        goal: { type: 'string', enum: ['muscle', 'endurance', 'weight', 'general'] },
        level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
        days: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 }, description: 'Jours d\'entraînement, 1 = lundi … 7 = dimanche.' },
        equipment: { type: 'string', enum: ['none', 'dumbbells', 'gym'] },
        injuries: { type: 'array', items: { type: 'string', enum: ['knee', 'back', 'shoulder', 'wrist', 'ankle'] } },
        weeks: { type: 'integer', minimum: 4, maximum: 12 },
        cardio: { type: 'string', enum: ['run', 'ride', 'none'] },
        title: { type: 'string', description: 'Titre court du programme.' },
        notes: { type: 'string', description: 'Conseils généraux pour ce programme (2 phrases max).' },
        templates: {
          type: 'array',
          description: 'Modèles de séances (A, B, C…), un par jour d\'entraînement, répétés chaque semaine avec progression automatique.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              kind: { type: 'string', enum: ['strength', 'cardio', 'mobility'] },
              focus: { type: 'string' },
              exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    exerciseId: { type: 'string', description: 'Identifiant de la bibliothèque si l\'exercice y figure (ex. pushup, goblet_squat, db_row, plank).' },
                    name: { type: 'string' },
                    sets: { type: 'integer' },
                    reps: { type: 'string' },
                    restSec: { type: 'integer' },
                    cue: { type: 'string' },
                  },
                  required: ['name', 'sets', 'reps'],
                },
              },
              cardio: {
                type: 'object',
                properties: {
                  mode: { type: 'string', enum: ['run', 'ride'] },
                  durationMin: { type: 'integer' },
                  zone: { type: 'integer', minimum: 1, maximum: 5 },
                  description: { type: 'string' },
                },
              },
            },
            required: ['title', 'kind'],
          },
        },
      },
      required: ['goal', 'level', 'days', 'equipment', 'injuries', 'weeks', 'cardio'],
    },
  },
  {
    name: 'adjust_today_session',
    description: 'Adapte la séance prévue aujourd\'hui : « light » (version allégée), « normal » (séance prévue), « rest » (remplacée par du repos actif).',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['light', 'normal', 'rest'] },
        reason: { type: 'string', description: 'Pourquoi, en une phrase.' },
      },
      required: ['mode', 'reason'],
    },
  },
  {
    name: 'save_memory',
    description: 'Retient une information durable sur la personne (objectif, blessure, préférence, contrainte). La personne peut la voir et la modifier dans son profil.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Sujet court, ex. « blessure », « préférence sport », « objectif ».' },
        value: { type: 'string', description: 'Une phrase courte.' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'show_chart',
    description: 'Affiche un mini-graphique sous ta réponse.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: CHART_METRICS },
        days: { type: 'integer', minimum: 7, maximum: 90 },
      },
      required: ['metric', 'days'],
    },
  },
  {
    name: 'show_session',
    description: 'Affiche une séance du programme sous forme de carte cliquable.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: '« today » ou une date AAAA-MM-JJ.' } },
      required: ['date'],
    },
  },
];

/** @param {unknown} v @param {number} lo @param {number} hi */
const isInt = (v, lo, hi) => Number.isInteger(v) && /** @type {number} */ (v) >= lo && /** @type {number} */ (v) <= hi;
/** @param {unknown} v @param {readonly string[]} allowed */
const isOneOf = (v, allowed) => typeof v === 'string' && allowed.includes(v);
/** @param {unknown} v @param {number} max */
const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/**
 * Valide l'entrée d'un outil. Renvoie un message d'erreur, ou null si tout va bien.
 * @param {string} name @param {unknown} raw
 */
export function validateToolInput(name, raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'entrée attendue : un objet JSON';
  const i = /** @type {Record<string, unknown>} */ (raw);
  switch (name) {
    case 'get_metrics':
    case 'get_workouts':
      return isInt(i.days, 1, 120) ? null : '« days » doit être un entier entre 1 et 120';
    case 'create_program': {
      if (!isOneOf(i.goal, ['muscle', 'endurance', 'weight', 'general'])) return '« goal » invalide';
      if (!isOneOf(i.level, ['beginner', 'intermediate', 'advanced'])) return '« level » invalide';
      if (!Array.isArray(i.days) || i.days.length === 0 || i.days.length > 7 || !i.days.every((d) => isInt(d, 1, 7))) return '« days » : liste d\'entiers de 1 à 7';
      if (!isOneOf(i.equipment, ['none', 'dumbbells', 'gym'])) return '« equipment » invalide';
      if (!Array.isArray(i.injuries) || !i.injuries.every((x) => isOneOf(x, ['knee', 'back', 'shoulder', 'wrist', 'ankle']))) return '« injuries » invalide';
      if (!isInt(i.weeks, 4, 12)) return '« weeks » doit être entre 4 et 12';
      if (!isOneOf(i.cardio, ['run', 'ride', 'none'])) return '« cardio » invalide';
      if (i.templates !== undefined && !Array.isArray(i.templates)) return '« templates » doit être une liste';
      return null;
    }
    case 'adjust_today_session':
      return isOneOf(i.mode, ['light', 'normal', 'rest']) && isText(i.reason, 300) ? null : '« mode » (light/normal/rest) et « reason » sont requis';
    case 'save_memory':
      return isText(i.key, 60) && isText(i.value, 300) ? null : '« key » (≤ 60 caractères) et « value » (≤ 300) sont requis';
    case 'show_chart':
      return isOneOf(i.metric, CHART_METRICS) && isInt(i.days, 7, 90) ? null : '« metric » ou « days » invalide';
    case 'show_session':
      return typeof i.date === 'string' && (i.date === 'today' || /^\d{4}-\d{2}-\d{2}$/.test(i.date)) ? null : '« date » : « today » ou AAAA-MM-JJ';
    default:
      return `outil inconnu « ${name} »`;
  }
}

/**
 * Exécute un outil validé.
 * @param {string} name @param {Record<string, unknown>} input @param {ToolHost} host @param {string} today
 * @returns {Promise<{ content: string, card: Card | null, isError?: boolean }>}
 */
export async function runTool(name, input, host, today) {
  switch (name) {
    case 'get_metrics':
      return { content: JSON.stringify(host.metrics(/** @type {number} */ (input.days))), card: null };
    case 'get_workouts':
      return { content: JSON.stringify(host.workouts(/** @type {number} */ (input.days))), card: null };
    case 'create_program': {
      const r = await host.createProgram(input);
      return { content: r.summary, card: { kind: 'program', programId: r.programId } };
    }
    case 'adjust_today_session':
      return { content: await host.adjustToday(/** @type {'light' | 'normal' | 'rest'} */ (input.mode), String(input.reason)), card: { kind: 'session', date: today } };
    case 'save_memory':
      await host.saveMemory(String(input.key).trim(), String(input.value).trim());
      return { content: 'Enregistré.', card: { kind: 'memory', key: String(input.key).trim(), value: String(input.value).trim() } };
    case 'show_chart':
      return { content: 'Graphique affiché sous ta réponse.', card: { kind: 'chart', metric: /** @type {ChartMetric} */ (input.metric), days: /** @type {number} */ (input.days) } };
    case 'show_session': {
      const date = input.date === 'today' ? today : String(input.date);
      if (!host.hasSession(date)) return { content: `Aucune séance prévue le ${date}.`, card: null, isError: true };
      return { content: 'Séance affichée sous ta réponse.', card: { kind: 'session', date } };
    }
    default:
      return { content: `Outil inconnu : ${name}`, card: null, isError: true };
  }
}

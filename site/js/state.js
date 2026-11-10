// @ts-check
/**
 * État de l'app en mémoire, chargé depuis IndexedDB, et dérivés (progression, corrélations,
 * séance du jour adaptée, besoin de sommeil de ce soir). Les écrans lisent seulement cet état.
 */
import * as db from './data/db.js';
import { loadRecords } from './data/pipeline.js';
import { normalizeProfile, minutesOf } from './data/profile.js';
import { localDateKey } from './data/schema.js';
import { computeProgress } from './scoring/gamification.js';
import { computeCorrelations } from './scoring/correlations.js';
import { tonightNeed } from './scoring/scores.js';
import { adaptSession } from './program/generator.js';
import { mean } from './scoring/stats.js';

/** @typedef {import('./scoring/scores.js').DayRecord} DayRecord */
/** @typedef {import('./data/profile.js').Profile} Profile */
/** @typedef {import('./program/generator.js').Program} Program */
/** @typedef {import('./program/generator.js').PlannedSession} PlannedSession */
/** @typedef {import('./scoring/gamification.js').BreathingSession} BreathingSession */
/** @typedef {import('./scoring/gamification.js').Progress} Progress */
/** @typedef {import('./scoring/correlations.js').Correlation} Correlation */
/** @typedef {import('./data/schema.js').JournalEntry} JournalEntry */
/** @typedef {import('./coach/tools.js').Card} Card */

/**
 * @typedef {object} ChatMessage
 * @property {string} id
 * @property {number} createdAt
 * @property {'user' | 'coach'} role
 * @property {string} text
 * @property {Card[]} cards
 * @property {'ai' | 'rules'} source
 * @property {import('./vendor/anthropic.js').Anthropic.Beta.BetaMessageParam[]} [api] tour complet (pour le rejouer à l'API)
 */

/**
 * @typedef {object} Insight
 * @property {string} id      « brief:AAAA-MM-JJ » ou « week:AAAA-MM-JJ »
 * @property {'brief' | 'week'} type
 * @property {string} date
 * @property {string} text
 * @property {'ai' | 'rules'} source
 * @property {number} createdAt
 */

/**
 * @typedef {object} NotifSettings
 * @property {boolean} enabled
 * @property {string} briefTime   « 07:30 »
 * @property {boolean} bedtime     rappel 30 min avant l'heure de coucher conseillée
 * @property {boolean} challenge   défi du lundi
 */

export const S = {
  loaded: false,
  onboarded: false,
  /** @type {string | null} */ mode: null,
  /** @type {Profile} */ profile: normalizeProfile({}),
  /** @type {string | null} */ apiKey: null,
  /** @type {DayRecord[]} */ records: [],
  /** @type {JournalEntry[]} */ journal: [],
  /** @type {PlannedSession[]} */ sessions: [],
  /** @type {Program[]} */ programs: [],
  /** @type {BreathingSession[]} */ breathing: [],
  /** @type {{ key: string, value: string, updatedAt: number }[]} */ memory: [],
  /** @type {ChatMessage[]} */ messages: [],
  /** @type {Map<string, Insight>} */ insights: new Map(),
  /** @type {Progress | null} */ progress: null,
  /** @type {Correlation[]} */ correlations: [],
  /** @type {{ at: number, fileName: string, sources: string[], counts: Record<string, number>, workouts: number } | null} */ lastImport: null,
  /** @type {{ date: string, count: number }} */ aiUsage: { date: '', count: 0 },
  /** @type {NotifSettings} */ notif: { enabled: false, briefTime: '07:30', bedtime: true, challenge: true },
  /** @type {number | null} */ lastSeenLevel: null,
  /** @type {string[]} */ seenBadges: [],
  /** @type {{ hasSamples: boolean, first: number | null, last: number | null }} */ data: { hasSamples: false, first: null, last: null },
  busy: false,
};

/** Limite d'appels IA par jour (coûts et abus). */
export const AI_DAILY_LIMIT = 60;

export const todayKey = () => localDateKey(new Date());

/** Dernier résumé quotidien (aujourd'hui si les données sont à jour). */
export function latest() {
  return S.records.length ? S.records[S.records.length - 1] : null;
}

/** @param {string} date */
export function recordFor(date) {
  return S.records.find((r) => r.date === date) ?? null;
}

export function activeProgram() {
  return S.programs.find((p) => p.status === 'active') ?? null;
}

/**
 * Séance d'une date (programme actif), adaptée à la récupération du jour si c'est aujourd'hui.
 * @param {string} date
 */
export function sessionOn(date) {
  const p = activeProgram();
  if (!p) return null;
  const s = S.sessions.find((x) => x.programId === p.id && x.date === date);
  if (!s) return null;
  if (date !== todayKey()) return s;
  const r = recordFor(date);
  return adaptSession(s, r?.zone ?? null);
}

/** Délai moyen d'endormissement (au lit → endormi) sur 7 nuits, en minutes. */
export function latencyMin() {
  const v = S.records.slice(-7).filter((r) => r.night && !r.night.inBedOnly)
    .map((r) => /** @type {number} */ (r.night?.sleepStart) - /** @type {number} */ (r.night?.start))
    .map((ms) => ms / 60000).filter((m) => m >= 0 && m < 90);
  return Math.round(mean(v) ?? 12);
}

export function wakeMinutes() {
  return minutesOf(S.profile.wakeTime);
}

export function tonight() {
  return tonightNeed(S.records);
}

/** Recalcule progression et corrélations (rapide, sans relire les mesures brutes). */
export function refreshDerived() {
  S.progress = S.records.length
    ? computeProgress({ records: S.records, journal: S.journal, sessions: S.sessions, breathing: S.breathing, today: todayKey() })
    : null;
  S.correlations = computeCorrelations(S.records, S.journal);
}

/** Charge tout l'état depuis le stockage local. */
export async function loadAll() {
  const [records, journal, sessions, programs, breathing, memory, messages, insights, range] = await Promise.all([
    loadRecords(),
    db.getJournal(),
    db.getAll('sessions'),
    db.getAll('programs'),
    db.getAll('breathing'),
    db.getAll('memory'),
    db.getAll('messages'),
    db.getAll('insights'),
    db.getSampleRange(),
  ]);
  const meta = await Promise.all(['profile', 'mode', 'apiKey', 'onboarded', 'lastImport', 'aiUsage', 'notif', 'lastSeenLevel', 'seenBadges'].map((k) => db.getMeta(k)));
  const [profile, mode, apiKey, onboarded, lastImport, aiUsage, notif, lastSeenLevel, seenBadges] = meta;
  S.profile = normalizeProfile(profile);
  S.mode = typeof mode === 'string' ? mode : null;
  S.apiKey = typeof apiKey === 'string' && apiKey ? apiKey : null;
  S.onboarded = onboarded === true;
  S.lastImport = /** @type {typeof S.lastImport} */ (lastImport ?? null);
  S.aiUsage = /** @type {typeof S.aiUsage} */ (aiUsage ?? { date: '', count: 0 });
  S.notif = { ...S.notif, .../** @type {object} */ (notif ?? {}) };
  S.lastSeenLevel = typeof lastSeenLevel === 'number' ? lastSeenLevel : null;
  S.seenBadges = Array.isArray(seenBadges) ? seenBadges : [];
  S.records = records;
  S.journal = journal.sort((a, b) => (a.date < b.date ? -1 : 1));
  S.sessions = /** @type {PlannedSession[]} */ (sessions).sort((a, b) => (a.date < b.date ? -1 : 1));
  S.programs = /** @type {Program[]} */ (programs);
  S.breathing = /** @type {BreathingSession[]} */ (breathing).sort((a, b) => a.start - b.start);
  S.memory = /** @type {typeof S.memory} */ (memory);
  S.messages = /** @type {ChatMessage[]} */ (messages).sort((a, b) => a.createdAt - b.createdAt);
  S.insights = new Map(/** @type {Insight[]} */ (insights).map((i) => [i.id, i]));
  S.data = { hasSamples: range !== null, first: range?.first ?? null, last: range?.last ?? null };
  refreshDerived();
  S.loaded = true;
}

/**
 * Enregistre le profil (fusion).
 * @param {Partial<Profile>} patch
 */
export async function saveProfile(patch) {
  S.profile = normalizeProfile({ ...S.profile, ...patch });
  await db.setMeta('profile', S.profile);
}

/** @param {string} key @param {unknown} value */
export async function saveMeta(key, value) {
  await db.setMeta(key, value);
}

/** Compte un appel IA ; renvoie false si la limite du jour est atteinte. */
export async function useAiQuota() {
  const today = todayKey();
  if (S.aiUsage.date !== today) S.aiUsage = { date: today, count: 0 };
  if (S.aiUsage.count >= AI_DAILY_LIMIT) return false;
  S.aiUsage.count++;
  await db.setMeta('aiUsage', S.aiUsage);
  return true;
}

/** Le coach IA peut-il être utilisé (clé + consentement) ? */
export function aiReady() {
  return Boolean(S.apiKey && S.profile.aiConsent);
}

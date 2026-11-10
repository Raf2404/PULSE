// @ts-check
/**
 * Level up (section 4.5) : XP gagnée par des comportements sains (pas par la performance brute),
 * niveaux 1 à 50 et rangs, séries avec un joker par semaine, badges, attributs du personnage
 * et défi de la semaine. Tout est recalculé à partir des données : rien à tricher, rien à perdre.
 */
import { CONFIG } from './config.js';
import { clamp, mean, sum } from './stats.js';
import { localDateKey } from '../data/schema.js';

/** @typedef {import('./scores.js').DayRecord} DayRecord */
/** @typedef {import('../data/schema.js').JournalEntry} JournalEntry */
/** @typedef {import('../program/generator.js').PlannedSession} PlannedSession */

/**
 * @typedef {object} BreathingSession
 * @property {string} id
 * @property {number} start
 * @property {number} durationSec
 * @property {string} pattern
 */

/**
 * @typedef {object} XpEvent
 * @property {string} date
 * @property {keyof typeof CONFIG.xp.points | 'challenge'} type
 * @property {number} points
 * @property {string} label
 */

/**
 * @typedef {object} Badge
 * @property {string} code
 * @property {string} name
 * @property {string} description
 * @property {string} icon  nom d'icône Lucide
 * @property {string | null} earnedAt
 */

/**
 * @typedef {object} Challenge
 * @property {string} week       lundi de la semaine
 * @property {string} code
 * @property {string} title
 * @property {string} why
 * @property {number} target
 * @property {number} progress
 * @property {'active' | 'done' | 'failed'} status
 * @property {number} reward
 */

/**
 * @typedef {object} Progress
 * @property {number} xpTotal
 * @property {number} level
 * @property {string} rank
 * @property {number} levelFloor     XP cumulée au début du niveau
 * @property {number} levelCeil      XP cumulée pour le niveau suivant
 * @property {number} ratio          progression dans le niveau (0–1)
 * @property {XpEvent[]} events
 * @property {{ regularSleep: { current: number, best: number, jokerAvailable: boolean }, programWeeks: { current: number, best: number } }} streaks
 * @property {Badge[]} badges
 * @property {{ endurance: number, force: number, recuperation: number, discipline: number }} attributes
 * @property {Challenge | null} challenge
 * @property {Challenge[]} pastChallenges
 */

/** XP cumulée pour atteindre le niveau n. @param {number} n */
export function xpForLevel(n) {
  return n <= 1 ? 0 : Math.round(CONFIG.xp.base * n ** CONFIG.xp.exponent);
}

/** @param {number} xp */
export function levelOf(xp) {
  let n = 1;
  while (n < CONFIG.xp.maxLevel && xp >= xpForLevel(n + 1)) n++;
  return n;
}

/** @param {number} level */
export function rankOf(level) {
  let name = CONFIG.xp.ranks[0].name;
  for (const r of CONFIG.xp.ranks) if (level >= r.from) name = r.name;
  return name;
}

/** @param {string} date @param {number} days */
function addDays(date, days) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

/** Lundi (AAAA-MM-JJ) de la semaine d'une date. @param {string} date */
export function weekOf(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateKey(d);
}

/** @param {number} t */
function minutesFromNoon(t) {
  const d = new Date(t);
  const m = d.getHours() * 60 + d.getMinutes();
  return m < 720 ? m + 720 : m - 720;
}

/**
 * Coucher régulier : à ±30 min de la moyenne des 7 nuits précédentes.
 * @param {DayRecord[]} records @param {number} i
 */
function regularBedtime(records, i) {
  const n = records[i].night;
  if (!n) return false;
  const prev = records.slice(Math.max(0, i - 7), i).filter((r) => r.night);
  if (prev.length < 3) return false;
  const avg = /** @type {number} */ (mean(prev.map((r) => minutesFromNoon(/** @type {number} */ (r.night?.start)))));
  return Math.abs(minutesFromNoon(n.start) - avg) <= CONFIG.xp.regularBedtimeToleranceMin;
}

/** Libellé d'heure « 23 h 10 ». @param {number} minutesFromMidnight */
export function hhmm(minutesFromMidnight) {
  const m = ((Math.round(minutesFromMidnight) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/**
 * Calcule toute la progression.
 * @param {{ records: DayRecord[], journal: JournalEntry[], sessions: PlannedSession[], breathing: BreathingSession[], today: string }} input
 * @returns {Progress}
 */
export function computeProgress({ records, journal, sessions, breathing, today }) {
  const P = CONFIG.xp.points;
  /** @type {XpEvent[]} */
  const events = [];
  const journalDates = new Set(journal.map((j) => j.date));
  const doneByDate = new Map();
  for (const s of sessions) if (s.done) doneByDate.set(s.date, (doneByDate.get(s.date) ?? 0) + 1);
  /** @type {Map<string, number>} */
  const breathByDate = new Map();
  for (const b of breathing) {
    if (b.durationSec < CONFIG.xp.breathingMinSec) continue;
    const d = localDateKey(b.start);
    breathByDate.set(d, (breathByDate.get(d) ?? 0) + 1);
  }

  /** @type {Record<string, boolean>[]} */
  const flags = [];
  records.forEach((r, i) => {
    const f = {
      sleepNeedMet: !!r.night && r.night.asleepMin >= r.needMin,
      regularBedtime: regularBedtime(records, i),
      strainInTarget: !!r.target && r.strain >= r.target[0] && r.strain <= r.target[1] && (r.date < today || r.strain >= r.target[0]),
      restOnRedDay: r.zone === 'red' && r.date < today && !!r.target && r.strain <= r.target[1],
      journalFilled: journalDates.has(r.date),
    };
    // « Effort dans la cible » d'une journée rouge = repos respecté : on ne compte pas deux fois.
    if (f.restOnRedDay) f.strainInTarget = false;
    flags.push(f);
    if (f.sleepNeedMet) events.push({ date: r.date, type: 'sleepNeedMet', points: P.sleepNeedMet, label: 'Nuit qui couvre ton besoin' });
    if (f.regularBedtime) events.push({ date: r.date, type: 'regularBedtime', points: P.regularBedtime, label: 'Coucher régulier' });
    if (f.strainInTarget) events.push({ date: r.date, type: 'strainInTarget', points: P.strainInTarget, label: 'Effort dans la cible du jour' });
    if (f.restOnRedDay) events.push({ date: r.date, type: 'restOnRedDay', points: P.restOnRedDay, label: 'Repos respecté un jour rouge' });
  });
  for (const d of journalDates) events.push({ date: d, type: 'journalFilled', points: P.journalFilled, label: 'Journal du soir rempli' });
  for (const [d, n] of doneByDate) for (let k = 0; k < n; k++) events.push({ date: d, type: 'programSessionDone', points: P.programSessionDone, label: 'Séance du programme faite' });
  for (const [d, n] of breathByDate) {
    for (let k = 0; k < Math.min(n, CONFIG.xp.breathingPerDayMax); k++) events.push({ date: d, type: 'breathing', points: P.breathing, label: 'Respiration guidée' });
  }

  // ---- Défis hebdo (passés et en cours)
  const weeks = [...new Set(records.map((r) => weekOf(r.date)))].sort();
  /** @type {Challenge[]} */
  const allChallenges = [];
  for (const w of weeks) {
    const c = challengeForWeek(w, records, journal, breathing, today);
    if (c) allChallenges.push(c);
  }
  for (const c of allChallenges) {
    if (c.status === 'done') events.push({ date: addDays(c.week, 6) < today ? addDays(c.week, 6) : today, type: 'challenge', points: c.reward, label: `Défi réussi : ${c.title}` });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const xpTotal = sum(events.map((e) => e.points));
  const level = levelOf(xpTotal);
  const levelFloor = xpForLevel(level);
  const levelCeil = level >= CONFIG.xp.maxLevel ? levelFloor : xpForLevel(level + 1);

  // ---- Séries
  const regular = streakWithJoker(records.map((r, i) => ({ date: r.date, ok: flags[i].regularBedtime, known: !!r.night || r.date === today })), today);
  const programWeeks = programWeekStreak(sessions, today);

  // ---- Attributs (montent avec les actions)
  const cardioMin = sum(records.map((r) => sum(r.zoneMin.slice(1))));
  const strengthSessions = records.reduce((acc, r) => acc + r.workouts.filter((w) => w.type === 'strength' || w.type === 'hiit').length, 0)
    + sessions.filter((s) => s.done && s.kind === 'strength').length;
  const greenDays = records.filter((r) => r.zone === 'green').length;
  const attrPoints = {
    endurance: cardioMin / 20,
    force: strengthSessions * 3,
    recuperation: greenDays * 2 + flags.filter((f) => f.restOnRedDay).length * 3 + flags.filter((f) => f.sleepNeedMet).length,
    discipline: flags.filter((f) => f.regularBedtime).length + journalDates.size + doneByDate.size * 2 + breathByDate.size,
  };
  /** @param {number} p */
  const attrLevel = (p) => clamp(1 + Math.floor(Math.sqrt(p)), 1, 99);

  const challenge = allChallenges.find((c) => c.week === weekOf(today)) ?? null;

  return {
    xpTotal,
    level,
    rank: rankOf(level),
    levelFloor,
    levelCeil,
    ratio: levelCeil === levelFloor ? 1 : clamp((xpTotal - levelFloor) / (levelCeil - levelFloor), 0, 1),
    events,
    streaks: { regularSleep: regular, programWeeks },
    badges: computeBadges({ records, flags, journal, sessions, breathing, level, regularBest: regular.best, events }),
    attributes: {
      endurance: attrLevel(attrPoints.endurance),
      force: attrLevel(attrPoints.force),
      recuperation: attrLevel(attrPoints.recuperation),
      discipline: attrLevel(attrPoints.discipline),
    },
    challenge,
    pastChallenges: allChallenges.filter((c) => c.week !== weekOf(today)),
  };
}

/**
 * Série avec un joker par semaine : un jour manqué par semaine ne casse pas la série.
 * @param {{ date: string, ok: boolean, known: boolean }[]} days triés
 * @param {string} today
 */
export function streakWithJoker(days, today) {
  let current = 0;
  let best = 0;
  /** @type {Set<string>} */
  const jokerWeeks = new Set();
  for (const d of days) {
    if (d.ok) {
      current++;
    } else if (d.date === today && !d.ok) {
      // aujourd'hui pas encore joué : ne casse rien
    } else {
      const w = weekOf(d.date);
      if (!jokerWeeks.has(w) && current > 0) jokerWeeks.add(w);
      else current = 0;
    }
    best = Math.max(best, current);
  }
  return { current, best, jokerAvailable: !jokerWeeks.has(weekOf(today)) };
}

/**
 * Semaines consécutives de programme complètes (toutes les séances prévues faites).
 * @param {PlannedSession[]} sessions @param {string} today
 */
function programWeekStreak(sessions, today) {
  /** @type {Map<string, { planned: number, done: number }>} */
  const byWeek = new Map();
  for (const s of sessions) {
    const w = weekOf(s.date);
    const v = byWeek.get(w) ?? { planned: 0, done: 0 };
    v.planned++;
    if (s.done) v.done++;
    byWeek.set(w, v);
  }
  const currentWeek = weekOf(today);
  let current = 0;
  let best = 0;
  for (const w of [...byWeek.keys()].sort()) {
    if (w >= currentWeek) break;
    const v = /** @type {{ planned: number, done: number }} */ (byWeek.get(w));
    current = v.done >= v.planned ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { current, best };
}

/** Catalogue des badges. */
export const BADGES = /** @type {const} */ ([
  { code: 'early_bird', name: 'Lève-tôt', description: '5 réveils avant 7 h', icon: 'sun' },
  { code: 'perfect_7', name: '7 nuits parfaites', description: '7 nuits d\'affilée qui couvrent ton besoin', icon: 'moon' },
  { code: 'steps_10k', name: 'Mur des 10 000 pas', description: 'Une journée à 10 000 pas ou plus', icon: 'footprints' },
  { code: 'comeback', name: 'Retour de blessure', description: 'Reprendre l\'entraînement après au moins 7 jours d\'arrêt', icon: 'heart-pulse' },
  { code: 'first_session', name: 'Premier pas', description: 'Première séance du programme faite', icon: 'dumbbell' },
  { code: 'program_week', name: 'Semaine parfaite', description: 'Toutes les séances d\'une semaine de programme', icon: 'flame' },
  { code: 'streak_7', name: 'Série de 7', description: '7 couchers réguliers d\'affilée', icon: 'flame' },
  { code: 'journal_7', name: 'Plume du soir', description: '7 soirs de journal', icon: 'sparkles' },
  { code: 'zen', name: 'Zen', description: '5 séances de respiration guidée', icon: 'wind' },
  { code: 'green_week', name: 'Semaine verte', description: '5 jours verts sur une même semaine', icon: 'battery-medium' },
  { code: 'sweet_spot', name: 'Juste dosé', description: '10 jours avec l\'effort dans la cible', icon: 'activity' },
  { code: 'challenge_1', name: 'Défi relevé', description: 'Premier défi de la semaine réussi', icon: 'shield-check' },
  { code: 'level_10', name: 'Athlète', description: 'Atteindre le niveau 10', icon: 'sparkles' },
  { code: 'level_20', name: 'Pro', description: 'Atteindre le niveau 20', icon: 'sparkles' },
  { code: 'level_30', name: 'Élite', description: 'Atteindre le niveau 30', icon: 'sparkles' },
]);

/**
 * @param {{ records: DayRecord[], flags: Record<string, boolean>[], journal: JournalEntry[], sessions: PlannedSession[],
 *   breathing: BreathingSession[], level: number, regularBest: number, events: XpEvent[] }} o
 * @returns {Badge[]}
 */
function computeBadges(o) {
  /** @type {Record<string, string | null>} */
  const earned = {};
  /** @param {string} code @param {string | null | undefined} date */
  const earn = (code, date) => { if (date && !earned[code]) earned[code] = date; };

  // Lève-tôt : 5e réveil avant 7 h
  let early = 0;
  for (const r of o.records) {
    if (r.night && new Date(r.night.end).getHours() < 7) { early++; if (early === 5) earn('early_bird', r.date); }
  }
  // 7 nuits parfaites d'affilée
  let run = 0;
  o.records.forEach((r, i) => {
    run = o.flags[i].sleepNeedMet ? run + 1 : 0;
    if (run === 7) earn('perfect_7', r.date);
  });
  earn('steps_10k', o.records.find((r) => (r.steps ?? 0) >= 10000)?.date);
  // Retour après ≥ 7 jours sans séance
  let lastWorkoutDay = null;
  for (const r of o.records) {
    if (r.workouts.length) {
      if (lastWorkoutDay && (new Date(`${r.date}T12:00:00`).getTime() - new Date(`${lastWorkoutDay}T12:00:00`).getTime()) / 86400000 >= 8) earn('comeback', r.date);
      lastWorkoutDay = r.date;
    }
  }
  const done = o.sessions.filter((s) => s.done).sort((a, b) => (a.date < b.date ? -1 : 1));
  earn('first_session', done[0]?.date);
  const weekStats = new Map();
  for (const s of o.sessions) {
    const w = weekOf(s.date);
    const v = weekStats.get(w) ?? { planned: 0, done: 0, last: s.date };
    v.planned++;
    if (s.done) v.done++;
    if (s.date > v.last) v.last = s.date;
    weekStats.set(w, v);
  }
  for (const v of weekStats.values()) if (v.planned > 0 && v.done === v.planned) earn('program_week', v.last);
  // Série de 7 couchers réguliers
  let reg = 0;
  o.records.forEach((r, i) => {
    reg = o.flags[i].regularBedtime ? reg + 1 : (r.night ? 0 : reg);
    if (reg === 7) earn('streak_7', r.date);
  });
  const journalSorted = [...o.journal].sort((a, b) => (a.date < b.date ? -1 : 1));
  earn('journal_7', journalSorted[6]?.date);
  const breathSorted = o.breathing.filter((b) => b.durationSec >= CONFIG.xp.breathingMinSec).sort((a, b) => a.start - b.start);
  earn('zen', breathSorted[4] ? localDateKey(breathSorted[4].start) : null);
  const greenByWeek = new Map();
  for (const r of o.records) {
    if (r.zone !== 'green') continue;
    const w = weekOf(r.date);
    const n = (greenByWeek.get(w) ?? 0) + 1;
    greenByWeek.set(w, n);
    if (n === 5) earn('green_week', r.date);
  }
  let target = 0;
  o.records.forEach((r, i) => { if (o.flags[i].strainInTarget) { target++; if (target === 10) earn('sweet_spot', r.date); } });
  earn('challenge_1', o.events.find((e) => e.type === 'challenge')?.date);
  // Niveaux : date à laquelle l'XP cumulée a franchi le seuil
  let acc = 0;
  for (const e of o.events) {
    acc += e.points;
    for (const [code, lvl] of /** @type {[string, number][]} */ ([['level_10', 10], ['level_20', 20], ['level_30', 30]])) {
      if (acc >= xpForLevel(lvl)) earn(code, e.date);
    }
  }
  return BADGES.map((b) => ({ ...b, earnedAt: earned[b.code] ?? null }));
}

/**
 * Défi de la semaine, choisi selon le point faible des 14 jours précédents.
 * @param {string} week lundi
 * @param {DayRecord[]} records @param {JournalEntry[]} journal @param {BreathingSession[]} breathing @param {string} today
 * @returns {Challenge | null}
 */
export function challengeForWeek(week, records, journal, breathing, today) {
  const before = records.filter((r) => r.date < week && r.date >= addDays(week, -14));
  if (before.length < 7) return null;
  const inWeek = records.filter((r) => r.date >= week && r.date <= addDays(week, 6) && r.date <= today);
  const nights = before.filter((r) => r.night);
  const bedAvg = nights.length ? /** @type {number} */ (mean(nights.map((r) => minutesFromNoon(/** @type {number} */ (r.night?.start))))) : null;
  const reg = /** @type {number | null} */ (mean(before.map((r) => r.pillars.regularity).filter((v) => v !== null).map(Number)));
  const dur = /** @type {number | null} */ (mean(before.map((r) => r.pillars.duration).filter((v) => v !== null).map(Number)));
  const steps = /** @type {number | null} */ (mean(before.map((r) => r.steps).filter((v) => v !== null).map(Number)));
  const journalDays = journal.filter((j) => j.date < week && j.date >= addDays(week, -7)).length;
  const targetDays = before.filter((r) => r.target && r.strain >= r.target[0] && r.strain <= r.target[1]).length;

  /** @type {{ code: string, deficit: number, title: string, why: string, target: number, count: (r: DayRecord) => boolean }[]} */
  const options = [];
  if (bedAvg !== null) {
    // Coucher moyen tardif : viser 30 min plus tôt (au plus tard 23 h).
    const goal = Math.min(bedAvg - 30, 660); // minutes depuis midi ; 660 = 23 h
    options.push({
      code: 'early_bed', deficit: clamp((bedAvg - 660) / 60, 0, 2),
      title: `5 couchers avant ${hhmm(goal + 720)}`, why: 'Tes couchers sont tardifs ces derniers temps.',
      target: 5, count: (r) => !!r.night && minutesFromNoon(r.night.start) <= goal,
    });
  }
  if (reg !== null) {
    options.push({
      code: 'regular', deficit: clamp((70 - reg) / 35, 0, 2),
      title: '5 couchers réguliers (±30 min)', why: 'Tes heures de coucher varient beaucoup d\'un soir à l\'autre.',
      target: 5, count: (r) => r.pillars.regularity !== null && /** @type {number} */ (r.pillars.regularityDevMin) <= 30,
    });
  }
  if (dur !== null) {
    options.push({
      code: 'need', deficit: clamp((92 - dur) / 15, 0, 2),
      title: '5 nuits qui couvrent ton besoin', why: 'Tes nuits sont un peu courtes par rapport à ton besoin.',
      target: 5, count: (r) => !!r.night && r.night.asleepMin >= r.needMin,
    });
  }
  if (steps !== null) {
    options.push({
      code: 'steps', deficit: clamp((7500 - steps) / 3000, 0, 2),
      title: '4 jours à 8 000 pas', why: 'Tu bouges peu en dehors des séances.',
      target: 4, count: (r) => (r.steps ?? 0) >= 8000,
    });
  }
  options.push({
    code: 'target', deficit: clamp((3 - targetDays / 2) / 2, 0, 2),
    title: '3 jours dans ta cible d\'effort', why: 'Ton effort colle rarement à ta récupération.',
    target: 3, count: (r) => !!r.target && r.strain >= r.target[0] && r.strain <= r.target[1],
  });
  options.push({
    code: 'journal', deficit: clamp((4 - journalDays) / 4, 0, 1.2),
    title: 'Remplir le journal 5 soirs', why: 'Le journal aide à comprendre ce qui pèse sur ton sommeil.',
    target: 5, count: (r) => journal.some((j) => j.date === r.date),
  });
  const breathedBefore = breathing.some((b) => localDateKey(b.start) >= addDays(week, -7) && localDateKey(b.start) < week);
  options.push({
    code: 'breathing', deficit: breathedBefore ? 0 : 0.25,
    title: '3 séances de respiration guidée', why: 'Quelques minutes de respiration aident à faire baisser la pression.',
    target: 3, count: (r) => breathing.some((b) => localDateKey(b.start) === r.date && b.durationSec >= CONFIG.xp.breathingMinSec),
  });
  options.sort((a, b) => b.deficit - a.deficit || a.code.localeCompare(b.code));
  const best = options[0];
  const progress = inWeek.filter(best.count).length;
  const weekOver = addDays(week, 6) < today;
  const status = progress >= best.target ? 'done' : weekOver ? 'failed' : 'active';
  return { week, code: best.code, title: `Cette semaine : ${best.title}`, why: best.why, target: best.target, progress: Math.min(progress, best.target), status, reward: 100 };
}

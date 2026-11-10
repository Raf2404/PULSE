// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo } from '../site/js/data/demo.js';
import { buildDays, groupByType } from '../site/js/scoring/daily.js';
import { computeScores } from '../site/js/scoring/scores.js';
import { computeProgress, xpForLevel, levelOf, rankOf, streakWithJoker, weekOf, BADGES } from '../site/js/scoring/gamification.js';
import { computeCorrelations } from '../site/js/scoring/correlations.js';
import { stressBaseline, stressOfDay, stressLevel } from '../site/js/scoring/stress.js';
import { createProgram, adaptSession, buildTemplates, sanitizeTemplates, progressTemplate } from '../site/js/program/generator.js';
import { available } from '../site/js/program/exercises.js';
import { briefText, quickAnswer, weeklyReview, trendTitle, bedtimeText, debtPlan } from '../site/js/coach/rules.js';

const END = new Date(2026, 10, 10, 9, 30);
const TODAY = '2026-11-10';
const demo = generateDemo({ end: END });
const { days } = buildDays({ byType: groupByType(demo.samples), workouts: demo.workouts, hrMax: 190, hrRest: null });
const records = computeScores(days);
const MEDICAL = /diagnos|maladie|infection|fièvre|pathologie|grippe|covid|traitement/i;

describe('programmes', () => {
  const q = /** @type {import('../site/js/program/generator.js').Questionnaire} */ ({ goal: 'muscle', level: 'intermediate', days: [1, 3, 5], equipment: 'dumbbells', injuries: ['knee'], weeks: 8, cardio: 'none' });

  test('respecte le matériel et les blessures', () => {
    const pool = available({ equipment: 'dumbbells', injuries: ['knee'] });
    assert.ok(pool.every((e) => e.equipment !== 'gym' && !e.avoid.includes('knee')));
    const t = buildTemplates(q);
    assert.equal(t.length, 3);
    const ids = t.flatMap((x) => x.exercises.map((e) => e.exerciseId));
    assert.ok(ids.length >= 12);
    assert.ok(!ids.includes('back_squat') && !ids.includes('lunge') && !ids.includes('goblet_squat'), ids.join(','));
  });

  test('déroule les semaines avec progression et semaine allégée', () => {
    const { program, sessions } = createProgram(q, { now: new Date(2026, 10, 8, 10) }); // dimanche 8 nov.
    assert.equal(program.startDate, '2026-11-09', 'démarre le lundi suivant');
    assert.equal(sessions.length, 24);
    assert.equal(sessions.filter((s) => s.deload).length, 3 * 1, 'semaine 4 allégée (pas la dernière)');
    const w1 = sessions.find((s) => s.week === 1 && s.templateKey === 'A');
    const w3 = sessions.find((s) => s.week === 3 && s.templateKey === 'A');
    const w4 = sessions.find((s) => s.week === 4 && s.templateKey === 'A');
    assert.ok(w1 && w3 && w4);
    assert.ok(w3.exercises[0].sets > w1.exercises[0].sets);
    assert.ok(w4.exercises[0].sets < w3.exercises[0].sets);
    assert.ok(sessions.every((s) => s.date >= '2026-11-09'));
  });

  test('séance adaptée à la récupération', () => {
    const { sessions } = createProgram({ ...q, goal: 'endurance', cardio: 'run' }, { now: new Date(2026, 10, 10, 8) });
    const s = sessions.find((x) => x.cardio?.intervals);
    assert.ok(s);
    const red = adaptSession(s, 'red');
    assert.equal(red.version, 'light');
    assert.equal(red.cardio?.zone, 2);
    assert.equal(red.cardio?.intervals, null);
    assert.ok(/** @type {number} */ (red.cardio?.durationMin) < /** @type {number} */ (s.cardio?.durationMin));
    assert.equal(adaptSession(s, 'green').version, 'normal');
    assert.ok(progressTemplate({ key: 'A', title: 'x', kind: 'cardio', focus: '', exercises: [], cardio: s.cardio }, 4, true).cardio);
  });

  test('accepte des modèles proposés par le coach, en les bornant', () => {
    const t = sanitizeTemplates([{ title: 'Push', kind: 'strength', exercises: [{ exerciseId: 'pushup', sets: 99, reps: 12 }, { name: 'Élévations latérales', sets: 3 }] }, 'n\'importe quoi']);
    assert.equal(t.length, 1);
    assert.equal(t[0].exercises[0].sets, 8);
    assert.equal(t[0].exercises[0].name, 'Pompes');
    assert.equal(t[0].exercises[1].exerciseId, 'custom');
  });
});

describe('level up', () => {
  test('courbe d\'XP conforme à la spec (cumulée)', () => {
    assert.equal(xpForLevel(1), 0);
    assert.ok(Math.abs(xpForLevel(2) - 280) < 5);
    assert.ok(Math.abs(xpForLevel(10) - 3160) < 5);
    assert.ok(Math.abs(xpForLevel(30) - 16400) < 50);
    assert.ok(Math.abs(xpForLevel(50) - 35400) < 50);
    assert.equal(levelOf(0), 1);
    assert.equal(levelOf(xpForLevel(10)), 10);
    assert.equal(levelOf(xpForLevel(10) - 1), 9);
    assert.equal(levelOf(1e9), 50);
    assert.deepEqual([1, 9, 10, 25, 40, 50].map(rankOf), ['Rookie', 'Rookie', 'Athlète', 'Pro', 'Légende', 'Légende']);
  });

  test('environ 175 XP par jour pour un utilisateur régulier → niveau 10 en ~3 semaines', () => {
    assert.ok(Math.abs(xpForLevel(10) / 175 - 18) < 3);
  });

  test('progression calculée sur la démo', () => {
    const { program, sessions } = createProgram({ goal: 'general', level: 'beginner', days: [1, 3, 5], equipment: 'none', injuries: [], weeks: 4, cardio: 'run' }, { now: new Date(2026, 9, 1) });
    const done = sessions.filter((s) => s.date < TODAY).slice(0, 6).map((s) => ({ ...s, done: true, rpe: 6, doneAt: Date.now() }));
    const breathing = [0, 1, 2, 3, 4].map((k) => ({ id: `b${k}`, start: new Date(2026, 10, 3 + k, 21).getTime(), durationSec: 180, pattern: 'coherence' }));
    const p = computeProgress({ records, journal: demo.journal, sessions: done, breathing, today: TODAY });
    assert.ok(program.id);
    assert.ok(p.xpTotal > 3000, `${p.xpTotal} XP`);
    assert.ok(p.level >= 8 && p.level <= 20, `niveau ${p.level}`);
    assert.ok(p.ratio >= 0 && p.ratio <= 1);
    assert.ok(p.xpTotal >= p.levelFloor && p.xpTotal < p.levelCeil);
    const perDay = p.xpTotal / records.length;
    assert.ok(perDay > 35 && perDay < 260, `${perDay.toFixed(0)} XP/jour`);
    assert.equal(p.events.filter((e) => e.type === 'programSessionDone').length, 6);
    assert.equal(p.events.filter((e) => e.type === 'breathing').length, 5);
    assert.ok(p.events.every((e) => e.date <= TODAY));
    // pas de « repos respecté » pour aujourd'hui (journée pas finie)
    assert.ok(!p.events.some((e) => e.type === 'restOnRedDay' && e.date === TODAY));
    const earned = p.badges.filter((b) => b.earnedAt).map((b) => b.code);
    for (const code of ['zen', 'first_session', 'journal_7', 'early_bird']) assert.ok(earned.includes(code), `badge ${code} : ${earned.join(',')}`);
    assert.equal(p.badges.length, BADGES.length);
    for (const v of Object.values(p.attributes)) assert.ok(v >= 1 && v <= 99);
    assert.ok(p.challenge, 'un défi cette semaine');
    assert.match(/** @type {string} */ (p.challenge?.title), /^Cette semaine : /);
    assert.ok(p.pastChallenges.length >= 8);
    assert.ok(p.pastChallenges.every((c) => c.status !== 'active'));
  });

  test('série : un joker par semaine', () => {
    const d = (/** @type {string} */ date, /** @type {boolean} */ ok) => ({ date, ok, known: true });
    // lun→dim : un raté le jeudi (joker), puis un 2e raté la même semaine casse la série
    const week = [d('2026-11-02', true), d('2026-11-03', true), d('2026-11-04', true), d('2026-11-05', false), d('2026-11-06', true), d('2026-11-07', false), d('2026-11-08', true)];
    const r = streakWithJoker(week, '2026-11-09');
    assert.equal(r.best, 4);
    assert.equal(r.current, 1);
    const r2 = streakWithJoker(week.slice(0, 5), '2026-11-06');
    assert.equal(r2.current, 4);
    assert.equal(r2.jokerAvailable, false);
    assert.equal(weekOf('2026-11-08'), '2026-11-02');
  });
});

describe('corrélations du journal', () => {
  test('retrouve l\'effet de l\'alcool sur la nuit suivante', () => {
    const c = computeCorrelations(records, demo.journal);
    const alc = c.find((x) => x.factor === 'alcohol');
    assert.ok(alc, c.map((x) => x.text).join(' | '));
    assert.ok(alc.diffPct < -8, alc.text);
    assert.ok(alc.nWith >= 3);
    assert.match(alc.text, /^Les soirs avec alcool, .* (baisse|monte) de \d+ % en moyenne \(\d+ soirs\)\.$/);
    assert.ok(c.every((x) => !MEDICAL.test(x.text)));
  });
});

describe('stress', () => {
  test('échelle 0–3 basée sur la FC des heures calmes', () => {
    const base = stressBaseline(records, TODAY);
    assert.ok(base);
    const yesterday = records.at(-2);
    assert.ok(yesterday);
    const s = stressOfDay(yesterday, base);
    assert.ok(s.hours.length >= 3, `${s.hours.length} heures calmes`);
    assert.ok(s.hours.every((h) => h.score >= 0 && h.score <= 3));
    assert.equal(stressLevel(0.5)?.label, 'Calme');
    assert.equal(stressLevel(2.9)?.label, 'Très élevé');
    // Jours notés très stressés dans le journal : stress d'après-midi plus haut en moyenne
    const stressed = new Set(demo.journal.filter((j) => j.stress >= 4).map((j) => j.date));
    const calm = new Set(demo.journal.filter((j) => j.stress <= 2).map((j) => j.date));
    /** @param {Set<string>} set */
    const avgAfternoon = (set) => {
      const v = records.filter((r) => set.has(r.date)).map((r) => stressOfDay(r, stressBaseline(records, r.date))).flatMap((x) => x.hours.filter((h) => h.hour >= 13 && h.hour < 19).map((h) => h.score));
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    assert.ok(avgAfternoon(stressed) > avgAfternoon(calm), `${avgAfternoon(stressed)} vs ${avgAfternoon(calm)}`);
  });
});

describe('coach à règles', () => {
  const ctx = { records, session: null, correlations: computeCorrelations(records, demo.journal), style: /** @type {const} */ ('bienveillant'), wakeMinutes: 420, tonightNeedMin: 470, latencyMin: 12 };

  test('brief du matin : 2–3 phrases, avec la récupération et une action', () => {
    const b = briefText({ records, session: null, style: 'bienveillant' });
    assert.match(b, /^Récupération \d+ %\./);
    const sentences = b.split(/(?<=[.!])\s/).length;
    assert.ok(sentences >= 2 && sentences <= 4, b);
    assert.ok(!MEDICAL.test(b));
    // pour chaque jour scoré, le brief reste cohérent avec la zone
    for (let i = 20; i < records.length; i++) {
      const t = briefText({ records: records.slice(0, i + 1), session: null, style: 'direct' });
      assert.ok(!MEDICAL.test(t), t);
      if (records[i].zone === 'red' && !records[i].alert) assert.match(t, /repos|Mobilité/i, t);
    }
  });

  test('brief en calibration et nuit manquante', () => {
    assert.match(briefText({ records: records.slice(0, 2), session: null, style: 'direct' }), /apprend à te connaître/);
    const missingIdx = records.findIndex((r, i) => i > 10 && !r.night);
    assert.match(briefText({ records: records.slice(0, missingIdx + 1), session: null, style: 'direct' }), /Pas de données de sommeil/);
  });

  test('questions rapides', () => {
    for (const k of /** @type {const} */ (['tired', 'train', 'week', 'sleep'])) {
      const a = quickAnswer(k, ctx);
      assert.ok(a.length > 40, `${k} : ${a}`);
      assert.ok(!MEDICAL.test(a), a);
    }
    assert.match(quickAnswer('train', ctx), /Effort conseillé/);
  });

  test('bilan hebdo : au plus 3 actions', () => {
    const w = weeklyReview(records, ctx.correlations);
    assert.ok(w.actions.length >= 1 && w.actions.length <= 3);
    assert.ok(w.worked.length + w.dropped.length >= 1);
  });

  test('titres qui disent la conclusion', () => {
    const t = trendTitle('hrv', records);
    assert.match(t, /^Ta VFC /);
    assert.notEqual(t, 'Ta VFC');
    assert.equal(bedtimeText({ needMin: 480, wakeMinutes: 420, latencyMin: 10 }), 'Pour te réveiller à 7 h 00 avec 100 % de ton besoin couvert, couche-toi à 22 h 50.');
    assert.match(debtPlan(95), /4 soirs/);
  });
});

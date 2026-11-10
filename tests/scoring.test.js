// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo } from '../site/js/data/demo.js';
import { buildDays, groupByType, strainFromTrimp, zoneFloors, trimpOf, dedupeWorkouts } from '../site/js/scoring/daily.js';
import { buildNights } from '../site/js/scoring/nights.js';
import { computeScores, bedtimeFor, targetStrain, targetPoint, zoneOfRecovery, tonightNeed } from '../site/js/scoring/scores.js';
import { median, sd, slope, trend, runLength } from '../site/js/scoring/stats.js';

/** @typedef {import('../site/js/data/schema.js').Sample} Sample */

const MIN = 60000;
const END = new Date(2026, 10, 10, 9, 30);
const demo = generateDemo({ end: END });
const truth = new Map(demo.truth.map((t) => [t.date, t]));

/** @param {Sample[]} samples */
function score(samples) {
  const { days } = buildDays({ byType: groupByType(samples), workouts: demo.workouts, hrMax: 190, hrRest: null });
  return computeScores(days);
}
const records = score(demo.samples);
/** @param {number[]} xs */
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('statistiques', () => {
  test('médiane, écart-type, pente, tendance, séries', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.ok(Math.abs(/** @type {number} */ (sd([2, 4, 4, 4, 5, 5, 7, 9])) - 2.138) < 0.01);
    assert.ok(/** @type {number} */ (slope([1, 2, null, 4])) > 0.9);
    assert.equal(trend(105, 100), 'up');
    assert.equal(trend(100, 100), 'flat');
    assert.equal(runLength([1, 0, 1, 1], (x) => x === 1), 2);
  });
});

describe('effort et zones', () => {
  test('zones de Karvonen', () => {
    const f = zoneFloors(50, 190);
    assert.deepEqual(f.map(Math.round), [120, 134, 148, 162, 176]);
  });

  test('1 h en zone 3 donne un effort d\'environ 13 (calibrage de k)', () => {
    const s = strainFromTrimp(60 * 3);
    assert.ok(s >= 12.5 && s <= 14, `effort ${s}`);
    assert.equal(strainFromTrimp(0), 0);
    assert.ok(strainFromTrimp(5000) <= 21);
  });

  test('TRIMP pondéré par le temps, mesures isolées plafonnées à 5 min', () => {
    const t0 = new Date(2026, 10, 9, 18).getTime();
    const floors = zoneFloors(50, 190);
    const hr = [0, 1, 2, 3].map((m) => ({ type: /** @type {const} */ ('hr'), value: 150, unit: 'bpm', start: t0 + m * MIN, end: t0 + m * MIN, source: 'w' }));
    hr.push({ type: 'hr', value: 150, unit: 'bpm', start: t0 + 60 * MIN, end: t0 + 60 * MIN, source: 'w' });
    const r = trimpOf(hr, floors, t0, t0 + 120 * MIN);
    // 4 premières mesures : 1+1+1+5 (plafond) min, la dernière : 1 min → 9 min en Z3
    assert.deepEqual(r.zoneMin, [0, 0, 9, 0, 0]);
    assert.equal(r.trimp, 27);
  });

  test('séances en double fusionnées (Strava + montre)', () => {
    const t0 = new Date(2026, 10, 9, 18).getTime();
    const base = { type: /** @type {const} */ ('running'), durationMin: 40, calories: 400, distanceKm: 8, maxHr: 170, source: 'Montre' };
    const kept = dedupeWorkouts([
      { ...base, start: t0, end: t0 + 40 * MIN, avgHr: 150 },
      { ...base, start: t0 + MIN, end: t0 + 41 * MIN, avgHr: null, source: 'Strava' },
      { ...base, start: t0 + 300 * MIN, end: t0 + 330 * MIN, avgHr: 140 },
    ]);
    assert.equal(kept.length, 2);
    assert.equal(kept[0].source, 'Montre');
  });
});

describe('nuits', () => {
  const t0 = new Date(2026, 10, 9, 23).getTime();
  /** @param {string} value @param {number} a @param {number} b @param {string} [source] */
  const st = (value, a, b, source = 'Watch') => /** @type {Sample} */ ({ type: 'sleep', value, unit: '', start: t0 + a * MIN, end: t0 + b * MIN, source });

  test('choisit la source avec les phases détaillées et ignore les siestes', () => {
    const nights = buildNights([
      st('in_bed', -10, 480, 'iPhone'),
      st('asleep', 0, 470, 'AppTierce'),
      st('core', 5, 200), st('deep', 200, 260), st('rem', 260, 300), st('awake', 300, 310), st('core', 310, 470),
      st('core', 900, 960), // sieste de 1 h le lendemain
    ]);
    assert.equal(nights.size, 1);
    const n = /** @type {import('../site/js/scoring/nights.js').Night} */ (nights.get('2026-11-10'));
    assert.equal(n.source, 'Watch');
    assert.equal(n.asleepMin, 455);
    assert.equal(n.awakeMin, 10);
    assert.equal(n.inBedMin, 490, 'la fenêtre « au lit » de l\'iPhone élargit la nuit');
    assert.ok(n.hasStages);
  });

  test('repli sur la fenêtre « au lit » quand aucune phase n\'existe', () => {
    const nights = buildNights([st('in_bed', 0, 450, 'iPhone')]);
    const n = nights.get('2026-11-10');
    assert.ok(n?.inBedOnly);
    assert.equal(n?.asleepMin, 450);
  });
});

describe('scores sur 90 jours de démo', () => {
  test('les 3 premières nuits sont en calibration, sans score', () => {
    assert.equal(records[0].recovery, null);
    assert.equal(records[0].calibration, 'none');
    const firstScored = records.findIndex((r) => r.recovery !== null);
    assert.ok(firstScored >= 4 && firstScored <= 6, `premier score au jour ${firstScored}`);
    assert.equal(records[firstScored].calibration, 'calibrating');
    assert.equal(records.at(-1)?.calibration, 'full');
  });

  test('tous les scores restent dans leurs bornes', () => {
    for (const r of records) {
      if (r.recovery !== null) assert.ok(r.recovery >= 1 && r.recovery <= 99);
      if (r.sleepScore !== null) assert.ok(r.sleepScore >= 0 && r.sleepScore <= 100);
      assert.ok(r.strain >= 0 && r.strain <= 21);
      assert.ok(r.needMin >= 390 && r.needMin <= 720, `besoin ${r.needMin}`);
      assert.equal(r.zone, zoneOfRecovery(r.recovery));
    }
  });

  test('récupération moyenne autour de 50 % (comparaison à soi-même)', () => {
    const rec = records.filter((r) => r.recovery !== null && r.calibration === 'full').map((r) => /** @type {number} */ (r.recovery));
    const m = avg(rec);
    assert.ok(m > 38 && m < 65, `moyenne ${m.toFixed(1)}`);
    assert.ok(rec.some((v) => v >= 67) && rec.some((v) => v <= 33), 'des jours verts et des jours rouges');
  });

  test('la période malade passe au rouge et déclenche une alerte', () => {
    const sick = records.filter((r) => truth.get(r.date)?.sick);
    assert.equal(sick.length, 4);
    assert.ok(sick.filter((r) => r.zone === 'red').length >= 3, sick.map((r) => r.recovery).join(', '));
    assert.ok(sick.some((r) => r.alert?.kind === 'strain'));
    assert.ok(sick.every((r) => !/maladie|infection|diagnostic|fièvre/i.test(r.alert?.text ?? '')), 'pas de vocabulaire médical');
  });

  test('les nuits après alcool récupèrent nettement moins bien', () => {
    const full = records.filter((r) => r.recovery !== null && !truth.get(r.date)?.sick && !truth.get(r.date)?.prodrome);
    const alc = full.filter((r) => (truth.get(r.date)?.alcoholPrevEvening ?? 0) > 0).map((r) => /** @type {number} */ (r.recovery));
    const sober = full.filter((r) => (truth.get(r.date)?.alcoholPrevEvening ?? 0) === 0).map((r) => /** @type {number} */ (r.recovery));
    assert.ok(avg(sober) - avg(alc) > 15, `sans ${avg(sober).toFixed(0)} / avec ${avg(alc).toFixed(0)}`);
  });

  test('nuit sans montre : pas de récupération ni de score sommeil', () => {
    const missing = records.filter((r) => truth.get(r.date)?.missingNight);
    assert.equal(missing.length, 2);
    for (const r of missing) {
      assert.equal(r.recovery, null);
      assert.equal(r.sleepScore, null);
      assert.ok(r.missing.includes('nuit'));
    }
  });

  test('les séances de vélo et de course pèsent plus que la musculation', () => {
    const w = records.flatMap((r) => r.workouts);
    const by = (/** @type {string} */ t) => avg(w.filter((x) => x.type === t).map((x) => x.strain));
    assert.ok(by('cycling') > by('running') && by('running') > by('strength'), `vélo ${by('cycling')} course ${by('running')} muscu ${by('strength')}`);
    assert.ok(by('cycling') > 12 && by('cycling') < 19);
  });

  test('effort cible conforme au tableau 5.4', () => {
    assert.deepEqual(targetStrain(80), [14, 18]);
    assert.deepEqual(targetStrain(50), [10, 14]);
    assert.deepEqual(targetStrain(20), [0, 10]);
    assert.equal(targetStrain(null), null);
    assert.equal(targetPoint(100), 18);
    assert.equal(targetPoint(67), 14);
  });

  test('la charge aiguë/chronique apparaît après 3 semaines et s\'emballe au retour de la maladie', () => {
    assert.equal(records[10].acwr, null);
    assert.ok(records.at(-1)?.acwr !== null);
    assert.ok(records.some((r) => r.alert?.kind === 'load'));
  });

  test('VFC manquante : poids redistribués et précision réduite', () => {
    const lastNight = /** @type {import('../site/js/scoring/nights.js').Night} */ (records.at(-1)?.night);
    const withoutHrv = demo.samples.filter((s) => !(s.type === 'hrv' && s.start >= lastNight.start && s.start <= lastNight.end));
    const r = /** @type {import('../site/js/scoring/scores.js').DayRecord} */ (score(withoutHrv).at(-1));
    assert.equal(r.hrv, null);
    assert.ok(r.recovery !== null);
    assert.ok(r.reducedPrecision);
    assert.ok(r.missing.includes('VFC'));
    assert.ok(!('hrv' in r.recoveryDetail.weights));
    const total = Object.values(r.recoveryDetail.weights).reduce((a, b) => a + Math.abs(b), 0);
    assert.ok(Math.abs(total - 1) < 0.01);
  });

  test('température au-dessus de la base : malus de 10 points', () => {
    const lastNight = /** @type {import('../site/js/scoring/nights.js').Night} */ (records.at(-1)?.night);
    const hot = demo.samples.map((s) => (s.type === 'wrist_temp' && s.start >= lastNight.start - MIN && s.start <= lastNight.end ? { ...s, value: s.value + 0.9 } : s));
    const normal = /** @type {import('../site/js/scoring/scores.js').DayRecord} */ (records.at(-1));
    const r = /** @type {import('../site/js/scoring/scores.js').DayRecord} */ (score(hot).at(-1));
    assert.equal(r.recoveryDetail.tempPenalty, 10);
    assert.equal(r.recovery, Math.max(1, /** @type {number} */ (normal.recovery) - 10));
  });
});

describe('besoin et coucher', () => {
  test('heure de coucher conseillée', () => {
    assert.equal(bedtimeFor({ needMin: 480, latencyMin: 15, wakeMinutes: 7 * 60 }), 22 * 60 + 45);
    assert.equal(bedtimeFor({ needMin: 500, latencyMin: 10, wakeMinutes: 6 * 60 }), 21 * 60 + 30);
  });

  test('le besoin de ce soir inclut la dette et l\'effort du jour', () => {
    const t = tonightNeed(records);
    assert.ok(t.needMin >= t.baseNeedMin);
    assert.ok(t.baseNeedMin >= 390 && t.baseNeedMin <= 570);
  });
});

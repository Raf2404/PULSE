// @ts-check
import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../site/js/data/db.js';
import { generateDemo } from '../site/js/data/demo.js';

const T = new Date(2026, 10, 9, 23, 0).getTime();
const MIN = 60000;

beforeEach(async () => {
  await db.deleteEverything();
});

test('enregistre et relit des mesures par type et par période', async () => {
  await db.putSamples([
    { type: 'hr', value: 60, unit: 'bpm', start: T, end: T, source: 'w' },
    { type: 'hr', value: 62, unit: 'bpm', start: T + 5 * MIN, end: T + 5 * MIN, source: 'w' },
    { type: 'hrv', value: 50, unit: 'ms', start: T + MIN, end: T + 2 * MIN, source: 'w' },
  ]);
  const hr = await db.getSamples('hr', T, T + 60 * MIN);
  assert.deepEqual(hr.map((s) => s.value), [60, 62]);
  assert.ok(!('id' in hr[0]), 'la clé technique ne sort pas du stockage');
  assert.equal((await db.getSamples('hr', T + MIN, T + 60 * MIN)).length, 1);
});

test('un même import deux fois ne crée pas de doublons', async () => {
  const batch = [{ type: /** @type {const} */ ('steps'), value: 100, unit: 'count', start: T, end: T + 60 * MIN, source: 'w' }];
  await db.putSamples(batch);
  await db.putSamples(batch);
  assert.equal((await db.counts()).samples, 1);
});

test('séances, journal, réglages et effacement', async () => {
  await db.putWorkouts([{ type: 'running', start: T, end: T + 30 * MIN, durationMin: 30, calories: 300, distanceKm: 5, avgHr: 150, maxHr: 170, source: 'w' }]);
  await db.putJournal([{ date: '2026-11-09', lateCaffeine: false, alcohol: 0, screens: true, lateMeal: false, stress: 2, notes: '' }]);
  await db.setMeta('mode', 'demo');
  assert.equal((await db.getWorkouts(T - MIN, T + MIN)).length, 1);
  assert.equal((await db.getJournal())[0].screens, true);
  assert.equal(await db.getMeta('mode'), 'demo');

  await db.clearHealthData();
  const c = await db.counts();
  assert.equal(c.workouts + c.journal + c.samples, 0);
  assert.equal(await db.getMeta('mode'), 'demo', 'les réglages sont conservés');

  await db.deleteEverything();
  assert.equal(await db.getMeta('mode'), undefined);
});

test('stocke les 90 jours de démo et retrouve la période couverte', async () => {
  const demo = generateDemo({ end: new Date(2026, 10, 10, 9, 30) });
  await db.putSamples(demo.samples);
  await db.putWorkouts(demo.workouts);
  const c = await db.counts();
  assert.equal(c.samples, demo.samples.length, 'aucune collision de clés dans la démo');
  assert.equal(c.workouts, demo.workouts.length);
  const range = await db.getSampleRange();
  assert.ok(range);
  assert.equal(range.first, demo.samples[0].start);
  assert.equal(range.last, demo.samples.at(-1)?.start);
});

// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLastNight, formatDuration } from '../site/js/data/summary.js';
import { generateDemo } from '../site/js/data/demo.js';

const MIN = 60000;
const T = new Date(2026, 10, 9, 23, 0).getTime();
/** @param {import('../site/js/data/schema.js').SleepStage} value @param {number} from @param {number} to */
const st = (value, from, to) => ({ type: /** @type {const} */ ('sleep'), value, unit: /** @type {const} */ (''), start: T + from * MIN, end: T + to * MIN, source: 'w' });

test('reconstitue la dernière nuit sans échantillon « au lit »', () => {
  const sleep = [
    st('core', -1440, -1000), // nuit précédente, ignorée
    st('core', 10, 100), st('deep', 100, 130), st('awake', 130, 140), st('rem', 140, 170), st('core', 170, 480),
  ];
  const hrv = [
    { type: /** @type {const} */ ('hrv'), value: 50, unit: 'ms', start: T + 60 * MIN, end: T + 61 * MIN, source: 'w' },
    { type: /** @type {const} */ ('hrv'), value: 60, unit: 'ms', start: T + 300 * MIN, end: T + 301 * MIN, source: 'w' },
    { type: /** @type {const} */ ('hrv'), value: 20, unit: 'ms', start: T + 900 * MIN, end: T + 901 * MIN, source: 'w' }, // journée
  ];
  const rhr = [{ type: /** @type {const} */ ('rhr'), value: 52, unit: 'bpm', start: T + 780 * MIN, end: T + 780 * MIN, source: 'w' }];
  const n = summarizeLastNight({ sleep, hrv, rhr });
  assert.ok(n);
  assert.equal(n.asleepMin, 460);
  assert.equal(n.inBedMin, 470);
  assert.equal(n.hrvAvg, 55);
  assert.equal(n.rhr, 52);
});

test('utilise la fenêtre « au lit » quand elle existe', () => {
  const n = summarizeLastNight({ sleep: [st('in_bed', 0, 500), st('core', 15, 480)], hrv: [], rhr: [] });
  assert.ok(n);
  assert.equal(n.inBedMin, 500);
  assert.equal(n.asleepMin, 465);
  assert.equal(n.hrvAvg, null);
  assert.equal(n.rhr, null);
});

test('ignore la nuit en cours et affiche la précédente', () => {
  const sleep = [
    st('core', -1400, -1000), st('deep', -1000, -980), // nuit précédente terminée
    st('core', 10, 150), // nuit en cours : dernière phase terminée à l'instant
  ];
  const now = T + 155 * MIN;
  const n = summarizeLastNight({ sleep, hrv: [], rhr: [], now });
  assert.ok(n);
  assert.equal(n.asleepMin, 420);
  assert.equal(summarizeLastNight({ sleep: [st('core', 10, 150)], hrv: [], rhr: [], now }), null);
  // Sans « now », comportement inchangé : la dernière nuit connue.
  assert.equal(summarizeLastNight({ sleep, hrv: [], rhr: [] })?.asleepMin, 140);
});

test('demo générée à 1 h 35 : la nuit en cours est ignorée', () => {
  const end = new Date(2026, 10, 10, 1, 35);
  const demo = generateDemo({ end });
  const n = summarizeLastNight({
    sleep: demo.samples.filter((s) => s.type === 'sleep'),
    hrv: demo.samples.filter((s) => s.type === 'hrv'),
    rhr: demo.samples.filter((s) => s.type === 'rhr'),
    now: end.getTime(),
  });
  assert.ok(n);
  assert.ok(n.asleepMin > 300, `${n.asleepMin} min`);
  assert.equal(new Date(n.end).getDate(), 9, 'nuit qui se termine le matin du 9');
});

test('renvoie null sans données de sommeil', () => {
  assert.equal(summarizeLastNight({ sleep: [], hrv: [], rhr: [] }), null);
});

test('retrouve la dernière nuit des données démo', () => {
  const demo = generateDemo({ end: new Date(2026, 10, 10, 9, 30) });
  const last = demo.truth.at(-1);
  assert.ok(last);
  const n = summarizeLastNight({
    sleep: demo.samples.filter((s) => s.type === 'sleep'),
    hrv: demo.samples.filter((s) => s.type === 'hrv'),
    rhr: demo.samples.filter((s) => s.type === 'rhr'),
  });
  assert.ok(n);
  assert.equal(Math.round(n.asleepMin), Math.round(last.sleepMin));
  assert.equal(n.rhr, Math.round(last.rhr));
  assert.ok(n.hrvAvg !== null && Math.abs(n.hrvAvg - last.hrvNight) / last.hrvNight < 0.2);
});

test('formate les durées', () => {
  assert.equal(formatDuration(452), '7 h 32');
  assert.equal(formatDuration(65), '1 h 05');
  assert.equal(formatDuration(40), '40 min');
});

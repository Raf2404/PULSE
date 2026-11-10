// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSample, validateWorkout, validateJournalEntry, sampleKey, partition, localDateKey,
} from '../site/js/data/schema.js';

const T = Date.UTC(2026, 10, 9, 23, 0);

test('accepte une mesure valide', () => {
  assert.ok(validateSample({ type: 'hrv', value: 52.3, unit: 'ms', start: T, end: T + 60000, source: 'Apple Watch' }).ok);
  assert.ok(validateSample({ type: 'sleep', value: 'deep', unit: '', start: T, end: T + 600000, source: 'Apple Watch' }).ok);
});

test('rejette type, unité, plage et dates incohérentes', () => {
  const bad = [
    { type: 'glucose', value: 5, unit: 'mmol/L', start: T, end: T, source: 'x' },
    { type: 'hr', value: 60, unit: 'count/min', start: T, end: T, source: 'x' },
    { type: 'hr', value: 400, unit: 'bpm', start: T, end: T, source: 'x' },
    { type: 'hr', value: Number.NaN, unit: 'bpm', start: T, end: T, source: 'x' },
    { type: 'hr', value: 60, unit: 'bpm', start: T, end: T - 1, source: 'x' },
    { type: 'hr', value: 60, unit: 'bpm', start: '2026-11-09', end: T, source: 'x' },
    { type: 'hr', value: 60, unit: 'bpm', start: T, end: T, source: '' },
    { type: 'sleep', value: 'light', unit: '', start: T, end: T, source: 'x' },
    null,
  ];
  for (const s of bad) assert.equal(validateSample(s).ok, false, JSON.stringify(s));
});

test('valide les séances', () => {
  const w = { type: 'running', start: T, end: T + 1800000, durationMin: 30, calories: 300, distanceKm: 5, avgHr: 150, maxHr: 170, source: 'x' };
  assert.ok(validateWorkout(w).ok);
  assert.equal(validateWorkout({ ...w, avgHr: 180 }).ok, false);
  assert.equal(validateWorkout({ ...w, type: 'parapente' }).ok, false);
  assert.equal(validateWorkout({ ...w, durationMin: 0 }).ok, false);
  assert.ok(validateWorkout({ ...w, distanceKm: null, calories: null }).ok);
});

test('valide le journal du soir', () => {
  const j = { date: '2026-11-09', lateCaffeine: false, alcohol: 2, screens: true, lateMeal: false, stress: 3, notes: '' };
  assert.ok(validateJournalEntry(j).ok);
  assert.equal(validateJournalEntry({ ...j, stress: 0 }).ok, false);
  assert.equal(validateJournalEntry({ ...j, date: '09/11/2026' }).ok, false);
  assert.equal(validateJournalEntry({ ...j, alcohol: 1.5 }).ok, false);
});

test('la clé de dédoublonnage est stable et distingue les phases de sommeil', () => {
  const a = { type: /** @type {const} */ ('hr'), value: 60, unit: 'bpm', start: T, end: T, source: 'w' };
  assert.equal(sampleKey(a), sampleKey({ ...a, value: 61 }));
  assert.notEqual(sampleKey(a), sampleKey({ ...a, source: 'autre' }));
  const deep = { type: /** @type {const} */ ('sleep'), value: /** @type {const} */ ('deep'), unit: /** @type {const} */ (''), start: T, end: T, source: 'w' };
  assert.notEqual(sampleKey(deep), sampleKey({ ...deep, value: 'in_bed' }));
});

test('partition sépare les éléments valides et rejetés', () => {
  const { valid, rejected } = partition([
    { type: 'steps', value: 120, unit: 'count', start: T, end: T, source: 'x' },
    { type: 'steps', value: -3, unit: 'count', start: T, end: T, source: 'x' },
  ], validateSample);
  assert.equal(valid.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].errors[0], /hors plage/);
});

test('localDateKey utilise l\'heure locale', () => {
  // 23 h 30 à Paris le 9 nov. = 22 h 30 UTC : le jour local reste le 9.
  assert.equal(localDateKey(new Date(2026, 10, 9, 23, 30)), '2026-11-09');
});

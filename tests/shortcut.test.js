// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShortcutPayload, payloadFromHash, parseAnyDate } from '../site/js/import/shortcut.js';

test('lignes en français (Raccourcis iOS en FR)', () => {
  const text = [
    'Fréquence cardiaque;56;bpm;2026-11-10T03:12:00+01:00;2026-11-10T03:12:00+01:00;Apple Watch de Rafaël',
    'Variabilité de la fréquence cardiaque;48,5;ms;2026-11-10T02:00:00+01:00;2026-11-10T02:01:00+01:00;Apple Watch',
    'Analyse du sommeil;Profond;;2026-11-10T01:00:00+01:00;2026-11-10T01:40:00+01:00;Apple Watch',
    'Analyse du sommeil;Essentiel;;2026-11-09T23:30:00+01:00;2026-11-10T01:00:00+01:00;Apple Watch',
    'Saturation en oxygène;0,97;%;2026-11-10T03:00:00+01:00;2026-11-10T03:00:00+01:00;Apple Watch',
    'Nombre de pas;1 200;pas;2026-11-10 08:00:00 +0100;2026-11-10 09:00:00 +0100;iPhone',
    'Glycémie;5;mmol/L;2026-11-10T08:00:00+01:00;;',
    'ligne cassée',
  ].join('\n');
  const { samples, rejected } = parseShortcutPayload(text);
  assert.equal(rejected, 2);
  assert.deepEqual(samples.map((s) => [s.type, s.value]), [['hr', 56], ['hrv', 48.5], ['sleep', 'deep'], ['sleep', 'core'], ['spo2', 97], ['steps', 1200]]);
  assert.equal(samples[0].source, 'Apple Watch de Rafaël');
  assert.equal(samples[0].start, Date.UTC(2026, 10, 10, 2, 12));
});

test('JSON (noms HealthKit ou format commun) et base64', () => {
  const json = JSON.stringify([
    { type: 'HKQuantityTypeIdentifierRestingHeartRate', value: 52, unit: 'count/min', startDate: '2026-11-10 07:00:00 +0100', endDate: '2026-11-10 07:00:00 +0100', sourceName: 'Watch' },
    { type: 'sleep', value: 'REM', unit: '', start: Date.UTC(2026, 10, 10, 1), end: Date.UTC(2026, 10, 10, 1, 30), source: 'Watch' },
  ]);
  const a = parseShortcutPayload(json);
  assert.deepEqual(a.samples.map((s) => [s.type, s.value]), [['rhr', 52], ['sleep', 'rem']]);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  assert.equal(parseShortcutPayload(b64).samples.length, 2);
});

test('fragment d\'URL', () => {
  assert.equal(payloadFromHash('#/aujourdhui'), null);
  assert.equal(payloadFromHash(`#import=${encodeURIComponent('a;b\nc')}`), 'a;b\nc');
  assert.ok(Number.isFinite(parseAnyDate('2026-11-10T03:12:00Z')));
});

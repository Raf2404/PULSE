// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSubscription, validTimeZone, cleanReminders, dueReminders, localParts, keyFor } from '../netlify/functions/lib/reminders.mjs';

const sub = { endpoint: 'https://web.push.apple.com/QGuQ', keys: { p256dh: 'BN…', auth: 'x' } };

test('abonnements et fuseaux validés', () => {
  assert.ok(validSubscription(sub));
  assert.equal(validSubscription({ ...sub, endpoint: 'https://evil.example.com/x' }), false);
  assert.equal(validSubscription({ ...sub, endpoint: 'http://web.push.apple.com/x' }), false);
  assert.equal(validSubscription({ endpoint: sub.endpoint }), false);
  assert.ok(validTimeZone('Europe/Paris'));
  assert.equal(validTimeZone('Mars/Olympus'), false);
});

test('rappels nettoyés', () => {
  const r = cleanReminders([{ kind: 'brief', time: '07:30' }, { kind: 'hack', time: '07:30' }, { kind: 'bedtime', time: '22h' }, { kind: 'challenge', time: '08:30', weekday: 1 }]);
  assert.deepEqual(r, [{ kind: 'brief', time: '07:30' }, { kind: 'challenge', time: '08:30', weekday: 1 }]);
});

test('échéances en heure locale, une fois par jour', () => {
  const reminders = [{ kind: 'brief', time: '07:30' }, { kind: 'bedtime', time: '22:20' }, { kind: 'challenge', time: '08:30', weekday: 1 }];
  // Mardi 10 nov. 2026, 07:35 à Paris = 06:35 UTC
  const now = new Date(Date.UTC(2026, 10, 10, 6, 35));
  assert.deepEqual(localParts(now, 'Europe/Paris'), { date: '2026-11-10', minutes: 455, weekday: 2 });
  assert.deepEqual(dueReminders(reminders, now, 'Europe/Paris', {}).map((r) => r.kind), ['brief']);
  assert.deepEqual(dueReminders(reminders, now, 'Europe/Paris', { brief: '2026-11-10' }), []);
  assert.deepEqual(dueReminders(reminders, new Date(Date.UTC(2026, 10, 10, 6, 50)), 'Europe/Paris', {}), [], 'hors fenêtre de 15 min');
  // Le défi ne part que le lundi
  assert.deepEqual(dueReminders(reminders, new Date(Date.UTC(2026, 10, 9, 7, 31)), 'Europe/Paris', {}).map((r) => r.kind), ['challenge']);
  assert.deepEqual(dueReminders(reminders, new Date(Date.UTC(2026, 10, 10, 7, 31)), 'Europe/Paris', {}), []);
});

test('clé de stockage stable et opaque', async () => {
  const a = await keyFor(sub.endpoint);
  assert.equal(a, await keyFor(sub.endpoint));
  assert.match(a, /^sub-[0-9a-f]{32}$/);
});

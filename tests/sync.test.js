// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMailbox, purgeExpired, memoryStore, validSecret, TTL_MS, MAX_ITEMS } from '../netlify/functions/lib/mailbox.mjs';

const SECRET = 'A'.repeat(42) + 'b';
const url = `https://pulse.example/api/sync/${SECRET}`;
/** @param {string} method @param {string} [body] */
const req = (method, body) => new Request(url, { method, body, headers: body ? { 'content-type': 'text/plain' } : {} });

test('cycle complet : activer, déposer, relever, supprimer', async () => {
  const store = memoryStore();
  assert.equal((await handleMailbox(req('POST', 'x'), SECRET, store)).status, 404, 'boîte non activée');
  assert.equal((await handleMailbox(req('PUT'), SECRET, store)).status, 200);
  const r1 = await (await handleMailbox(req('POST', 'Fréquence cardiaque;55;bpm;…'), SECRET, store, 1000)).json();
  const r2 = await (await handleMailbox(req('POST', 'Pas;120;pas;…'), SECRET, store, 2000)).json();
  assert.ok(r1.id && r2.id);
  const got = await (await handleMailbox(req('GET'), SECRET, store, 3000)).json();
  assert.deepEqual(got.items.map((/** @type {{ text: string }} */ i) => i.text), ['Fréquence cardiaque;55;bpm;…', 'Pas;120;pas;…']);
  await handleMailbox(new Request(url, { method: 'DELETE', body: JSON.stringify({ ids: [r1.id] }) }), SECRET, store);
  const after = await (await handleMailbox(req('GET'), SECRET, store, 3000)).json();
  assert.equal(after.items.length, 1);
  await handleMailbox(req('DELETE'), SECRET, store);
  assert.equal((await handleMailbox(req('GET'), SECRET, store)).status, 404, 'boîte supprimée');
});

test('le code secret n\'est jamais stocké en clair', async () => {
  const store = memoryStore();
  await handleMailbox(req('PUT'), SECRET, store);
  await handleMailbox(req('POST', 'données'), SECRET, store);
  const keys = (await store.list({ prefix: '' })).blobs.map((b) => b.key).join(' ');
  assert.ok(!keys.includes(SECRET));
});

test('expiration après 48 h, limites et codes invalides', async () => {
  const store = memoryStore();
  await handleMailbox(req('PUT'), SECRET, store);
  await handleMailbox(req('POST', 'vieux'), SECRET, store, 0);
  await handleMailbox(req('POST', 'récent'), SECRET, store, TTL_MS);
  assert.equal(await purgeExpired(store, TTL_MS + 10), 1);
  const got = await (await handleMailbox(req('GET'), SECRET, store, TTL_MS + 10)).json();
  assert.deepEqual(got.items.map((/** @type {{ text: string }} */ i) => i.text), ['récent']);
  for (let k = 0; k < MAX_ITEMS; k++) await handleMailbox(req('POST', `n${k}`), SECRET, store, TTL_MS + 20 + k);
  assert.equal((await handleMailbox(req('POST', 'de trop'), SECRET, store, TTL_MS + 100)).status, 429);
  assert.equal((await handleMailbox(req('POST', '   '), SECRET, memoryStore())).status, 404);
  assert.equal(validSecret('trop-court'), false);
  assert.equal((await handleMailbox(req('GET'), 'trop-court', store)).status, 404);
});

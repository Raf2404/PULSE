// @ts-check
/**
 * Synchro automatique (option « boîte aux lettres ») : chaque matin, un raccourci iOS dépose
 * les mesures récentes de Santé sur /api/sync/<code secret> (ton site Netlify). PULSE les relève
 * à l'ouverture, les importe, puis les fait supprimer du serveur (sinon : effacées après 48 h).
 */
import * as db from '../data/db.js';
import { recompute } from '../data/pipeline.js';
import { parseShortcutPayload } from './shortcut.js';

const BASE = '/api/sync/';

/** Code secret de 256 bits en base64url (43 caractères). */
export function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Adresse à coller dans le raccourci. @param {string} secret */
export const syncUrl = (secret) => `${location.origin}${BASE}${secret}`;

/** @returns {Promise<string | null>} */
export async function getSecret() {
  const s = await db.getMeta('syncSecret');
  return typeof s === 'string' ? s : null;
}

/** Active la synchro : crée la boîte côté serveur et garde le code sur l'appareil. */
export async function enableAutoSync() {
  const secret = (await getSecret()) ?? newSecret();
  const res = await fetch(`${BASE}${secret}`, { method: 'PUT' }).catch(() => null);
  if (!res || !res.ok) throw new Error(res ? ((await res.json().catch(() => ({}))).error ?? `erreur ${res.status}`) : 'Service de synchro injoignable (il fonctionne une fois le site déployé sur Netlify).');
  await db.setMeta('syncSecret', secret);
  return secret;
}

/** Désactive la synchro et supprime la boîte (et ce qu'elle contient) du serveur. */
export async function disableAutoSync() {
  const secret = await getSecret();
  if (secret) await fetch(`${BASE}${secret}`, { method: 'DELETE' }).catch(() => null);
  await db.setMeta('syncSecret', null);
}

/**
 * Relève les dépôts en attente, les importe et les supprime du serveur.
 * @returns {Promise<{ samples: number, deposits: number, rejected: number } | null>} null si rien à faire
 */
export async function pullAutoSync() {
  const secret = await getSecret();
  if (!secret) return null;
  const res = await fetch(`${BASE}${secret}`, { cache: 'no-store' }).catch(() => null);
  if (!res || !res.ok) return null;
  /** @type {{ items: { id: string, at: number, text: string }[] }} */
  const { items } = await res.json();
  if (!items?.length) return null;
  /** @type {import('../data/schema.js').Sample[]} */
  const samples = [];
  let rejected = 0;
  for (const it of items) {
    const r = parseShortcutPayload(it.text);
    samples.push(...r.samples);
    rejected += r.rejected;
  }
  if (samples.length) {
    if ((await db.getMeta('mode')) === 'demo') await db.clearHealthData();
    await db.putSamples(samples);
    await recompute();
    await db.setMeta('mode', 'apple');
  }
  await db.setMeta('lastSync', { at: Date.now(), samples: samples.length, deposits: items.length, rejected });
  // Les données sont maintenant sur le téléphone : on les retire du serveur.
  await fetch(`${BASE}${secret}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: items.map((i) => i.id) }) }).catch(() => null);
  return { samples: samples.length, deposits: items.length, rejected };
}

/** Vérifie le circuit (dépôt puis relève) sans rien importer, puis nettoie. */
export async function testAutoSync() {
  const secret = await getSecret();
  if (!secret) throw new Error('Active d\'abord la synchro.');
  const marker = `test-${Date.now().toString(36)}`;
  const post = await fetch(`${BASE}${secret}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: marker });
  if (!post.ok) throw new Error((await post.json().catch(() => ({}))).error ?? `erreur ${post.status}`);
  const { id } = await post.json();
  const got = await (await fetch(`${BASE}${secret}`, { cache: 'no-store' })).json();
  await fetch(`${BASE}${secret}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
  if (!got.items?.some((/** @type {{ text: string }} */ i) => i.text === marker)) throw new Error('Le dépôt de test n\'a pas été retrouvé.');
}

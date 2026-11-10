// Boîte aux lettres de synchro automatique (logique pure, testée dans tests/sync.test.js).
// Le raccourci iOS dépose le texte des mesures ; PULSE le relève puis le fait supprimer.
// Seule une empreinte du code secret est stockée ; les dépôts expirent après 48 h.

export const TTL_MS = 48 * 3600 * 1000;
export const MAX_ITEMS = 30;
export const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_BOXES = 10;

/** Code secret : 43 caractères base64url (256 bits). @param {unknown} s */
export const validSecret = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);

/** @param {string} secret */
export async function hashSecret(secret) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pulse-sync:${secret}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stockage minimal (Netlify Blobs ou mémoire pour les tests).
 * @typedef {{ get: (k: string, o: { type: 'json' }) => Promise<any>, setJSON: (k: string, v: unknown) => Promise<unknown>,
 *   list: (o: { prefix: string }) => Promise<{ blobs: { key: string }[] }>, delete: (k: string) => Promise<void> }} Store
 */

/** @param {unknown} body @param {number} [status] */
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * Traite une requête /api/sync/<secret>.
 * PUT : crée la boîte · POST : dépôt (texte brut) · GET : relève · DELETE : supprime des dépôts (ids) ou la boîte.
 * @param {Request} req @param {string} secret @param {Store} store @param {number} [now]
 */
export async function handleMailbox(req, secret, store, now = Date.now()) {
  if (!validSecret(secret)) return json({ error: 'code de synchro invalide' }, 404);
  const h = await hashSecret(secret);
  const boxKey = `box/${h}`;
  const box = await store.get(boxKey, { type: 'json' });

  if (req.method === 'PUT') {
    if (!box) {
      const { blobs } = await store.list({ prefix: 'box/' });
      if (blobs.length >= MAX_BOXES) return json({ error: 'trop de boîtes de synchro' }, 429);
      await store.setJSON(boxKey, { createdAt: now });
    }
    return json({ ok: true });
  }
  if (!box) return json({ error: 'synchro non activée dans PULSE' }, 404);

  const itemsPrefix = `item/${h}/`;
  if (req.method === 'POST') {
    const text = await req.text();
    if (!text.trim()) return json({ error: 'rien à synchroniser' }, 400);
    if (new TextEncoder().encode(text).length > MAX_BYTES) return json({ error: 'envoi trop volumineux' }, 413);
    const { blobs } = await store.list({ prefix: itemsPrefix });
    if (blobs.length >= MAX_ITEMS) return json({ error: 'trop d\'envois en attente : ouvre PULSE' }, 429);
    const id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(`${itemsPrefix}${id}`, { at: now, text });
    return json({ ok: true, id });
  }
  if (req.method === 'GET') {
    const { blobs } = await store.list({ prefix: itemsPrefix });
    const items = [];
    for (const { key } of blobs) {
      const v = await store.get(key, { type: 'json' });
      if (!v) continue;
      if (now - v.at > TTL_MS) { await store.delete(key); continue; }
      items.push({ id: key.slice(itemsPrefix.length), at: v.at, text: v.text });
    }
    items.sort((a, b) => a.at - b.at);
    return json({ items });
  }
  if (req.method === 'DELETE') {
    let ids = null;
    try { ids = (await req.json())?.ids ?? null; } catch { ids = null; }
    const { blobs } = await store.list({ prefix: itemsPrefix });
    for (const { key } of blobs) {
      if (!ids || ids.includes(key.slice(itemsPrefix.length))) await store.delete(key);
    }
    if (!ids) await store.delete(boxKey);
    return json({ ok: true });
  }
  return json({ error: 'méthode non prise en charge' }, 405);
}

/**
 * Supprime les dépôts expirés (tâche planifiée).
 * @param {Store} store @param {number} [now]
 */
export async function purgeExpired(store, now = Date.now()) {
  const { blobs } = await store.list({ prefix: 'item/' });
  let removed = 0;
  for (const { key } of blobs) {
    const v = await store.get(key, { type: 'json' });
    if (!v || now - v.at > TTL_MS) { await store.delete(key); removed++; }
  }
  return removed;
}

/** Stockage en mémoire (tests et serveur local). @returns {Store} */
export function memoryStore() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    delete: async (k) => { m.delete(k); },
  };
}

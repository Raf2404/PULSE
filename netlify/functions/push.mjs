// /api/push — abonnement aux rappels (GET : clé publique ; POST : enregistrer / tester ; DELETE : se désabonner).
import { sendNotification } from 'web-push';
import { store, vapid } from './lib/store.mjs';
import { validSubscription, validTimeZone, cleanReminders, keyFor, MAX_SUBSCRIPTIONS } from './lib/reminders.mjs';

export const config = { path: '/api/push' };

/** @param {unknown} body @param {number} [status] */
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req) => {
  const keys = await vapid();
  if (req.method === 'GET') return json({ publicKey: keys.publicKey });

  let body;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
  if (!validSubscription(body?.subscription)) return json({ error: 'abonnement invalide' }, 400);
  const s = store();
  const key = await keyFor(body.subscription.endpoint);

  if (req.method === 'DELETE') {
    await s.delete(key);
    return json({ ok: true });
  }
  if (req.method !== 'POST') return json({ error: 'méthode non prise en charge' }, 405);

  if (body.test) {
    try {
      await sendNotification(body.subscription, JSON.stringify({ title: 'PULSE', body: 'Les notifications fonctionnent.', url: '/#/profil/notifications' }));
      return json({ ok: true });
    } catch (err) {
      return json({ error: `envoi impossible (${err?.statusCode ?? 'réseau'})` }, 502);
    }
  }

  if (!validTimeZone(body.tz)) return json({ error: 'fuseau horaire invalide' }, 400);
  const existing = await s.get(key, { type: 'json' });
  if (!existing) {
    const { blobs } = await s.list({ prefix: 'sub-' });
    if (blobs.length >= MAX_SUBSCRIPTIONS) return json({ error: 'trop d\'appareils abonnés' }, 429);
  }
  await s.setJSON(key, {
    subscription: body.subscription,
    tz: body.tz,
    reminders: cleanReminders(body.reminders),
    lastSent: existing?.lastSent ?? {},
    updatedAt: Date.now(),
  });
  return json({ ok: true });
};

// Toutes les 15 minutes : envoie les rappels arrivés à échéance (brief, coucher, défi).
import { sendNotification } from 'web-push';
import { store, vapid } from './lib/store.mjs';
import { dueReminders, localParts, messageFor } from './lib/reminders.mjs';

export const config = { schedule: '*/15 * * * *' };

export default async () => {
  await vapid();
  const s = store();
  const { blobs } = await s.list({ prefix: 'sub-' });
  const now = new Date();
  for (const { key } of blobs) {
    const rec = await s.get(key, { type: 'json' });
    if (!rec) continue;
    const due = dueReminders(rec.reminders ?? [], now, rec.tz, rec.lastSent ?? {});
    if (!due.length) continue;
    const today = localParts(now, rec.tz).date;
    for (const r of due) {
      try {
        await sendNotification(rec.subscription, JSON.stringify(messageFor(r)), { TTL: 3600 });
        rec.lastSent = { ...(rec.lastSent ?? {}), [r.kind]: today };
      } catch (err) {
        // Abonnement expiré ou révoqué : on l'oublie.
        if (err?.statusCode === 404 || err?.statusCode === 410) { await s.delete(key); break; }
      }
    }
    if (await s.get(key)) await s.setJSON(key, rec);
  }
  return new Response('ok');
};

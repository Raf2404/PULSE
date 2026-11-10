// Logique pure des rappels (testée dans tests/push.test.js). Aucune donnée de santé ici :
// seulement des heures de rappel et un fuseau horaire.

/** Services de push autorisés (Apple, Google, Mozilla, Microsoft). */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export const KINDS = ['brief', 'bedtime', 'challenge'];
export const MAX_SUBSCRIPTIONS = 10;
export const WINDOW_MIN = 15;

/** @param {unknown} sub */
export function validSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  const s = /** @type {{ endpoint?: unknown, keys?: { p256dh?: unknown, auth?: unknown } }} */ (sub);
  if (typeof s.endpoint !== 'string' || s.endpoint.length > 1000) return false;
  let url;
  try { url = new URL(s.endpoint); } catch { return false; }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(url.hostname))) return false;
  return typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string';
}

/** @param {unknown} tz */
export function validTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('fr-FR', { timeZone: tz }); return true; } catch { return false; }
}

/**
 * Nettoie la liste de rappels reçue du navigateur.
 * @param {unknown} list
 * @returns {{ kind: string, time: string, weekday?: number, text?: string }[]}
 */
export function cleanReminders(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((r) => r && KINDS.includes(r.kind) && /^\d{2}:\d{2}$/.test(r.time))
    .slice(0, 5)
    .map((r) => ({
      kind: r.kind,
      time: r.time,
      ...(Number.isInteger(r.weekday) && r.weekday >= 1 && r.weekday <= 7 ? { weekday: r.weekday } : {}),
      ...(typeof r.text === 'string' ? { text: r.text.slice(0, 120) } : {}),
    }));
}

/**
 * Date, heure et jour de la semaine (1 = lundi) dans un fuseau horaire.
 * @param {Date} now @param {string} tz
 */
export function localParts(now, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday };
}

/**
 * Rappels à envoyer maintenant (dans la fenêtre de 15 min qui suit leur heure, une fois par jour).
 * @param {{ kind: string, time: string, weekday?: number }[]} reminders
 * @param {Date} now @param {string} tz @param {Record<string, string>} lastSent date locale du dernier envoi par type
 */
export function dueReminders(reminders, now, tz, lastSent) {
  const { date, minutes, weekday } = localParts(now, tz);
  return reminders.filter((r) => {
    if (lastSent[r.kind] === date) return false;
    if (r.weekday && r.weekday !== weekday) return false;
    const [h, m] = r.time.split(':').map(Number);
    const at = h * 60 + m;
    return minutes >= at && minutes < at + WINDOW_MIN;
  });
}

/** @param {{ kind: string, text?: string }} r */
export function messageFor(r) {
  if (r.kind === 'brief') return { title: 'Ton brief du matin est prêt', body: 'Ouvre PULSE pour voir ta récupération du jour.', url: '/#/aujourdhui' };
  if (r.kind === 'bedtime') return { title: 'Bientôt l\'heure de dormir', body: r.text || 'Couche-toi dans 30 min pour couvrir ton besoin de sommeil.', url: '/#/sommeil' };
  return { title: 'Nouveau défi de la semaine', body: 'Ton coach t\'a préparé un défi : découvre-le.', url: '/#/profil/progression' };
}

/** Clé de stockage stable pour un abonnement. @param {string} endpoint */
export async function keyFor(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return `sub-${[...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// @ts-check
/**
 * Notifications Web Push (iPhone : PWA installée, iOS 16.4+). Le service de rappels du site
 * (fonction Netlify gratuite) ne reçoit que l'abonnement et les heures de rappel.
 */
import { S, saveMeta, tonight, latencyMin, wakeMinutes } from './state.js';
import { bedtimeFor } from './scoring/scores.js';

const ENDPOINT = '/api/push';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** @param {string} b64 */
function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** @param {number} m */
const hhmm = (m) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/** Rappels à programmer d'après les réglages et le besoin de sommeil de ce soir. */
export function currentReminders() {
  /** @type {{ kind: string, time: string, weekday?: number, text?: string }[]} */
  const list = [{ kind: 'brief', time: S.notif.briefTime }];
  if (S.notif.bedtime && S.records.length) {
    const bed = bedtimeFor({ needMin: tonight().needMin, latencyMin: latencyMin(), wakeMinutes: wakeMinutes() });
    const [h, m] = hhmm(bed).split(':');
    list.push({ kind: 'bedtime', time: hhmm(bed - 30), text: `Couche-toi vers ${Number(h)} h ${m} pour couvrir ton besoin de sommeil.` });
  }
  if (S.notif.challenge) list.push({ kind: 'challenge', time: '08:30', weekday: 1 });
  return list;
}

async function subscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Envoie l'abonnement et les heures de rappel au service.
 * @param {PushSubscription} sub
 */
async function register(sub) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, reminders: currentReminders() }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `service de rappels indisponible (${res.status})`);
}

/** Active les notifications (à appeler depuis un geste de l'utilisateur). */
export async function enablePush() {
  if (!pushSupported()) throw new Error('Notifications indisponibles : installe PULSE sur l\'écran d\'accueil (iOS 16.4+).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications refusées. Autorise-les dans Réglages → Notifications → PULSE.');
  const res = await fetch(ENDPOINT).catch(() => null);
  if (!res || !res.ok) throw new Error('Le service de rappels ne répond pas (il fonctionne une fois le site déployé sur Netlify).');
  const { publicKey } = await res.json();
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
  await register(sub);
  S.notif.enabled = true;
  await saveMeta('notif', S.notif);
}

export async function disablePush() {
  const sub = pushSupported() ? await subscription() : null;
  if (sub) {
    await fetch(ENDPOINT, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  S.notif.enabled = false;
  await saveMeta('notif', S.notif);
}

/** Met à jour les heures de rappel (au démarrage et après un changement de réglage). */
export async function syncReminders() {
  if (!S.notif.enabled || !pushSupported()) return;
  const sub = await subscription();
  if (sub) await register(sub).catch((err) => console.warn('Rappels non synchronisés', err));
}

export async function testPush() {
  const sub = await subscription();
  if (!sub) throw new Error('Pas d\'abonnement actif.');
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), test: true }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'échec');
}

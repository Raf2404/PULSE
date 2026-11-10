// Accès au stockage Netlify Blobs et aux clés VAPID (générées une fois, gardées côté serveur).
import { getStore } from '@netlify/blobs';
import { generateVAPIDKeys, setVapidDetails } from 'web-push';

export const store = () => getStore('pulse-push');

/** Clés VAPID du site : créées au premier appel puis réutilisées. */
export async function vapid() {
  const s = store();
  let keys = await s.get('vapid', { type: 'json' });
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = generateVAPIDKeys();
    await s.setJSON('vapid', keys);
  }
  setVapidDetails('mailto:pulse@example.invalid', keys.publicKey, keys.privateKey);
  return keys;
}

// Toutes les heures : supprime les données de synchro non relevées depuis plus de 48 h.
import { getStore } from '@netlify/blobs';
import { purgeExpired } from './lib/mailbox.mjs';

export const config = { schedule: '@hourly' };

export default async () => {
  const removed = await purgeExpired(getStore('pulse-sync'));
  return new Response(`supprimés : ${removed}`);
};

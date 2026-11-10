// /api/sync/<code secret> — boîte aux lettres de la synchro automatique (raccourci iOS → PULSE).
import { getStore } from '@netlify/blobs';
import { handleMailbox } from './lib/mailbox.mjs';

export const config = { path: '/api/sync/*' };

export default async (req) => {
  const secret = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  return handleMailbox(req, secret, getStore('pulse-sync'));
};

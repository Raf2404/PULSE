// @ts-check
/**
 * Worker d'import : lit export.zip / export.xml en flux et écrit les mesures dans IndexedDB
 * par paquets, sans bloquer l'interface. Le fichier n'est jamais conservé.
 */
import { HealthXmlParser } from './healthxml.js';
import { streamExport, blobChunks } from './stream.js';
import * as db from '../data/db.js';

/** @typedef {import('../data/schema.js').Sample} Sample */
/** @typedef {import('../data/schema.js').Workout} Workout */

const DAY = 86400000;
const FLUSH_AT = 8000;

/** @param {object} msg */
const post = (msg) => /** @type {Worker} */ (/** @type {unknown} */ (self)).postMessage(msg);

self.onmessage = async (/** @type {MessageEvent<{ file: File, days: number, now: number }>} */ event) => {
  const { file, days, now } = event.data;
  /** @type {Sample[]} */
  let samples = [];
  /** @type {Workout[]} */
  let workouts = [];
  let written = 0;
  const parser = new HealthXmlParser({
    cutoff: now - days * DAY,
    onSample: (s) => samples.push(s),
    onWorkout: (w) => workouts.push(w),
  });
  const flush = async () => {
    if (samples.length) {
      const batch = samples;
      samples = [];
      await db.putSamples(batch);
      written += batch.length;
    }
    if (workouts.length) {
      const batch = workouts;
      workouts = [];
      await db.putWorkouts(batch);
    }
  };

  try {
    const zip = /\.zip$/i.test(file.name) || /zip/.test(file.type);
    let lastPost = 0;
    const r = await streamExport(blobChunks(file), {
      zip,
      onText: (t) => parser.push(t),
      afterChunk: async (bytes) => {
        if (samples.length >= FLUSH_AT) await flush();
        const nowMs = Date.now();
        if (nowMs - lastPost > 200) {
          lastPost = nowMs;
          post({ type: 'progress', ratio: bytes / file.size, written: written + samples.length });
        }
      },
    });
    await flush();
    const stats = parser.end();
    if (!r.found) {
      post({ type: 'error', message: 'Ce fichier ne contient pas export.xml. Choisis le fichier export.zip créé par l\'app Santé.' });
      return;
    }
    post({ type: 'done', stats, written });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

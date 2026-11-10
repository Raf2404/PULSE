// @ts-check
/**
 * Import « Raccourcis » (Phase 3) : l'app Raccourcis d'Apple lit les mesures récentes dans Santé
 * et ouvre PULSE avec un texte dans le fragment d'URL (#import=…), jamais envoyé au serveur.
 * Formats acceptés :
 * - lignes « Type;Valeur;Unité;Début;Fin;Source » (noms français ou anglais, dates ISO ou Apple)
 * - JSON : tableau d'objets { type, value, unit, start, end, source } (format commun ou noms Santé)
 */
import { validateSample } from '../data/schema.js';
import { parseAppleDate, QUANTITY_MAP, SLEEP_MAP } from './healthxml.js';

/** @typedef {import('../data/schema.js').Sample} Sample */

/** @param {string} s */
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Noms (FR/EN, normalisés) → type PULSE. */
const TYPE_NAMES = /** @type {Record<string, string>} */ ({
  'frequence cardiaque': 'hr', 'heart rate': 'hr', hr: 'hr',
  'frequence cardiaque au repos': 'rhr', 'resting heart rate': 'rhr', rhr: 'rhr',
  'variabilite de la frequence cardiaque': 'hrv', 'variabilite de la fc': 'hrv', 'heart rate variability': 'hrv', hrv: 'hrv',
  'frequence respiratoire': 'resp', 'respiratory rate': 'resp', resp: 'resp',
  'saturation en oxygene': 'spo2', 'oxygene sanguin': 'spo2', 'oxygen saturation': 'spo2', 'blood oxygen': 'spo2', spo2: 'spo2',
  'nombre de pas': 'steps', pas: 'steps', steps: 'steps', 'step count': 'steps',
  'energie active': 'active_energy', 'active energy': 'active_energy', 'calories actives': 'active_energy',
  'temperature au poignet': 'wrist_temp', 'temperature du poignet pendant le sommeil': 'wrist_temp', 'wrist temperature': 'wrist_temp', 'apple sleeping wrist temperature': 'wrist_temp',
  'analyse du sommeil': 'sleep', sommeil: 'sleep', 'sleep analysis': 'sleep', sleep: 'sleep',
  'minutes d exercice': 'exercise_min', 'exercise minutes': 'exercise_min',
  'vo2 max': 'vo2max', poids: 'weight', 'body mass': 'weight', weight: 'weight',
  eau: 'water', water: 'water', proteines: 'protein', protein: 'protein',
});

const STAGE_NAMES = /** @type {Record<string, import('../data/schema.js').SleepStage>} */ ({
  'au lit': 'in_bed', 'in bed': 'in_bed', inbed: 'in_bed', in_bed: 'in_bed',
  eveille: 'awake', eveil: 'awake', awake: 'awake',
  paradoxal: 'rem', 'sommeil paradoxal': 'rem', rem: 'rem',
  profond: 'deep', 'sommeil profond': 'deep', deep: 'deep',
  essentiel: 'core', leger: 'core', 'sommeil leger': 'core', core: 'core',
  endormi: 'asleep', asleep: 'asleep', 'asleep unspecified': 'asleep', sommeil: 'asleep',
});

const UNITS = /** @type {Record<string, string>} */ ({
  hr: 'bpm', rhr: 'bpm', hrv: 'ms', resp: '/min', spo2: '%', steps: 'count', active_energy: 'kcal',
  wrist_temp: '°C', exercise_min: 'min', vo2max: 'mL/kg/min', weight: 'kg', water: 'mL', protein: 'g',
});

/**
 * @param {string} s
 * @returns {number}
 */
export function parseAnyDate(s) {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/.test(t)) return parseAppleDate(t);
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * @param {string} rawType @param {string | number} rawValue @param {string} unit
 * @param {number} start @param {number} end @param {string} source
 * @returns {Sample | null}
 */
function toSample(rawType, rawValue, unit, start, end, source) {
  const hk = QUANTITY_MAP[rawType];
  const type = hk ? hk.type : rawType === 'HKCategoryTypeIdentifierSleepAnalysis' ? 'sleep' : TYPE_NAMES[norm(rawType)];
  if (!type || !Number.isFinite(start)) return null;
  const e = Number.isFinite(end) ? end : start;
  if (type === 'sleep') {
    const v = String(rawValue);
    const stage = SLEEP_MAP[v] ?? STAGE_NAMES[norm(v)];
    return stage ? { type: 'sleep', value: stage, unit: '', start, end: e, source } : null;
  }
  let value = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).replace(/\s|%/g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const u = unit.trim().toLowerCase();
  if (type === 'spo2' && value <= 1) value *= 100;
  if (type === 'wrist_temp' && (u.includes('f') || value > 50)) value = (value - 32) / 1.8;
  if (type === 'active_energy' && u === 'kj') value /= 4.184;
  if (type === 'weight' && u === 'lb') value *= 0.45359237;
  if (type === 'water' && u === 'l') value *= 1000;
  return /** @type {Sample} */ ({ type, value: Math.round(value * 1000) / 1000, unit: UNITS[type], start, end: e, source });
}

/**
 * Analyse le texte reçu de Raccourcis.
 * @param {string} payload
 * @returns {{ samples: Sample[], rejected: number }}
 */
export function parseShortcutPayload(payload) {
  /** @type {Sample[]} */
  const samples = [];
  let rejected = 0;
  let text = payload.trim();
  // Base64 (certains raccourcis encodent tout le contenu)
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(text)) {
    try {
      const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
      text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch { /* pas du base64 */ }
  }
  /** @param {Sample | null} s */
  const push = (s) => {
    if (s && validateSample(s).ok) samples.push(s);
    else rejected++;
  };
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : Array.isArray(data.samples) ? data.samples : [];
      for (const o of list) {
        if (typeof o !== 'object' || o === null) { rejected++; continue; }
        const start = typeof o.start === 'number' ? o.start : parseAnyDate(String(o.start ?? o.startDate ?? ''));
        const end = typeof o.end === 'number' ? o.end : parseAnyDate(String(o.end ?? o.endDate ?? ''));
        push(toSample(String(o.type ?? ''), o.value, String(o.unit ?? ''), start, end, String(o.source ?? o.sourceName ?? 'Raccourcis')));
      }
      return { samples, rejected };
    } catch {
      return { samples, rejected: rejected + 1 };
    }
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/[;\t]/).map((p) => p.trim());
    if (parts.length < 4) { rejected++; continue; }
    const [type, value, unit, startS, endS, source] = parts;
    push(toSample(type, value, unit ?? '', parseAnyDate(startS), endS ? parseAnyDate(endS) : Number.NaN, source || 'Raccourcis'));
  }
  return { samples, rejected };
}

/**
 * Extrait la charge utile d'un fragment d'URL « #import=… ».
 * @param {string} hash
 */
export function payloadFromHash(hash) {
  const m = /^#import=([\s\S]*)$/.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, '%20'));
  } catch {
    return m[1];
  }
}

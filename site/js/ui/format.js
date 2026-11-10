// @ts-check
/** Mise en forme française : nombres, durées, dates, heures, unités. */

export const nf = new Intl.NumberFormat('fr-FR');
export const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const dLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
const dMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const tFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** @param {string} s */
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Échappe du texte pour l'insérer dans du HTML. @param {unknown} s */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] ?? c));
}

/** @param {string} date AAAA-MM-JJ */
export const dateOf = (date) => new Date(`${date}T12:00:00`);
/** @param {string} date */
export const longDate = (date) => cap(dLong.format(dateOf(date)));
/** @param {string} date */
export const shortDate = (date) => dShort.format(dateOf(date));
/** @param {string} date */
export const dayLabel = (date) => dDay.format(dateOf(date));
/** @param {string} date */
export const monthLabel = (date) => cap(dMonth.format(dateOf(date)));
/** @param {number} t */
export const time = (t) => tFmt.format(t).replace(':', ' h ');

/** Minutes → « 7 h 32 ». @param {number | null | undefined} m */
export function dur(m) {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  const sign = m < 0 ? '−' : '';
  const a = Math.abs(Math.round(m));
  const h = Math.floor(a / 60);
  const mm = a % 60;
  return h ? `${sign}${h} h ${String(mm).padStart(2, '0')}` : `${sign}${mm} min`;
}

/** Minutes depuis minuit → « 22 h 50 ». @param {number} m */
export function clock(m) {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${Math.floor(x / 60)} h ${String(x % 60).padStart(2, '0')}`;
}

/** @param {number | null | undefined} v @param {number} [digits] */
export function num(v, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return digits ? nf1.format(Math.round(v * 10 ** digits) / 10 ** digits) : nf.format(Math.round(v));
}

/**
 * Distance selon les unités choisies.
 * @param {number | null} km @param {'metric' | 'imperial'} units
 */
export function distance(km, units) {
  if (km === null) return '—';
  return units === 'imperial' ? `${nf1.format(km / 1.609344)} mi` : `${nf1.format(km)} km`;
}

/** @param {number | null} kg @param {'metric' | 'imperial'} units */
export function weight(kg, units) {
  if (kg === null) return '—';
  return units === 'imperial' ? `${nf1.format(kg / 0.45359237)} lb` : `${nf1.format(kg)} kg`;
}

/**
 * Allure (min/km ou min/mi).
 * @param {number} durationMin @param {number | null} km @param {'metric' | 'imperial'} units
 */
export function pace(durationMin, km, units) {
  if (!km) return '—';
  const per = units === 'imperial' ? durationMin / (km / 1.609344) : durationMin / km;
  const m = Math.floor(per);
  const s = Math.round((per - m) * 60);
  return `${m}'${String(s === 60 ? 0 : s).padStart(2, '0')}" /${units === 'imperial' ? 'mi' : 'km'}`;
}

export const WORKOUT_LABELS = /** @type {Record<string, string>} */ ({
  strength: 'Musculation', running: 'Course', cycling: 'Vélo', walking: 'Marche', hiking: 'Randonnée',
  swimming: 'Natation', rowing: 'Rameur', hiit: 'HIIT', yoga: 'Yoga', mobility: 'Mobilité',
  team_sport: 'Sport co', racket: 'Raquette', other: 'Autre',
});

export const WORKOUT_ICONS = /** @type {Record<string, string>} */ ({
  strength: 'dumbbell', running: 'footprints', cycling: 'bike', walking: 'footprints', hiking: 'mountain',
  swimming: 'waves', rowing: 'waves', hiit: 'flame', yoga: 'leaf', mobility: 'leaf', team_sport: 'trophy', racket: 'trophy', other: 'activity',
});

/** @param {'green' | 'yellow' | 'red' | null} zone */
export function zoneClass(zone) {
  return zone ? `z-${zone}` : 'z-none';
}

/** @param {'green' | 'yellow' | 'red' | null} zone */
export function zoneLabel(zone) {
  return zone === 'green' ? 'Vert' : zone === 'yellow' ? 'Jaune' : zone === 'red' ? 'Rouge' : '—';
}

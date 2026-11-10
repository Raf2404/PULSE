// @ts-check
/** Petites fonctions statistiques pures, partagées par le moteur de scores. */

/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {number} v @param {number} [d] */
export const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };

/** @param {number[]} xs @returns {number | null} */
export function mean(xs) {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** @param {number[]} xs @returns {number | null} */
export function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Écart-type (échantillon). @param {number[]} xs @returns {number | null} */
export function sd(xs) {
  if (xs.length < 2) return null;
  const m = /** @type {number} */ (mean(xs));
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/** @param {number[]} xs @returns {number} */
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * Valeurs non nulles d'une liste.
 * @template T
 * @param {(T | null | undefined)[]} xs
 * @returns {T[]}
 */
export const present = (xs) => /** @type {T[]} */ (xs.filter((x) => x !== null && x !== undefined));

/**
 * Pente (par pas) d'une régression linéaire simple ; null si moins de 3 points.
 * @param {(number | null)[]} ys
 */
export function slope(ys) {
  const pts = ys.map((y, i) => [i, y]).filter((p) => p[1] !== null);
  if (pts.length < 3) return null;
  const mx = /** @type {number} */ (mean(pts.map((p) => /** @type {number} */ (p[0]))));
  const my = /** @type {number} */ (mean(pts.map((p) => /** @type {number} */ (p[1]))));
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) {
    num += (/** @type {number} */ (x) - mx) * (/** @type {number} */ (y) - my);
    den += (/** @type {number} */ (x) - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Tendance d'une métrique : compare la valeur récente à la moyenne de référence.
 * @param {number | null} value
 * @param {number | null} reference
 * @param {number} threshold écart relatif minimal pour parler de hausse/baisse
 * @returns {'up' | 'down' | 'flat' | null}
 */
export function trend(value, reference, threshold = 0.03) {
  if (value === null || reference === null || reference === 0) return null;
  const rel = (value - reference) / Math.abs(reference);
  if (rel > threshold) return 'up';
  if (rel < -threshold) return 'down';
  return 'flat';
}

/**
 * Nombre de jours consécutifs (en partant de la fin) où la condition est vraie.
 * @template T
 * @param {T[]} xs
 * @param {(x: T) => boolean} pred
 */
export function runLength(xs, pred) {
  let n = 0;
  for (let i = xs.length - 1; i >= 0; i--) {
    if (!pred(xs[i])) break;
    n++;
  }
  return n;
}

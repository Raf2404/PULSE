// @ts-check
/**
 * Les trois anneaux de l'accueil : Récupération (0–100 %), Sommeil (0–100), Effort (0–21).
 * Une valeur null affiche « — » (pas encore de score : calibration ou données manquantes).
 */

const R = 42;
const STROKE = 9;
const CIRC = 2 * Math.PI * R;

/**
 * @typedef {object} RingSpec
 * @property {'recovery' | 'sleep' | 'strain'} kind
 * @property {string} label
 * @property {number | null} value
 * @property {number} max
 * @property {string} [suffix]
 * @property {string} [sub] légende sous le libellé
 * @property {string} [color] couleur imposée (ex. jaune/rouge pour la récupération)
 */

/**
 * @param {RingSpec} ring
 * @param {number} index rang pour l'apparition en cascade
 */
function ringHTML(ring, index) {
  const ratio = ring.value === null ? 0 : Math.max(0, Math.min(1, ring.value / ring.max));
  const valueText = ring.value === null ? '—' : `${ring.value}${ring.suffix ?? ''}`;
  const aria = ring.value === null
    ? `${ring.label} : pas encore de score`
    : `${ring.label} : ${ring.value}${ring.suffix ?? ''} sur ${ring.max}`;
  const colorVar = ring.color ? ` data-color="${ring.color}"` : '';
  return `
    <div class="ring ${ring.kind} reveal" data-i="${index}" role="img" aria-label="${aria}"${colorVar}>
      <div class="ring-svg">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="ring-track" cx="50" cy="50" r="${R}" fill="none" stroke-width="${STROKE}"></circle>
          <circle class="ring-bar" cx="50" cy="50" r="${R}" fill="none" stroke-width="${STROKE}"
            stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${CIRC.toFixed(2)}"
            data-target="${(CIRC * (1 - ratio)).toFixed(2)}"></circle>
        </svg>
        <div class="ring-value${ring.value === null ? ' empty' : ''}" data-count="${ring.value ?? ''}" data-suffix="${ring.suffix ?? ''}">${valueText}</div>
      </div>
      <div class="ring-label">${ring.label}</div>
      ${ring.sub ? `<div class="ring-sub">${ring.sub}</div>` : ''}
    </div>`;
}

/** @param {RingSpec[]} rings */
export function ringsHTML(rings) {
  return `<div class="rings">${rings.map(ringHTML).join('')}</div>`;
}

/**
 * Lance l'animation : les anneaux se remplissent et les chiffres défilent (6.3).
 * Les styles dynamiques passent par le CSSOM (compatible avec la politique de sécurité CSP).
 * @param {HTMLElement} root
 * @param {boolean} reducedMotion
 */
export function animateRings(root, reducedMotion) {
  root.querySelectorAll('.ring[data-color]').forEach((el) => {
    /** @type {HTMLElement} */ (el).style.setProperty('--ring-color', /** @type {HTMLElement} */ (el).dataset.color ?? '');
  });
  const bars = /** @type {NodeListOf<SVGCircleElement>} */ (root.querySelectorAll('.ring-bar'));
  requestAnimationFrame(() => {
    bars.forEach((bar) => { bar.style.strokeDashoffset = bar.dataset.target ?? String(CIRC); });
  });

  root.querySelectorAll('.ring-value[data-count]').forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    const target = Number(el.dataset.count);
    if (el.dataset.count === '' || !Number.isFinite(target)) return;
    const suffix = el.dataset.suffix ?? '';
    if (reducedMotion) { el.textContent = `${target}${suffix}`; return; }
    const duration = 1200;
    const t0 = performance.now();
    /** @param {number} now */
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      el.textContent = `${Math.round(target * eased)}${suffix}`;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

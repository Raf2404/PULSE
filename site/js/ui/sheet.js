// @ts-check
/**
 * Panneau de détail plein écran (niveau 3 de la règle des 3 niveaux).
 * S'ouvre en « s'étirant » depuis la carte touchée (shared layout, 350 ms).
 */
import { icon } from './icons.js';
import { esc } from './format.js';

/** @type {HTMLElement | null} */
let current = null;
/** @type {Element | null} */
let lastFocus = null;
/** @type {(() => void) | null} */
let onCloseCb = null;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {{ title: string, body: string, origin?: Element | null, onMount?: (root: HTMLElement) => void, onClose?: () => void }} o
 */
export function openSheet(o) {
  closeSheet(true);
  lastFocus = document.activeElement;
  onCloseCb = o.onClose ?? null;
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', o.title);
  el.innerHTML = `<div class="sheet-panel">
      <header class="sheet-header"><h2>${esc(o.title)}</h2><button class="icon-btn" data-sheet-close aria-label="Fermer">${icon('x', { size: 22 })}</button></header>
      <div class="sheet-body">${o.body}</div>
    </div>`;
  document.body.append(el);
  document.body.classList.add('no-scroll');
  current = el;
  const panel = /** @type {HTMLElement} */ (el.querySelector('.sheet-panel'));
  o.onMount?.(panel);

  if (!reduced() && o.origin) {
    const from = o.origin.getBoundingClientRect();
    const to = panel.getBoundingClientRect();
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    panel.animate([
      { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`, borderRadius: '20px', opacity: 0.6 },
      { transformOrigin: 'top left', transform: 'none', borderRadius: '0px', opacity: 1 },
    ], { duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  } else {
    panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  }
  /** @type {HTMLElement | null} */ (el.querySelector('[data-sheet-close]'))?.focus();
}

/** @param {boolean} [immediate] */
export function closeSheet(immediate = false) {
  const el = current;
  if (!el) return;
  current = null;
  document.body.classList.remove('no-scroll');
  const done = () => {
    el.remove();
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    onCloseCb?.();
    onCloseCb = null;
  };
  if (immediate || reduced()) { done(); return; }
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).finished.then(done, done);
}

export const sheetOpen = () => current !== null;

document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('[data-sheet-close]')) closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current) closeSheet();
});

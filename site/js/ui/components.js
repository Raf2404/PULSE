// @ts-check
/** Composants HTML réutilisés par les écrans. */
import { icon } from './icons.js';
import { esc } from './format.js';
import { S } from '../state.js';

/**
 * En-tête d'écran.
 * @param {string} id @param {string} title @param {{ eyebrow?: string, back?: string, right?: string }} [o]
 */
export function header(id, title, o = {}) {
  const demo = S.mode === 'demo' ? `<span class="badge demo">${icon('flask-conical', { size: 14 })}Démo</span>` : '';
  const level = S.progress && !o.back ? `<a class="level-chip" href="#/profil/progression" aria-label="Niveau ${S.progress.level}, ${esc(S.progress.rank)}"><span class="level-num">${S.progress.level}</span>${esc(S.progress.rank)}</a>` : '';
  return `<header class="screen-header">
    ${o.back ? `<a class="icon-btn" href="${o.back}" aria-label="Retour">${icon('chevron-left', { size: 22 })}</a>` : ''}
    <div class="screen-title">
      ${o.eyebrow ? `<div class="eyebrow">${esc(o.eyebrow)}</div>` : ''}
      <h1 id="t-${id}">${esc(title)}</h1>
    </div>
    <div class="header-side">${o.right ?? ''}${demo}${level}</div>
  </header>`;
}

/**
 * Carte d'état vide (avec illustration et action).
 * @param {{ iconName: string, tone?: string, title: string, text: string, tag?: string, action?: string }} o
 */
export function emptyCard(o) {
  return `<div class="card empty reveal">
    <div class="card-icon ${o.tone ?? ''}">${icon(o.iconName, { size: 26 })}</div>
    <h2>${esc(o.title)}</h2>
    <p>${o.text}</p>
    ${o.tag ? `<span class="badge">${icon('hourglass', { size: 13 })}${esc(o.tag)}</span>` : ''}
    ${o.action ?? ''}
  </div>`;
}

/**
 * En-tête de carte : icône + titre (+ sous-titre).
 * @param {string} iconName @param {string} title @param {{ tone?: string, sub?: string, right?: string }} [o]
 */
export function cardHead(iconName, title, o = {}) {
  return `<div class="card-head"><div class="card-icon ${o.tone ?? ''}">${icon(iconName)}</div>
    <div class="card-head-text"><h2>${esc(title)}</h2>${o.sub ? `<p class="note">${o.sub}</p>` : ''}</div>${o.right ?? ''}</div>`;
}

/** @param {string} text */
export const sectionTitle = (text) => `<h2 class="section-title reveal">${esc(text)}</h2>`;

/**
 * Flèche de tendance (vs moyenne 30 j). Couleur selon que la hausse est bonne ou non.
 * @param {'up' | 'down' | 'flat' | null} t @param {boolean} higherIsBetter
 */
export function trendArrow(t, higherIsBetter) {
  if (!t) return '';
  if (t === 'flat') return `<span class="trend flat" title="stable">${icon('minus', { size: 14, label: 'stable' })}</span>`;
  const good = (t === 'up') === higherIsBetter;
  return `<span class="trend ${good ? 'good' : 'bad'}">${icon(t === 'up' ? 'trending-up' : 'trending-down', { size: 14, label: t === 'up' ? 'en hausse' : 'en baisse' })}</span>`;
}

/**
 * Interrupteur accessible.
 * @param {{ name: string, checked: boolean, label: string, hint?: string, action?: string }} o
 */
export function toggle(o) {
  return `<label class="toggle-row">
    <span><span class="toggle-label">${esc(o.label)}</span>${o.hint ? `<span class="note">${esc(o.hint)}</span>` : ''}</span>
    <input type="checkbox" role="switch" name="${esc(o.name)}" ${o.checked ? 'checked' : ''} ${o.action ? `data-change="${esc(o.action)}"` : ''}>
    <span class="switch" aria-hidden="true"></span>
  </label>`;
}

/**
 * Sélecteur segmenté (onglets internes).
 * @param {{ name: string, value: string, options: [string, string][], action: string }} o
 */
export function segmented(o) {
  return `<div class="segmented" role="tablist">${o.options.map(([v, label]) => `<button type="button" role="tab" aria-selected="${v === o.value}" data-action="${esc(o.action)}" data-value="${esc(v)}">${esc(label)}</button>`).join('')}</div>`;
}

/**
 * Pastilles à choix (multiples ou unique).
 * @param {{ name: string, options: [string, string][], selected: string[], multiple?: boolean }} o
 */
export function chips(o) {
  return `<div class="chips">${o.options.map(([v, label]) => `<label class="chip"><input type="${o.multiple ? 'checkbox' : 'radio'}" name="${esc(o.name)}" value="${esc(v)}" ${o.selected.includes(v) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`;
}

/** Barre d'XP (dégradé réservé à l'XP). @param {number} ratio @param {string} [label] */
export function xpBar(ratio, label = '') {
  return `<div class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}" aria-label="${esc(label || 'Progression du niveau')}"><span class="xp-fill" data-width="${(ratio * 100).toFixed(1)}"></span></div>`;
}

/**
 * Barre de progression d'un pilier (0–100).
 * @param {string} label @param {number | null} value @param {string} tone @param {string} [detail]
 */
export function pillar(label, value, tone, detail = '') {
  return `<div class="pillar">
    <div class="pillar-top"><span>${esc(label)}</span><span class="pillar-value">${value === null ? '—' : Math.round(value)}</span></div>
    <div class="pillar-track"><span class="pillar-fill f-${tone}" data-width="${value === null ? 0 : Math.max(2, value).toFixed(0)}"></span></div>
    ${detail ? `<div class="note">${detail}</div>` : ''}
  </div>`;
}

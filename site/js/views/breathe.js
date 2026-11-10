// @ts-check
/**
 * Respiration guidée (Phase 3) : cercle animé qui grossit et rétrécit au rythme de l'exercice.
 * Cohérence cardiaque (5-5), 4-7-8 ou respiration carrée. Comptée en XP (≥ 2 min).
 */
import { icon } from '../ui/icons.js';
import { header, cardHead } from '../ui/components.js';
import { esc } from '../ui/format.js';
import { S } from '../state.js';
import { localDateKey } from '../data/schema.js';
import { CONFIG } from '../scoring/config.js';

export const PATTERNS = /** @type {const} */ ({
  coherence: { label: 'Cohérence cardiaque', hint: '5 s inspire · 5 s expire', phases: [['in', 5], ['out', 5]] },
  '478': { label: '4-7-8', hint: 'Inspire 4 s · retiens 7 s · expire 8 s', phases: [['in', 4], ['hold', 7], ['out', 8]] },
  box: { label: 'Respiration carrée', hint: '4 s · 4 s · 4 s · 4 s', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold2', 4]] },
});

/** @typedef {keyof typeof PATTERNS} PatternKey */

export const breatheState = {
  /** @type {PatternKey} */ pattern: 'coherence',
  minutes: 2,
  running: false,
};

export function renderBreathe() {
  const head = header('respirer', 'Respiration guidée', { back: '#/aujourdhui' });
  const today = localDateKey(Date.now());
  const doneToday = S.breathing.filter((b) => localDateKey(b.start) === today && b.durationSec >= CONFIG.xp.breathingMinSec).length;
  return `${head}
    <div class="card breathe reveal">
      <div class="breathe-stage" aria-live="polite">
        <div class="breathe-circle" data-breathe-circle></div>
        <div class="breathe-text"><strong data-breathe-phase>Prêt ?</strong><span data-breathe-time>${breatheState.minutes}:00</span></div>
      </div>
      <div class="segmented" role="tablist" aria-label="Exercice">${Object.entries(PATTERNS).map(([k, p]) => `<button type="button" role="tab" aria-selected="${breatheState.pattern === k}" data-action="breathe-pattern" data-value="${k}" ${breatheState.running ? 'disabled' : ''}>${esc(p.label)}</button>`).join('')}</div>
      <p class="note center">${esc(PATTERNS[breatheState.pattern].hint)}</p>
      <div class="segmented" role="tablist" aria-label="Durée">${[2, 5, 10].map((m) => `<button type="button" role="tab" aria-selected="${breatheState.minutes === m}" data-action="breathe-minutes" data-value="${m}" ${breatheState.running ? 'disabled' : ''}>${m} min</button>`).join('')}</div>
      <button class="btn primary" data-action="breathe-toggle">${icon(breatheState.running ? 'pause' : 'play', { size: 18 })}${breatheState.running ? 'Arrêter' : 'Commencer'}</button>
    </div>
    <div class="card reveal">${cardHead('wind', 'Pourquoi respirer ?', { tone: 'xp', sub: `+${CONFIG.xp.points.breathing} XP dès 2 min · ${doneToday}/${CONFIG.xp.breathingPerDayMax} aujourd'hui` })}
      <p>Une respiration lente (autour de 6 cycles par minute) aide le corps à passer en mode récupération. Idéal quand ton moniteur de stress grimpe, ou le soir avant de dormir.</p></div>`;
}

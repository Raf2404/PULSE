// @ts-check
/** Écran « Coach » : bilan hebdo, questions rapides, chat (IA avec clé perso, sinon coach à règles). */
import { icon } from '../ui/icons.js';
import { header, cardHead } from '../ui/components.js';
import { lineChart, barChart } from '../ui/charts.js';
import { esc, shortDate, longDate, dur, num } from '../ui/format.js';
import { S, aiReady, todayKey, sessionOn, AI_DAILY_LIMIT } from '../state.js';
import { weeklyReview } from '../coach/rules.js';
import { weekOf } from '../scoring/gamification.js';
import { COACH_STYLES } from '../data/profile.js';

/** @typedef {import('../coach/tools.js').Card} Card */
/** @typedef {import('../state.js').ChatMessage} ChatMessage */

export const QUICK = /** @type {const} */ ([
  ['tired', 'Pourquoi je suis fatigué ?'],
  ['train', 'Je m\'entraîne aujourd\'hui ?'],
  ['week', 'Analyse ma semaine'],
  ['sleep', 'Améliore mon sommeil'],
]);

/**
 * Mise en forme légère du texte du coach (gras, listes, paragraphes), après échappement.
 * @param {string} text
 */
export function richText(text) {
  const blocks = esc(text).split(/\n{2,}/);
  return blocks.map((b) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*([-•*]|\d+\.)\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${l.replace(/^\s*([-•*]|\d+\.)\s+/, '')}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.join('<br>')}</p>`;
  }).join('').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

const CHART_META = {
  recovery: { label: 'Récupération', tone: /** @type {const} */ ('recovery'), get: (/** @type {import('../scoring/scores.js').DayRecord} */ r) => r.recovery, min: 0, max: 100 },
  sleepScore: { label: 'Score sommeil', tone: /** @type {const} */ ('sleep'), get: (/** @type {import('../scoring/scores.js').DayRecord} */ r) => r.sleepScore, min: 0, max: 100 },
  hrv: { label: 'VFC (ms)', tone: /** @type {const} */ ('recovery'), get: (/** @type {import('../scoring/scores.js').DayRecord} */ r) => r.hrv, min: undefined, max: undefined },
  rhr: { label: 'FC repos (bpm)', tone: /** @type {const} */ ('red'), get: (/** @type {import('../scoring/scores.js').DayRecord} */ r) => r.rhr, min: undefined, max: undefined },
  strain: { label: 'Effort', tone: /** @type {const} */ ('strain'), get: (/** @type {import('../scoring/scores.js').DayRecord} */ r) => r.strain, min: 0, max: 21 },
  steps: { label: 'Pas', tone: /** @type {const} */ ('strain'), get: (/** @type {import('../scoring/scores.js').DayRecord} */ r) => r.steps, min: 0, max: undefined },
  sleepDuration: { label: 'Durée de sommeil', tone: /** @type {const} */ ('sleep'), get: (/** @type {import('../scoring/scores.js').DayRecord} */ r) => (r.night ? r.night.asleepMin / 60 : null), min: undefined, max: undefined },
};

/**
 * Carte affichée sous une réponse du coach.
 * @param {Card} card
 */
export function renderCard(card) {
  if (card.kind === 'chart') {
    const m = CHART_META[card.metric];
    const rs = S.records.slice(-card.days);
    const body = card.metric === 'steps' || card.metric === 'strain'
      ? barChart({ bars: rs.map((r) => ({ label: shortDate(r.date), value: m.get(r) })), max: card.metric === 'strain' ? 21 : Math.max(1, ...rs.map((r) => r.steps ?? 0)), tone: m.tone, title: `${m.label} sur ${card.days} jours` })
      : lineChart({ points: rs.map((r) => ({ label: shortDate(r.date), value: m.get(r) })), tone: m.tone, title: `${m.label} sur ${card.days} jours`, min: m.min, max: m.max, format: card.metric === 'sleepDuration' ? (v) => dur(v * 60) : (v) => num(v) });
    return `<div class="chat-card"><span class="note">${esc(m.label)} · ${card.days} jours</span>${body}</div>`;
  }
  if (card.kind === 'session') {
    const s = sessionOn(card.date);
    if (!s) return '';
    return `<a class="chat-card link-card" href="#/sport/seance/${esc(s.date)}">${icon('dumbbell', { size: 18 })}<span><strong>${esc(s.title)}</strong><span class="note">${esc(longDate(s.date))}${s.version === 'light' ? ' · version allégée' : s.version === 'rest' ? ' · repos actif' : ''}</span></span>${icon('chevron-right', { size: 18 })}</a>`;
  }
  if (card.kind === 'program') {
    const p = S.programs.find((x) => x.id === card.programId);
    if (!p) return '';
    return `<a class="chat-card link-card" href="#/sport/programme">${icon('list-checks', { size: 18 })}<span><strong>${esc(p.title)}</strong><span class="note">${p.weeks} semaines · ${p.days.length} séances par semaine</span></span>${icon('chevron-right', { size: 18 })}</a>`;
  }
  return `<div class="chat-card memo">${icon('brain', { size: 16 })}<span>Retenu : <strong>${esc(card.key)}</strong> : ${esc(card.value)}</span></div>`;
}

/** @param {ChatMessage} m */
export function bubble(m) {
  if (m.role === 'user') return `<div class="msg user" data-msg="${esc(m.id)}"><div class="msg-text">${esc(m.text)}</div></div>`;
  return `<div class="msg coach" data-msg="${esc(m.id)}">
    <span class="avatar" aria-hidden="true">${icon('sparkles', { size: 16 })}</span>
    <div class="msg-body"><div class="msg-text">${richText(m.text)}</div><div class="msg-cards">${m.cards.map(renderCard).join('')}</div>
    ${m.source === 'rules' ? '<span class="note">Réponse du coach à règles</span>' : ''}</div>
  </div>`;
}

function reviewCard() {
  const monday = weekOf(todayKey());
  const ai = S.insights.get(`week:${monday}`);
  if (S.records.length < 14) return '';
  const w = weeklyReview(S.records, S.correlations);
  return `<details class="card reveal review" ${new Date().getDay() === 1 ? 'open' : ''}>
    <summary>${cardHead('calendar', 'Bilan de la semaine', { tone: 'xp', sub: ai ? 'Rédigé par ton coach IA' : 'Ce qui a marché, ce qui a baissé, 3 actions' })}</summary>
    ${ai ? `<div class="msg-text">${richText(ai.text)}</div>` : `
      ${w.worked.length ? `<p><strong>Ce qui a marché :</strong> ${esc(w.worked.join(', '))}.</p>` : ''}
      ${w.dropped.length ? `<p><strong>Ce qui a baissé :</strong> ${esc(w.dropped.join(', '))}.</p>` : ''}
      <ol class="actions-list">${w.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`}
  </details>`;
}

export function renderCoach() {
  const style = COACH_STYLES[S.profile.coachStyle];
  const ready = aiReady();
  const head = header('coach', 'Coach', { eyebrow: `${style.label} · ${ready ? 'IA active' : 'coach à règles'}` });
  const setup = ready ? '' : `<a class="card link-card reveal" href="#/profil/coach">
      ${cardHead('key', 'Active le coach IA', { tone: 'xp', sub: 'Avec ta propre clé API Claude, stockée sur ton téléphone', right: icon('chevron-right', { size: 20 }) })}
      <p class="note">En attendant, les questions rapides ci-dessous répondent à partir de tes chiffres.</p></a>`;
  const usage = ready && S.aiUsage.date === todayKey() ? `<p class="note center">${S.aiUsage.count}/${AI_DAILY_LIMIT} échanges IA aujourd'hui</p>` : '';
  const empty = !S.messages.length
    ? `<div class="chat-empty reveal"><span class="avatar big" aria-hidden="true">${icon('sparkles', { size: 24 })}</span><p>Pose une question sur ta forme, ton sommeil ou ton entraînement. ${ready ? 'Ton coach connaît tes 30 derniers jours.' : ''}</p></div>`
    : '';
  return `${head}
    ${setup}
    ${reviewCard()}
    <div class="quick reveal" role="group" aria-label="Questions rapides">${QUICK.map(([k, q]) => `<button type="button" class="chip-btn" data-action="quick" data-kind="${k}">${esc(q)}</button>`).join('')}</div>
    <section class="chat" id="chat" aria-live="polite">${empty}${S.messages.map(bubble).join('')}</section>
    ${usage}
    <form class="composer" data-form="chat">
      <textarea name="text" rows="1" maxlength="1500" placeholder="${ready ? 'Écris à ton coach…' : 'Ajoute ta clé API pour discuter librement'}" aria-label="Message au coach" ${ready ? '' : 'disabled'}></textarea>
      <button class="icon-btn send" type="submit" aria-label="Envoyer" ${ready ? '' : 'disabled'}>${icon('send', { size: 20 })}</button>
      <button class="icon-btn stop" type="button" data-action="chat-stop" aria-label="Arrêter" hidden>${icon('square', { size: 18 })}</button>
    </form>
    ${S.messages.length ? '<button class="link center reveal" data-action="chat-clear">Effacer la conversation</button>' : ''}`;
}

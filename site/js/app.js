// @ts-check
/**
 * PULSE — coquille de l'app : navigation, actions, formulaires, import, coach IA, level up.
 * Les écrans (views/*) produisent du HTML ; ce module branche les interactions.
 */
import { icon } from './ui/icons.js';
import { animateRings } from './ui/rings.js';
import { openSheet, closeSheet } from './ui/sheet.js';
import { xpGain, haptic } from './ui/fx.js';
import { showLevelUp } from './ui/levelup.js';
import * as db from './data/db.js';
import { recompute } from './data/pipeline.js';
import { validateJournalEntry } from './data/schema.js';
import { S, loadAll, refreshDerived, saveProfile, saveMeta, todayKey, latest, aiReady, useAiQuota, activeProgram, sessionOn } from './state.js';
import { renderToday, todayDetail } from './views/today.js';
import { renderSleep, sleepDetail, setSleepPeriod } from './views/sleep.js';
import { renderSport, renderProgram, renderSession, renderCreator, renderLibrary, sportDetail } from './views/sport.js';
import { renderCoach, bubble, renderCard, richText, QUICK } from './views/coach.js';
import { renderProfile, renderProgression, renderCoachSettings, renderNotifications, renderData, renderShortcuts } from './views/profile.js';
import { renderOnboarding, onboardingStep, setOnboardingStep } from './views/onboarding.js';
import { renderBreathe, breatheState, PATTERNS } from './views/breathe.js';
import { renderReport } from './views/report.js';
import { journalForm } from './views/journal.js';
import { briefText, quickAnswer, weeklyReview } from './coach/rules.js';
import { buildContext } from './coach/context.js';
import { createProgram, sanitizeTemplates } from './program/generator.js';
import { weekOf, rankOf } from './scoring/gamification.js';
import { tonightNeed } from './scoring/scores.js';
import { parseShortcutPayload, payloadFromHash } from './import/shortcut.js';
import { enablePush, disablePush, syncReminders, testPush } from './notify.js';
import { minutesOf } from './data/profile.js';
import { esc } from './ui/format.js';

/** @typedef {'aujourdhui' | 'sommeil' | 'sport' | 'coach' | 'profil'} Tab */
/** @typedef {import('./state.js').ChatMessage} ChatMessage */
/** @typedef {import('./program/generator.js').PlannedSession} PlannedSession */
/** @typedef {import('./program/generator.js').Questionnaire} Questionnaire */

const TABS = /** @type {const} */ (['aujourdhui', 'sommeil', 'sport', 'coach', 'profil']);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** @type {Tab | null} */
let currentTab = null;
/** @type {string[]} */
let currentParts = [];
/** @type {AbortController | null} */
let chatAbort = null;

// ---------------------------------------------------------------- utilitaires

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} text */
function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3600);
}

/**
 * @param {string} title @param {string} text @param {string} okLabel
 * @returns {Promise<boolean>}
 */
function confirmDialog(title, text, okLabel) {
  const dialog = /** @type {HTMLDialogElement} */ ($('confirm-dialog'));
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-ok').textContent = okLabel;
  return new Promise((resolve) => {
    /** @param {boolean} v */
    const finish = (v) => { cleanup(); if (dialog.open) dialog.close(); resolve(v); };
    const ok = () => finish(true);
    const cancel = () => finish(false);
    const onClose = () => finish(false);
    const cleanup = () => {
      $('confirm-ok').removeEventListener('click', ok);
      $('confirm-cancel').removeEventListener('click', cancel);
      dialog.removeEventListener('close', onClose);
    };
    $('confirm-ok').addEventListener('click', ok);
    $('confirm-cancel').addEventListener('click', cancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

/** Applique styles dynamiques (cascade, largeurs) et interactions après un rendu. @param {HTMLElement} root */
function hydrate(root) {
  let i = 0;
  root.querySelectorAll('.reveal').forEach((node) => {
    /** @type {HTMLElement} */ (node).style.setProperty('--i', String(Math.min(i++, 12)));
  });
  root.querySelectorAll('[data-width]').forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    requestAnimationFrame(() => el.style.setProperty('width', `${el.dataset.width}%`));
  });
  animateRings(root, reducedMotion.matches);
  root.querySelectorAll('textarea[name="text"]').forEach((t) => autosize(/** @type {HTMLTextAreaElement} */ (t)));
}

/** @param {HTMLTextAreaElement} t */
function autosize(t) {
  t.style.setProperty('height', 'auto');
  t.style.setProperty('height', `${Math.min(140, t.scrollHeight)}px`);
}

function applyTheme() {
  const t = S.profile.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0b0d' : '#f5f6f8');
}

// ---------------------------------------------------------------- navigation

/** @param {string[]} parts */
function tabOf(parts) {
  const p = parts[0];
  if (/** @type {readonly string[]} */ (TABS).includes(p)) return /** @type {Tab} */ (p);
  if (p === 'respirer') return 'aujourdhui';
  if (p === 'rapport') return 'profil';
  return 'aujourdhui';
}

/** @param {string[]} parts */
function viewHtml(parts) {
  const [p, sub, arg] = parts;
  if (p === 'respirer') return renderBreathe();
  if (p === 'rapport') return renderReport(sub);
  switch (tabOf(parts)) {
    case 'sommeil': return renderSleep();
    case 'sport':
      if (sub === 'programme') return renderProgram();
      if (sub === 'seance' && arg) return renderSession(arg);
      if (sub === 'creer') return renderCreator();
      if (sub === 'exercices') return renderLibrary();
      return renderSport();
    case 'coach': return renderCoach();
    case 'profil':
      if (sub === 'progression') return renderProgression();
      if (sub === 'coach') return renderCoachSettings();
      if (sub === 'notifications') return renderNotifications();
      if (sub === 'donnees') return renderData();
      if (sub === 'raccourcis') return renderShortcuts();
      return renderProfile();
    default: return renderToday();
  }
}

/** Re-rend l'écran courant (après un changement d'état). */
function render() {
  if (!currentTab) return;
  const el = $(`screen-${currentTab}`);
  el.innerHTML = viewHtml(currentParts);
  hydrate(el);
  if (currentTab === 'coach') scrollChat();
  renderOverlay();
}

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (raw.startsWith('import=')) return; // traité par handleUrlImport
  const parts = raw.split('/').filter(Boolean);
  const tab = tabOf(parts);
  const prevTab = currentTab;
  const prevKey = currentParts.join('/');
  currentTab = tab;
  currentParts = parts.length ? parts : [tab];
  closeSheet(true);
  for (const t of TABS) $(`screen-${t}`).hidden = t !== tab;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (/** @type {HTMLElement} */ (a).dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('fab-coach').hidden = tab === 'coach' || !S.onboarded;
  if (parts[0] === 'respirer' && breatheState.running) stopBreathing(false);
  render();
  const label = /** @type {HTMLElement | null} */ (document.querySelector(`.tabbar a[data-tab="${tab}"]`))?.textContent?.trim() ?? '';
  document.title = tab === 'aujourdhui' && currentParts.length <= 1 ? 'PULSE' : `${label} · PULSE`;
  if (prevTab && prevKey !== currentParts.join('/')) {
    const dir = prevTab === tab ? 1 : TABS.indexOf(tab) > TABS.indexOf(prevTab) ? 1 : -1;
    const frames = reducedMotion.matches
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }];
    $(`screen-${tab}`).animate(frames, { duration: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    if (tab !== 'coach') window.scrollTo({ top: 0 });
  }
}

/** @param {string} hash */
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function renderOverlay() {
  const host = $('overlay');
  if (S.loaded && !S.onboarded) {
    host.innerHTML = renderOnboarding();
    hydrate(host);
    document.body.classList.add('no-scroll');
  } else if (host.innerHTML) {
    host.innerHTML = '';
    document.body.classList.remove('no-scroll');
  }
}

// ---------------------------------------------------------------- données

/** @param {number} ratio @param {string} [label] */
function setProgress(ratio, label) {
  document.querySelectorAll('[data-action="load-demo"] .progress, [data-action="pick-import"] .progress').forEach((bar) => {
    /** @type {HTMLElement} */ (bar).style.setProperty('width', `${Math.round(ratio * 100)}%`);
  });
  if (label) {
    let el = document.querySelector('.progress-label');
    if (!el) {
      el = document.createElement('div');
      el.className = 'progress-label toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = `${label} · ${Math.round(ratio * 100)} %`;
  }
}

function clearProgress() {
  document.querySelector('.progress-label')?.remove();
}

/** Après un chargement de données : état, niveau vu sans animation (XP rétroactive). */
async function reloadAfterData() {
  await loadAll();
  if (S.progress) {
    S.lastSeenLevel = S.progress.level;
    S.seenBadges = S.progress.badges.filter((b) => b.earnedAt).map((b) => b.code);
    await saveMeta('lastSeenLevel', S.lastSeenLevel);
    await saveMeta('seenBadges', S.seenBadges);
  }
  applyTheme();
  render();
  void aiBackgroundTasks();
}

/** @param {HTMLElement | null} trigger */
function needsConsent(trigger) {
  if (!trigger?.hasAttribute('data-needs-consent')) return true;
  const box = /** @type {HTMLInputElement | null} */ (document.querySelector('.onboarding input[name="healthConsent"]'));
  if (box && !box.checked) {
    toast('Coche d\'abord le consentement pour le traitement de tes données.');
    box.focus();
    return false;
  }
  return true;
}

async function loadDemo() {
  if (S.busy) return;
  if (S.data.hasSamples && S.mode !== 'demo') {
    const ok = await confirmDialog('Remplacer tes données ?', 'Charger la démo efface les données Apple Santé importées sur cet appareil.', 'Remplacer');
    if (!ok) return;
  }
  S.busy = true;
  setProgress(0.05, 'Génération de la démo');
  try {
    const { generateDemo, DEMO_PROFILE } = await import('./data/demo.js');
    // La démo se termine toujours sur une matinée complète (sinon, la nuit serait coupée en plein milieu).
    const now = new Date();
    const end = now.getHours() < 10 ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 45) : now;
    const demo = generateDemo({ end });
    await db.clearHealthData();
    await db.putSamples(demo.samples, { onProgress: (w, t) => setProgress(0.05 + 0.6 * (w / t), 'Écriture des mesures') });
    await db.putWorkouts(demo.workouts);
    await db.putJournal(demo.journal);
    await db.setMeta('mode', 'demo');
    if (!S.profile.birthYear) await saveProfile({ birthYear: DEMO_PROFILE.birthYear, sex: S.profile.sex ?? 'm', hrMax: S.profile.hrMax ?? DEMO_PROFILE.hrMax });
    if (!S.profile.healthConsent) await saveProfile({ healthConsent: true });
    await recompute({ onProgress: (r, label) => setProgress(0.65 + 0.35 * r, label) });
    await db.requestPersistence();
    await reloadAfterData();
    toast(`Démo chargée : ${new Intl.NumberFormat('fr-FR').format(demo.samples.length)} mesures sur 90 jours`);
  } catch (err) {
    console.error(err);
    toast('Impossible de charger la démo sur cet appareil.');
  } finally {
    S.busy = false;
    clearProgress();
    render();
  }
}

function pickImport() {
  const input = /** @type {HTMLInputElement} */ ($('file-input'));
  input.value = '';
  input.click();
}

/** @param {File} file */
async function runImport(file) {
  if (S.busy) return;
  S.busy = true;
  render();
  try {
    const { importAppleHealth } = await import('./import/client.js');
    if (!S.profile.healthConsent) await saveProfile({ healthConsent: true });
    const stats = await importAppleHealth(file, (r, label) => setProgress(r, label));
    await reloadAfterData();
    const n = new Intl.NumberFormat('fr-FR').format(stats.written);
    toast(stats.written ? `Import terminé : ${n} mesures et ${stats.workouts} séances (120 jours)` : 'Aucune mesure récente trouvée dans ce fichier.');
  } catch (err) {
    console.error(err);
    toast(err instanceof Error ? err.message : 'Import impossible.');
  } finally {
    S.busy = false;
    clearProgress();
    render();
  }
}

/** Import « Raccourcis » : texte reçu par lien ou collé. @param {string} payload */
async function importShortcut(payload) {
  const { samples, rejected } = parseShortcutPayload(payload);
  if (!samples.length) {
    toast(`Aucune mesure reconnue${rejected ? ` (${rejected} lignes ignorées)` : ''}.`);
    return;
  }
  if (S.mode === 'demo') await db.clearHealthData();
  await db.putSamples(samples);
  await recompute();
  await db.setMeta('mode', 'apple');
  const sources = [...new Set(samples.map((s) => s.source))];
  await db.setMeta('lastImport', { at: Date.now(), fileName: 'Raccourcis', sources, counts: { raccourcis: samples.length }, workouts: 0 });
  await reloadAfterData();
  toast(`Synchro Raccourcis : ${samples.length} mesures${rejected ? `, ${rejected} ignorées` : ''}.`);
}

async function handleUrlImport() {
  const payload = payloadFromHash(location.hash);
  if (payload === null) return false;
  history.replaceState(null, '', `${location.pathname}#/aujourdhui`);
  await importShortcut(payload);
  return true;
}

// ---------------------------------------------------------------- progression (XP, level up)

/**
 * Après une action qui rapporte de l'XP : recalcule, anime le gain et le level up éventuel.
 * @param {Element | null} anchor
 */
async function afterProgress(anchor) {
  const before = S.progress?.xpTotal ?? 0;
  refreshDerived();
  const p = S.progress;
  if (!p) return;
  const gained = p.xpTotal - before;
  if (gained > 0) xpGain(gained, anchor);
  const newBadges = p.badges.filter((b) => b.earnedAt && !S.seenBadges.includes(b.code));
  if (S.lastSeenLevel !== null && p.level > S.lastSeenLevel) {
    const prevRank = rankOf(S.lastSeenLevel);
    setTimeout(() => showLevelUp({ level: p.level, rank: p.rank, rankChanged: prevRank !== p.rank, badges: newBadges.map((b) => b.name) }), gained > 0 ? 700 : 0);
  } else if (newBadges.length) {
    toast(`Nouveau badge : ${newBadges.map((b) => b.name).join(', ')}`);
  }
  S.lastSeenLevel = p.level;
  S.seenBadges = p.badges.filter((b) => b.earnedAt).map((b) => b.code);
  await saveMeta('lastSeenLevel', S.lastSeenLevel);
  await saveMeta('seenBadges', S.seenBadges);
}

// ---------------------------------------------------------------- séances et programme

/** @param {string} date */
function storedSession(date) {
  const p = activeProgram();
  return p ? S.sessions.find((s) => s.programId === p.id && s.date === date) ?? null : null;
}

/** @param {PlannedSession} s */
async function saveSession(s) {
  await db.put('sessions', s);
  S.sessions = S.sessions.map((x) => (x.id === s.id ? s : x));
}

/**
 * @param {Questionnaire} q
 * @param {{ templates?: import('./program/generator.js').SessionTemplate[], title?: string, notes?: string, author?: 'rules' | 'coach' }} [opts]
 */
async function installProgram(q, opts = {}) {
  for (const old of S.programs.filter((x) => x.status === 'active')) {
    await db.put('programs', { ...old, status: 'archived' });
    // Les séances à venir de l'ancien programme disparaissent ; l'historique fait reste.
    for (const s of S.sessions.filter((x) => x.programId === old.id && !x.done && x.date >= todayKey())) await db.remove('sessions', s.id);
  }
  const { program, sessions } = createProgram(q, opts);
  await db.put('programs', program);
  await db.put('sessions', sessions);
  const [programs, all] = await Promise.all([db.getAll('programs'), db.getAll('sessions')]);
  S.programs = /** @type {import('./program/generator.js').Program[]} */ (programs);
  S.sessions = /** @type {PlannedSession[]} */ (all).sort((a, b) => (a.date < b.date ? -1 : 1));
  refreshDerived();
  return program;
}

// ---------------------------------------------------------------- coach IA

/** @type {import('./coach/tools.js').ToolHost} */
const toolHost = {
  metrics: (days) => S.records.slice(-days).map((r) => ({
    date: r.date, recovery: r.recovery, zone: r.zone, sleepScore: r.sleepScore, asleepMin: r.night?.asleepMin ?? null, needMin: r.needMin,
    debtMin: r.debtMin, hrv: r.hrv, rhr: r.rhr, resp: r.resp, tempDelta: r.tempDelta, strain: r.strain, target: r.target, steps: r.steps,
    deepPct: r.pillars.deepPct, remPct: r.pillars.remPct, regularityDevMin: r.pillars.regularityDevMin,
  })),
  workouts: (days) => S.records.slice(-days).flatMap((r) => r.workouts.map((w) => ({
    date: r.date, type: w.type, durationMin: Math.round(w.durationMin), avgHr: w.avgHr, maxHr: w.maxHr, strain: w.strain, zoneMin: w.zoneMin, distanceKm: w.distanceKm,
  }))),
  createProgram: async (input) => {
    const q = /** @type {Questionnaire} */ ({ goal: input.goal, level: input.level, days: input.days, equipment: input.equipment, injuries: input.injuries, weeks: input.weeks, cardio: input.cardio });
    const templates = sanitizeTemplates(input.templates);
    const program = await installProgram(q, {
      templates: templates.length ? templates : undefined,
      title: typeof input.title === 'string' ? input.title.slice(0, 60) : undefined,
      notes: typeof input.notes === 'string' ? input.notes.slice(0, 300) : undefined,
      author: 'coach',
    });
    const first = S.sessions.find((s) => s.programId === program.id);
    return { programId: program.id, summary: `Programme créé : « ${program.title} », ${program.weeks} semaines, séances : ${program.templates.map((t) => t.title).join(', ')}. Première séance le ${first?.date ?? '—'}.` };
  },
  adjustToday: async (mode, reason) => {
    const s = storedSession(todayKey());
    if (!s) return 'Aucune séance prévue aujourd\'hui dans le programme.';
    await saveSession({ ...s, version: mode, locked: true, adjustNote: reason });
    return `Séance du jour passée en version ${mode === 'light' ? 'allégée' : mode === 'rest' ? 'repos actif' : 'prévue'}.`;
  },
  saveMemory: async (key, value) => {
    const row = { key, value, updatedAt: Date.now() };
    await db.put('memory', row);
    S.memory = [...S.memory.filter((m) => m.key !== key), row];
  },
  hasSession: (date) => Boolean(sessionOn(date)),
};

function coachContext() {
  return buildContext({
    profile: S.profile, memory: S.memory, records: S.records, correlations: S.correlations, progress: S.progress,
    program: activeProgram(), todaySession: sessionOn(todayKey()),
  });
}

/** Historique à rejouer à l'API : seulement les échanges IA complets, les 10 derniers. */
function apiHistory() {
  /** @type {import('./vendor/anthropic.js').Anthropic.Beta.BetaMessageParam[][]} */
  const turns = [];
  for (let i = 0; i < S.messages.length - 1; i++) {
    const u = S.messages[i];
    const c = S.messages[i + 1];
    if (u.role === 'user' && c.role === 'coach' && c.source === 'ai' && c.api?.length) {
      turns.push([{ role: 'user', content: u.text }, ...c.api]);
      i++;
    }
  }
  return turns.slice(-10).flat();
}

function scrollChat() {
  const chat = document.getElementById('chat');
  if (!chat) return;
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight }));
}

/** @param {ChatMessage} m */
async function addMessage(m) {
  S.messages.push(m);
  await db.put('messages', m);
}

/** @param {string} text */
async function sendChat(text) {
  const clean = text.trim();
  if (!clean || chatAbort) return;
  if (!aiReady()) { toast('Ajoute ta clé API et ton consentement dans Profil → Coach IA.'); return; }
  if (!(await useAiQuota())) { toast('Limite d\'échanges IA atteinte pour aujourd\'hui.'); return; }
  const history = apiHistory();
  /** @type {ChatMessage} */
  const userMsg = { id: `m${Date.now().toString(36)}u`, createdAt: Date.now(), role: 'user', text: clean, cards: [], source: 'ai' };
  await addMessage(userMsg);
  /** @type {ChatMessage} */
  const coachMsg = { id: `m${Date.now().toString(36)}c`, createdAt: Date.now() + 1, role: 'coach', text: '', cards: [], source: 'ai' };
  render();
  const chat = $('chat');
  chat.querySelector('.chat-empty')?.remove();
  chat.insertAdjacentHTML('beforeend', bubble(coachMsg));
  const el = /** @type {HTMLElement} */ (chat.querySelector(`[data-msg="${coachMsg.id}"]`));
  el.classList.add('typing');
  const textEl = /** @type {HTMLElement} */ (el.querySelector('.msg-text'));
  textEl.innerHTML = '<p class="note">Ton coach réfléchit…</p>';
  setStreaming(true);
  scrollChat();
  let pending = false;
  chatAbort = new AbortController();
  try {
    const { coachTurn } = await import('./coach/api.js');
    const out = await coachTurn({
      apiKey: /** @type {string} */ (S.apiKey), style: S.profile.coachStyle, context: coachContext(), history, userText: clean,
      host: toolHost, today: todayKey(), signal: chatAbort.signal,
      onText: (t) => {
        coachMsg.text = t;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; textEl.innerHTML = richText(coachMsg.text); scrollChat(); });
      },
      onCard: (card) => {
        el.querySelector('.msg-cards')?.insertAdjacentHTML('beforeend', renderCard(card));
        hydrate(el);
      },
      onTool: (name) => { if (!coachMsg.text) textEl.innerHTML = `<p class="note">${esc(TOOL_LABELS[name] ?? 'Le coach consulte tes données…')}</p>`; },
    });
    coachMsg.text = out.text || 'C\'est fait.';
    coachMsg.cards = out.cards;
    coachMsg.api = out.newMessages.slice(1);
    await addMessage(coachMsg);
    if (out.cards.some((c) => c.kind === 'program' || c.kind === 'session')) refreshDerived();
  } catch (err) {
    const { friendlyError } = await import('./coach/api.js');
    const message = await friendlyError(err);
    coachMsg.text = coachMsg.text ? `${coachMsg.text}\n\n(${message})` : message;
    coachMsg.source = 'rules';
    await addMessage(coachMsg);
  } finally {
    chatAbort = null;
    setStreaming(false);
    render();
  }
}

const TOOL_LABELS = /** @type {Record<string, string>} */ ({
  get_metrics: 'Le coach consulte tes chiffres…',
  get_workouts: 'Le coach regarde tes séances…',
  create_program: 'Le coach construit ton programme…',
  adjust_today_session: 'Le coach adapte ta séance du jour…',
  save_memory: 'Le coach prend note…',
  show_chart: 'Le coach prépare un graphique…',
  show_session: 'Le coach retrouve ta séance…',
});

/** @param {boolean} on */
function setStreaming(on) {
  const form = document.querySelector('.composer');
  if (!form) return;
  /** @type {HTMLElement | null} */ (form.querySelector('.send'))?.toggleAttribute('hidden', on);
  /** @type {HTMLElement | null} */ (form.querySelector('.stop'))?.toggleAttribute('hidden', !on);
}

/** @param {'tired' | 'train' | 'week' | 'sleep'} kind */
async function quickQuestion(kind) {
  const q = QUICK.find(([k]) => k === kind)?.[1] ?? '';
  if (aiReady()) { await sendChat(q); return; }
  const t = tonightNeed(S.records);
  const answer = quickAnswer(kind, {
    records: S.records, session: sessionOn(todayKey()), correlations: S.correlations, style: S.profile.coachStyle,
    wakeMinutes: minutesOf(S.profile.wakeTime), tonightNeedMin: t.needMin, latencyMin: 12,
  });
  await addMessage({ id: `m${Date.now().toString(36)}u`, createdAt: Date.now(), role: 'user', text: q, cards: [], source: 'rules' });
  /** @type {import('./coach/tools.js').Card[]} */
  const cards = kind === 'week' ? [{ kind: 'chart', metric: 'recovery', days: 14 }] : kind === 'sleep' ? [{ kind: 'chart', metric: 'sleepDuration', days: 14 }] : kind === 'train' && sessionOn(todayKey()) ? [{ kind: 'session', date: todayKey() }] : [];
  await addMessage({ id: `m${Date.now().toString(36)}c`, createdAt: Date.now() + 1, role: 'coach', text: answer, cards, source: 'rules' });
  render();
}

/** Brief du matin et bilan hebdo rédigés par l'IA (une fois par jour / semaine). */
async function aiBackgroundTasks() {
  if (!aiReady() || !S.records.length) return;
  const today = todayKey();
  const r = latest();
  const { shortText } = await import('./coach/api.js');
  try {
    if (r && r.date === today && !S.insights.has(`brief:${today}`) && r.recovery !== null && (await useAiQuota())) {
      const draft = briefText({ records: S.records, session: sessionOn(today), style: S.profile.coachStyle });
      const text = await shortText({
        apiKey: /** @type {string} */ (S.apiKey),
        prompt: `Contexte chiffré :\n${coachContext()}\n\nRédige le brief du matin en 2 à 3 phrases courtes : récupération du jour, ce qui l'explique, une action concrète (intensité, séance, coucher). Style « ${S.profile.coachStyle} ». Brouillon calculé par l'app, à reformuler : « ${draft} »`,
      });
      if (text) await saveInsight({ id: `brief:${today}`, type: 'brief', date: today, text, source: 'ai', createdAt: Date.now() });
    }
    const monday = weekOf(today);
    if (S.records.length >= 14 && !S.insights.has(`week:${monday}`) && (await useAiQuota())) {
      const w = weeklyReview(S.records, S.correlations);
      const text = await shortText({
        apiKey: /** @type {string} */ (S.apiKey),
        prompt: `Contexte chiffré :\n${coachContext()}\n\nAnalyse calculée : ce qui a marché : ${w.worked.join(', ') || '—'} ; ce qui a baissé : ${w.dropped.join(', ') || '—'} ; pistes : ${w.actions.join(' | ')}.\n\nRédige le bilan hebdo : une phrase sur ce qui a marché, une sur ce qui a baissé, puis exactement 3 actions pour la semaine sous forme de liste (« - »). Style « ${S.profile.coachStyle} ».`,
      });
      if (text) await saveInsight({ id: `week:${monday}`, type: 'week', date: monday, text, source: 'ai', createdAt: Date.now() });
    }
  } catch (err) {
    console.warn('Textes IA non générés', err);
  }
}

/** @param {import('./state.js').Insight} i */
async function saveInsight(i) {
  await db.put('insights', i);
  S.insights.set(i.id, i);
  if (currentTab === 'aujourdhui' || currentTab === 'coach') render();
}

// ---------------------------------------------------------------- respiration guidée

/** @type {{ timer: number | null, endAt: number, startedAt: number, anim: Animation | null }} */
const breath = { timer: null, endAt: 0, startedAt: 0, anim: null };

function startBreathing() {
  breatheState.running = true;
  breath.startedAt = Date.now();
  breath.endAt = breath.startedAt + breatheState.minutes * 60000;
  render();
  const phases = PATTERNS[breatheState.pattern].phases;
  const labels = /** @type {Record<string, string>} */ ({ in: 'Inspire', out: 'Expire', hold: 'Retiens', hold2: 'Retiens' });
  let idx = 0;
  const step = () => {
    if (!breatheState.running) return;
    const circle = document.querySelector('[data-breathe-circle]');
    const phaseEl = document.querySelector('[data-breathe-phase]');
    const left = breath.endAt - Date.now();
    if (left <= 0) { stopBreathing(true); return; }
    const [kind, sec] = phases[idx % phases.length];
    if (phaseEl) phaseEl.textContent = labels[kind];
    if (circle instanceof HTMLElement) {
      const scale = kind === 'in' ? [0.55, 1] : kind === 'out' ? [1, 0.55] : kind === 'hold' ? [1, 1] : [0.55, 0.55];
      breath.anim = circle.animate([{ transform: `scale(${scale[0]})` }, { transform: `scale(${scale[1]})` }], {
        duration: reducedMotion.matches ? 1 : sec * 1000, easing: 'ease-in-out', fill: 'forwards',
      });
    }
    haptic(8);
    idx++;
    breath.timer = window.setTimeout(step, sec * 1000);
  };
  step();
  const tick = () => {
    if (!breatheState.running) return;
    const left = Math.max(0, breath.endAt - Date.now());
    const el = document.querySelector('[data-breathe-time]');
    if (el) el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    setTimeout(tick, 250);
  };
  tick();
}

/** @param {boolean} completed */
async function stopBreathing(completed) {
  if (breath.timer !== null) clearTimeout(breath.timer);
  breath.timer = null;
  breath.anim?.cancel();
  const durationSec = Math.round((Date.now() - breath.startedAt) / 1000);
  breatheState.running = false;
  if (durationSec >= 60) {
    const session = { id: `b${breath.startedAt.toString(36)}`, start: breath.startedAt, durationSec, pattern: breatheState.pattern };
    await db.put('breathing', session);
    S.breathing.push(session);
    toast(completed ? 'Bravo, séance terminée.' : `Séance enregistrée (${Math.round(durationSec / 60)} min).`);
    await afterProgress(document.querySelector('[data-breathe-circle]'));
  }
  if (currentParts[0] === 'respirer') render();
}

// ---------------------------------------------------------------- export

/** @param {string} name @param {string} content @param {string} type */
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function exportJson() {
  const stores = /** @type {const} */ (['workouts', 'journal', 'daily', 'insights', 'programs', 'sessions', 'messages', 'memory', 'breathing']);
  /** @type {Record<string, unknown>} */
  const out = { exportedAt: new Date().toISOString(), app: 'PULSE', profile: S.profile };
  for (const s of stores) out[s] = await db.getAll(s);
  out.samples = await db.getAll('samples');
  download(`pulse-export-${todayKey()}.json`, JSON.stringify(out), 'application/json');
}

function exportCsv() {
  const cols = ['date', 'recovery', 'zone', 'sleepScore', 'asleepMin', 'needMin', 'debtMin', 'hrv', 'rhr', 'resp', 'tempDelta', 'spo2', 'strain', 'steps', 'workouts'];
  const rows = S.records.map((r) => [r.date, r.recovery, r.zone, r.sleepScore, r.night?.asleepMin ?? '', r.needMin, r.debtMin, r.hrv, r.rhr, r.resp, r.tempDelta, r.spo2, r.strain, r.steps, r.workouts.length]
    .map((v) => (v === null || v === undefined ? '' : String(v))).join(';'));
  download(`pulse-resumes-${todayKey()}.csv`, `${cols.join(';')}\n${rows.join('\n')}\n`, 'text/csv');
}

// ---------------------------------------------------------------- actions (clics)

/** @type {Record<string, (el: HTMLElement) => unknown>} */
const actions = {
  'load-demo': (el) => { if (needsConsent(el)) return loadDemo(); return undefined; },
  'pick-import': (el) => { if (needsConsent(el)) pickImport(); },
  'clear-data': async () => {
    const ok = await confirmDialog('Tout effacer ?', 'Données de santé, programme, conversation, clé API et réglages seront supprimés de cet appareil. C\'est définitif.', 'Tout effacer');
    if (!ok) return;
    if (S.notif.enabled) await disablePush().catch(() => {});
    await db.deleteEverything();
    await loadAll();
    setOnboardingStep(0);
    applyTheme();
    toast('Toutes les données ont été effacées.');
    go('#/aujourdhui');
  },
  'open-journal': (el) => openSheet({ title: 'Journal du soir', body: journalForm(el.dataset.date ?? todayKey()), origin: el, onMount: hydrate }),
  'sleep-period': (el) => { setSleepPeriod(el.dataset.value ?? 'week'); render(); },
  quick: (el) => quickQuestion(/** @type {'tired' | 'train' | 'week' | 'sleep'} */ (el.dataset.kind)),
  'chat-stop': () => chatAbort?.abort(),
  'chat-clear': async () => {
    if (!(await confirmDialog('Effacer la conversation ?', 'Ton coach garde sa mémoire (profil), mais l\'historique du chat sera supprimé.', 'Effacer'))) return;
    await db.replaceAll('messages', []);
    S.messages = [];
    render();
  },
  'regen-brief': async () => {
    S.insights.delete(`brief:${todayKey()}`);
    await db.remove('insights', `brief:${todayKey()}`);
    closeSheet();
    toast('Ton coach rédige un nouveau brief…');
    await aiBackgroundTasks();
  },
  'set-theme': async (el) => { await saveProfile({ theme: /** @type {'dark' | 'light' | 'auto'} */ (el.dataset.value) }); applyTheme(); render(); },
  'set-units': async (el) => { await saveProfile({ units: /** @type {'metric' | 'imperial'} */ (el.dataset.value) }); render(); },
  'session-version': async (el) => {
    const s = storedSession(el.dataset.date ?? '');
    if (!s) return;
    const v = /** @type {'normal' | 'light' | 'rest'} */ (el.dataset.value);
    await saveSession({ ...s, version: v, locked: true, adjustNote: v === 'light' ? 'Version allégée choisie.' : v === 'rest' ? 'Repos actif choisi pour aujourd\'hui.' : 'Séance prévue maintenue.' });
    render();
  },
  'session-undo': async (el) => {
    const s = storedSession(el.dataset.date ?? '');
    if (!s) return;
    await saveSession({ ...s, done: false, rpe: null, doneAt: null });
    refreshDerived();
    render();
  },
  'stop-program': async (el) => {
    if (!(await confirmDialog('Arrêter ce programme ?', 'Les séances déjà faites restent dans ton historique.', 'Arrêter'))) return;
    const p = S.programs.find((x) => x.id === el.dataset.id);
    if (p) await db.put('programs', { ...p, status: 'archived' });
    S.programs = /** @type {import('./program/generator.js').Program[]} */ (await db.getAll('programs'));
    refreshDerived();
    go('#/sport');
  },
  'remove-key': async () => {
    await saveMeta('apiKey', null);
    S.apiKey = null;
    toast('Clé API retirée de cet appareil.');
    render();
  },
  'memory-delete': async (el) => {
    const key = el.dataset.key ?? '';
    await db.remove('memory', key);
    S.memory = S.memory.filter((m) => m.key !== key);
    render();
  },
  'export-json': () => exportJson(),
  'export-csv': () => exportCsv(),
  print: () => window.print(),
  'notif-test': async () => { try { await testPush(); toast('Notification de test envoyée.'); } catch (err) { toast(err instanceof Error ? err.message : 'Échec'); } },
  'breathe-pattern': (el) => { breatheState.pattern = /** @type {import('./views/breathe.js').PatternKey} */ (el.dataset.value); render(); },
  'breathe-minutes': (el) => { breatheState.minutes = Number(el.dataset.value) || 2; render(); },
  'breathe-toggle': () => (breatheState.running ? stopBreathing(false) : startBreathing()),
  'ob-back': () => { collectOnboarding(); setOnboardingStep(onboardingStep - 1); renderOverlay(); },
  'ob-skip': () => { setOnboardingStep(onboardingStep + 1); renderOverlay(); },
};

/** @type {Record<string, (el: HTMLInputElement | HTMLSelectElement) => unknown>} */
const changes = {
  'notif-enable': async (el) => {
    const on = /** @type {HTMLInputElement} */ (el).checked;
    try {
      if (on) { await enablePush(); toast('Notifications activées.'); } else { await disablePush(); }
    } catch (err) {
      /** @type {HTMLInputElement} */ (el).checked = false;
      toast(err instanceof Error ? err.message : 'Échec');
    }
    render();
  },
  'notif-bedtime': async (el) => {
    S.notif.bedtime = /** @type {HTMLInputElement} */ (el).checked;
    if (S.notif.bedtime && !S.notif.enabled) toast('Active aussi les notifications dans Profil → Notifications.');
    await saveMeta('notif', S.notif);
    await syncReminders();
  },
  'notif-challenge': async (el) => { S.notif.challenge = /** @type {HTMLInputElement} */ (el).checked; await saveMeta('notif', S.notif); await syncReminders(); },
  'notif-brief-time': async (el) => { S.notif.briefTime = el.value || '07:30'; await saveMeta('notif', S.notif); await syncReminders(); },
  'ai-consent': async (el) => {
    await saveProfile({ aiConsent: /** @type {HTMLInputElement} */ (el).checked });
    toast(S.profile.aiConsent ? 'Coach IA autorisé.' : 'Plus rien n\'est envoyé à l\'IA.');
    render();
    void aiBackgroundTasks();
  },
  'coach-style': async (el) => { await saveProfile({ coachStyle: /** @type {import('./data/profile.js').CoachStyle} */ (el.value) }); toast('Personnalité du coach mise à jour.'); },
  'report-month': (el) => go(`#/rapport/${el.value}`),
};

// ---------------------------------------------------------------- formulaires

/** @param {FormData} fd @param {string} name */
const str = (fd, name) => String(fd.get(name) ?? '').trim();
/** @param {FormData} fd @param {string} name */
const numOrNull = (fd, name) => {
  const v = Number(str(fd, name).replace(',', '.'));
  return str(fd, name) && Number.isFinite(v) ? v : null;
};

function collectOnboarding() {
  const form = /** @type {HTMLFormElement | null} */ (document.querySelector('[data-form="onboarding"]'));
  if (!form) return Promise.resolve();
  const fd = new FormData(form);
  /** @type {Partial<import('./data/profile.js').Profile>} */
  const patch = {};
  if (onboardingStep === 0) patch.goals = /** @type {import('./data/profile.js').Goal[]} */ (fd.getAll('goals').map(String));
  if (onboardingStep === 1) {
    patch.sports = /** @type {import('./data/profile.js').Sport[]} */ (fd.getAll('sports').map(String));
    patch.firstName = str(fd, 'firstName').slice(0, 30);
    const by = numOrNull(fd, 'birthYear');
    patch.birthYear = by && by > 1900 && by < new Date().getFullYear() - 5 ? Math.round(by) : null;
    patch.sex = /** @type {'f' | 'm' | 'x' | null} */ (str(fd, 'sex') || null);
    patch.wakeTime = str(fd, 'wakeTime') || '07:00';
  }
  if (onboardingStep === 2) patch.healthConsent = fd.get('healthConsent') === 'on';
  if (onboardingStep === 3) {
    patch.coachStyle = /** @type {import('./data/profile.js').CoachStyle} */ (str(fd, 'coachStyle') || 'bienveillant');
    patch.aiConsent = fd.get('aiConsent') === 'on';
  }
  return saveProfile(patch);
}

/** @type {Record<string, (form: HTMLFormElement, fd: FormData) => unknown>} */
const forms = {
  journal: async (form, fd) => {
    const entry = {
      date: form.dataset.date ?? todayKey(),
      lateCaffeine: fd.get('lateCaffeine') === 'on',
      alcohol: Math.max(0, Math.min(20, Math.round(Number(fd.get('alcohol')) || 0))),
      screens: fd.get('screens') === 'on',
      lateMeal: fd.get('lateMeal') === 'on',
      stress: Math.max(1, Math.min(5, Number(fd.get('stress')) || 2)),
      notes: str(fd, 'notes').slice(0, 140),
    };
    if (!validateJournalEntry(entry).ok) { toast('Journal invalide.'); return; }
    await db.putJournal([entry]);
    S.journal = [...S.journal.filter((j) => j.date !== entry.date), entry].sort((a, b) => (a.date < b.date ? -1 : 1));
    const btn = form.querySelector('button[type="submit"]');
    closeSheet();
    await afterProgress(btn);
    toast('Journal enregistré.');
    render();
  },
  'session-done': async (form, fd) => {
    const s = storedSession(form.dataset.date ?? '');
    if (!s) return;
    const anchor = form.querySelector('button[type="submit"]');
    await saveSession({ ...s, done: true, rpe: Number(fd.get('rpe')) || null, doneAt: Date.now() });
    await afterProgress(anchor);
    haptic([10, 30, 10]);
    render();
  },
  'create-program': async (_form, fd) => {
    const days = fd.getAll('days').map(Number).filter((d) => d >= 1 && d <= 7);
    if (!days.length) { toast('Choisis au moins un jour d\'entraînement.'); return; }
    /** @type {Questionnaire} */
    const q = {
      goal: /** @type {Questionnaire['goal']} */ (str(fd, 'goal') || 'general'),
      level: /** @type {Questionnaire['level']} */ (str(fd, 'level') || 'beginner'),
      days,
      equipment: /** @type {Questionnaire['equipment']} */ (str(fd, 'equipment') || 'none'),
      injuries: /** @type {Questionnaire['injuries']} */ (fd.getAll('injuries').map(String)),
      weeks: Number(fd.get('weeks')) || 8,
      cardio: /** @type {Questionnaire['cardio']} */ (str(fd, 'cardio') || 'run'),
    };
    const p = await installProgram(q);
    toast(`Programme créé : ${p.title}`);
    go('#/sport/programme');
  },
  'profile-info': async (_form, fd) => {
    const before = JSON.stringify([S.profile.birthYear, S.profile.hrMax, S.profile.trackCycle]);
    const by = numOrNull(fd, 'birthYear');
    await saveProfile({
      firstName: str(fd, 'firstName').slice(0, 30),
      birthYear: by && by > 1900 && by < new Date().getFullYear() - 5 ? Math.round(by) : null,
      sex: /** @type {'f' | 'm' | 'x' | null} */ (str(fd, 'sex') || null),
      heightCm: numOrNull(fd, 'heightCm'),
      weightKg: numOrNull(fd, 'weightKg'),
      hrMax: (() => { const v = numOrNull(fd, 'hrMax'); return v && v >= 120 && v <= 230 ? Math.round(v) : null; })(),
      wakeTime: str(fd, 'wakeTime') || '07:00',
      trackCycle: fd.has('trackCycle') ? str(fd, 'trackCycle') === '1' : S.profile.trackCycle,
    });
    if (before !== JSON.stringify([S.profile.birthYear, S.profile.hrMax, S.profile.trackCycle]) && S.data.hasSamples) {
      toast('Recalcul de tes scores…');
      await recompute();
      await loadAll();
    }
    await syncReminders();
    toast('Profil enregistré.');
    render();
  },
  'profile-goals': async (_form, fd) => {
    await saveProfile({
      goals: /** @type {import('./data/profile.js').Goal[]} */ (fd.getAll('goals').map(String)),
      sports: /** @type {import('./data/profile.js').Sport[]} */ (fd.getAll('sports').map(String)),
    });
    toast('Objectifs enregistrés.');
  },
  'api-key': async (form, fd) => {
    const key = str(fd, 'apiKey');
    if (!key) { toast('Colle ta clé API.'); return; }
    const btn = /** @type {HTMLButtonElement | null} */ (form.querySelector('button[type="submit"]'));
    if (btn) btn.disabled = true;
    const { testKey } = await import('./coach/api.js');
    const res = await testKey(key);
    if (btn) btn.disabled = false;
    if (!res.ok) { toast(res.message); return; }
    await saveMeta('apiKey', key);
    S.apiKey = key;
    toast(S.profile.aiConsent ? 'Clé vérifiée : coach IA actif.' : 'Clé vérifiée. Active le consentement ci-dessous.');
    render();
    void aiBackgroundTasks();
  },
  'memory-add': async (form, fd) => {
    const key = str(fd, 'key').slice(0, 60);
    const value = str(fd, 'value').slice(0, 300);
    if (!key || !value) return;
    await toolHost.saveMemory(key, value);
    form.reset();
    render();
  },
  chat: async (form, fd) => {
    const text = str(fd, 'text');
    form.reset();
    await sendChat(text);
  },
  'paste-shortcut': async (_form, fd) => importShortcut(str(fd, 'payload')),
  onboarding: async (form, fd) => {
    if (onboardingStep === 3) {
      const key = str(fd, 'apiKey');
      if (key) {
        const { testKey } = await import('./coach/api.js');
        const res = await testKey(key);
        if (!res.ok) { toast(res.message); return; }
        await saveMeta('apiKey', key);
        S.apiKey = key;
      }
    }
    await collectOnboarding();
    if (Number(form.dataset.obStep) === 4) {
      S.onboarded = true;
      await saveMeta('onboarded', true);
      renderOverlay();
      $('fab-coach').hidden = currentTab === 'coach';
      void aiBackgroundTasks();
      void syncReminders();
      render();
      return;
    }
    setOnboardingStep(onboardingStep + 1);
    renderOverlay();
  },
};

// ---------------------------------------------------------------- écouteurs globaux

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  // Hypnogramme : toucher une phase affiche son heure et sa durée.
  const seg = target.closest('[data-hypnogram] rect[data-stage]');
  if (seg instanceof SVGElement) {
    const fig = seg.closest('[data-hypnogram]');
    const cap = fig?.querySelector('[data-hyp-caption]');
    const from = new Date(Number(seg.dataset.from));
    if (cap) cap.textContent = `${seg.dataset.stage} · ${from.getHours()} h ${String(from.getMinutes()).padStart(2, '0')} · ${seg.dataset.mins} min`;
    fig?.querySelectorAll('rect.active').forEach((r) => r.classList.remove('active'));
    seg.classList.add('active');
    return;
  }
  // Pas à pas (journal : nombre de verres)
  const stepBtn = target.closest('[data-step]');
  if (stepBtn instanceof HTMLElement) {
    const box = stepBtn.closest('[data-stepper]');
    const input = /** @type {HTMLInputElement | null} */ (box?.querySelector('input[type="hidden"]'));
    const out = box?.querySelector('output');
    if (input && out) {
      input.value = String(Math.max(0, Math.min(20, Number(input.value) + Number(stepBtn.dataset.step))));
      out.textContent = input.value;
    }
    return;
  }
  // Anneaux : détail de la récupération / de l'effort, onglet sommeil
  const ring = target.closest('[data-detail-rings] .ring');
  if (ring instanceof HTMLElement) {
    if (ring.classList.contains('sleep')) { go('#/sommeil'); return; }
    const d = todayDetail(ring.classList.contains('strain') ? 'strain' : 'recovery');
    if (d) openSheet({ ...d, origin: ring, onMount: hydrate });
    return;
  }
  const detailEl = target.closest('[data-detail]');
  if (detailEl instanceof HTMLElement && !target.closest('a, [data-action]')) {
    const key = detailEl.dataset.detail ?? '';
    const d = todayDetail(key) ?? sleepDetail(key) ?? sportDetail(key, detailEl);
    if (d) openSheet({ ...d, origin: detailEl, onMount: hydrate });
    return;
  }
  const actionEl = target.closest('[data-action]');
  if (actionEl instanceof HTMLElement && !(actionEl instanceof HTMLButtonElement && actionEl.disabled)) {
    const fn = actions[actionEl.dataset.action ?? ''];
    if (fn) {
      event.preventDefault();
      Promise.resolve(fn(actionEl)).catch((err) => { console.error(err); toast('Une erreur est survenue.'); });
    }
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const fn = forms[form.dataset.form ?? ''];
  if (!fn) return;
  event.preventDefault();
  Promise.resolve(fn(form, new FormData(form))).catch((err) => { console.error(err); toast('Une erreur est survenue.'); });
});

document.addEventListener('change', (event) => {
  const el = event.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
  const fn = changes[el.dataset.change ?? ''];
  if (fn) Promise.resolve(fn(el)).catch((err) => { console.error(err); toast('Une erreur est survenue.'); });
});

document.addEventListener('input', (event) => {
  const el = event.target;
  if (el instanceof HTMLInputElement && el.dataset.rangeOut) {
    const out = el.closest('form')?.querySelector(`[data-out="${el.dataset.rangeOut}"]`);
    if (out) out.textContent = el.value;
  }
  if (el instanceof HTMLTextAreaElement && el.name === 'text') autosize(el);
});

document.addEventListener('keydown', (event) => {
  // Entrée envoie le message (Maj+Entrée = nouvelle ligne)
  const el = event.target;
  if (el instanceof HTMLTextAreaElement && el.name === 'text' && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    el.form?.requestSubmit();
  }
});

$('file-input').addEventListener('change', () => {
  const file = /** @type {HTMLInputElement} */ ($('file-input')).files?.[0];
  if (file) void runImport(file);
});

window.addEventListener('hashchange', async () => {
  if (await handleUrlImport()) return;
  route();
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------------------------------------------------------------- démarrage

function decorateChrome() {
  document.querySelectorAll('.tabbar a').forEach((node) => {
    const a = /** @type {HTMLElement} */ (node);
    a.insertAdjacentHTML('afterbegin', icon(a.dataset.icon ?? '', { size: 24 }));
  });
  $('fab-coach').innerHTML = `${icon('sparkles', { size: 20 })}<span>Coach</span>`;
}

async function boot() {
  decorateChrome();
  route();
  try {
    await loadAll();
    if (S.progress && S.lastSeenLevel === null) {
      S.lastSeenLevel = S.progress.level;
      S.seenBadges = S.progress.badges.filter((b) => b.earnedAt).map((b) => b.code);
      await saveMeta('lastSeenLevel', S.lastSeenLevel);
      await saveMeta('seenBadges', S.seenBadges);
    }
    // Utilisateur de la première version : données déjà là, on passe l'onboarding au début.
    if (!S.onboarded && S.records.length) setOnboardingStep(0);
  } catch (err) {
    console.error(err);
    S.loaded = true;
    S.onboarded = true;
    toast('Le stockage local est indisponible (navigation privée ?).');
  }
  applyTheme();
  if (!(await handleUrlImport())) route();
  void aiBackgroundTasks();
  void syncReminders();
}

void boot();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker non enregistré', err));
}


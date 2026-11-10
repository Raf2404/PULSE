// @ts-check
/**
 * PULSE — coquille de l'app : navigation par onglets, écrans, mode démo, réglages des données.
 * Phase 0 : les scores ne sont pas encore calculés (Phase 1) ; l'accueil montre l'état des données.
 */
import { icon } from './ui/icons.js';
import { ringsHTML, animateRings } from './ui/rings.js';
import * as db from './data/db.js';
import { summarizeLastNight, formatDuration } from './data/summary.js';

/** @typedef {'aujourdhui' | 'sommeil' | 'sport' | 'coach' | 'profil'} Tab */
/** @typedef {import('./data/summary.js').NightSummary} NightSummary */

const TABS = /** @type {const} */ (['aujourdhui', 'sommeil', 'sport', 'coach', 'profil']);
const DEFAULT_TAB = 'aujourdhui';
const DAY = 24 * 3600 * 1000;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const nf = new Intl.NumberFormat('fr-FR');
const dateLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dateShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * État chargé depuis le stockage local.
 * @type {{ loaded: boolean, counts: Awaited<ReturnType<typeof db.counts>> | null,
 *   range: { first: number, last: number } | null, mode: string | null, lastNight: NightSummary | null,
 *   busy: boolean }}
 */
const state = { loaded: false, counts: null, range: null, mode: null, lastNight: null, busy: false };

/** @type {Tab | null} */
let currentTab = null;

// ---------------------------------------------------------------- utilitaires

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Majuscule initiale seulement (« Mardi 10 novembre »). @param {string} text */
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** @param {unknown} v */
const isTab = (v) => typeof v === 'string' && /** @type {readonly string[]} */ (TABS).includes(v);

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || /** @type {Navigator & { standalone?: boolean }} */ (navigator).standalone === true;
}

/** Affiche un message éphémère en haut de l'écran. @param {string} text */
function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

/**
 * Boîte de confirmation (élément <dialog> natif).
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
    const finish = (v) => { dialog.close(); cleanup(); resolve(v); };
    const ok = () => finish(true);
    const cancel = () => finish(false);
    const onClose = () => { cleanup(); resolve(false); };
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

/** Applique les rangs d'apparition en cascade (--i) via le CSSOM. @param {HTMLElement} root */
function applyStagger(root) {
  let auto = 0;
  root.querySelectorAll('.reveal').forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    el.style.setProperty('--i', el.dataset.i ?? String(auto));
    auto++;
  });
}

/**
 * En-tête d'écran.
 * @param {Tab} tab @param {string} title @param {string} [eyebrow]
 */
function header(tab, title, eyebrow = '') {
  return `<header class="screen-header">
    <div>
      ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
      <h1 id="t-${tab}">${title}</h1>
    </div>
    ${state.mode === 'demo' ? `<span class="badge demo">${icon('flask-conical', { size: 14 })}Démo</span>` : ''}
  </header>`;
}

/**
 * Carte d'état vide.
 * @param {{ iconName: string, tone?: string, title: string, text: string, tag?: string, extra?: string }} o
 */
function emptyCard(o) {
  return `<div class="card empty reveal">
    <div class="card-icon ${o.tone ?? ''}">${icon(o.iconName, { size: 26 })}</div>
    <h2>${o.title}</h2>
    <p>${o.text}</p>
    ${o.tag ? `<span class="badge">${icon('hourglass', { size: 13 })}${o.tag}</span>` : ''}
    ${o.extra ?? ''}
  </div>`;
}

function hasData() {
  return (state.counts?.samples ?? 0) > 0;
}

/** Boutons pour obtenir des données (accueil et profil). */
function dataActions() {
  return `<div class="actions">
    <button class="btn primary" data-action="load-demo" ${state.busy ? 'disabled' : ''}>
      ${icon('flask-conical', { size: 18 })}<span>Essayer avec 90 jours de démo</span><span class="progress"></span>
    </button>
    <button class="btn" disabled>
      ${icon('upload', { size: 18 })}<span>Importer l'export Santé</span><span class="btn-tag">Bientôt</span>
    </button>
  </div>`;
}

// ---------------------------------------------------------------- écrans

/** @type {Record<Tab, () => string>} */
const screens = {
  aujourdhui() {
    const today = capitalize(dateLong.format(new Date()));
    const rings = ringsHTML([
      { kind: 'recovery', label: 'Récupération', value: null, max: 100, suffix: '%' },
      { kind: 'sleep', label: 'Sommeil', value: null, max: 100 },
      { kind: 'strain', label: 'Effort', value: null, max: 21 },
    ]);

    if (!state.loaded) {
      return `${header('aujourdhui', 'Bonjour', today)}${rings}<div class="skeleton"></div>`;
    }

    if (!hasData()) {
      return `${header('aujourdhui', 'Bonjour', today)}
        ${rings}
        <div class="card reveal">
          <div class="card-head"><div class="card-icon green">${icon('activity')}</div><h2>Commence par tes données</h2></div>
          <p>PULSE lit ce que ta montre écrit dans Apple Santé et le transforme en 3 scores chaque matin. Tout reste sur ton téléphone.</p>
          ${dataActions()}
        </div>`;
    }

    const n = state.lastNight;
    const lastNight = n ? `
      <div class="card reveal">
        <div class="card-head"><div class="card-icon sleep">${icon('moon')}</div>
          <div><h2>Dernière nuit</h2><p class="note">${timeFmt.format(n.start)} → ${timeFmt.format(n.end)} · données brutes</p></div>
        </div>
        <div class="metrics">
          <div class="metric"><span class="metric-label">${icon('bed', { size: 14 })}Endormi</span><span class="metric-value">${formatDuration(n.asleepMin)}</span></div>
          <div class="metric"><span class="metric-label">${icon('battery-medium', { size: 14 })}VFC</span><span class="metric-value">${n.hrvAvg === null ? '—' : nf.format(Math.round(n.hrvAvg))}<small>ms</small></span></div>
          <div class="metric"><span class="metric-label">${icon('heart-pulse', { size: 14 })}FC repos</span><span class="metric-value">${n.rhr ?? '—'}<small>bpm</small></span></div>
        </div>
      </div>` : '';

    return `${header('aujourdhui', 'Bonjour', today)}
      ${rings}
      <div class="card reveal">
        <div class="card-head"><div class="card-icon">${icon('hourglass')}</div><h2>Tes scores arrivent bientôt</h2></div>
        <p>Les données sont prêtes. Le calcul de la récupération, du sommeil et de l'effort arrive à la prochaine étape (Phase 1).</p>
      </div>
      ${lastNight}
      ${dataOverviewCard()}`;
  },

  sommeil() {
    return `${header('sommeil', 'Sommeil')}
      ${emptyCard({
        iconName: 'moon', tone: 'sleep', title: 'Ton sommeil, décortiqué',
        text: 'Score en 4 piliers, hypnogramme de la nuit, besoin de sommeil et heure de coucher idéale.',
        tag: 'Arrive en Phase 1',
      })}`;
  },

  sport() {
    return `${header('sport', 'Sport')}
      ${emptyCard({
        iconName: 'dumbbell', tone: 'strain', title: 'Tes séances et ta charge',
        text: 'Historique des séances, zones cardio, charge d\'entraînement et programmes sur mesure.',
        tag: 'Arrive en Phase 1',
      })}`;
  },

  coach() {
    return `${header('coach', 'Coach')}
      ${emptyCard({
        iconName: 'sparkles', tone: 'xp', title: 'Ton coach personnel',
        text: 'Il connaîtra ton historique et répondra en langage simple. Tu colleras ta propre clé API Claude dans le profil : elle restera sur ton téléphone.',
        tag: 'Arrive en Phase 2',
      })}
      <p class="note reveal">Le coach ne pose jamais de diagnostic médical et ne cite que les chiffres de tes données.</p>`;
  },

  profil() {
    const install = standalone() ? '' : `
      <div class="card reveal">
        <div class="card-head"><div class="card-icon">${icon('smartphone')}</div><h2>Installer sur l'iPhone</h2></div>
        <ol class="steps">
          <li>Ouvre ce site dans <strong>Safari</strong>.</li>
          <li>Touche ${icon('share', { size: 15 })} <strong>Partager</strong>.</li>
          <li>Choisis <strong>Sur l'écran d'accueil</strong>.</li>
        </ol>
        <p class="note">Une fois installé, PULSE s'ouvre en plein écran et Safari ne supprime plus tes données.</p>
      </div>`;

    return `${header('profil', 'Profil')}
      <h2 class="section-title reveal">Mes données</h2>
      ${state.loaded ? dataOverviewCard(true) : '<div class="skeleton"></div>'}
      ${install}
      <div class="card reveal">
        <div class="card-head"><div class="card-icon green">${icon('shield-check')}</div><h2>Confidentialité</h2></div>
        <p>Tes données de santé sont stockées uniquement dans ce navigateur, sur cet appareil. Aucun serveur PULSE ne les reçoit.</p>
        <p class="note">PULSE n'est pas un dispositif médical : les scores sont indicatifs et ne remplacent pas l'avis d'un professionnel de santé.</p>
      </div>`;
  },
};

/**
 * Carte « Tes données » : période couverte et volumes, avec les actions.
 * @param {boolean} [withActions]
 */
function dataOverviewCard(withActions = false) {
  if (!hasData() || !state.counts) {
    return `<div class="card reveal">
      <p class="lead">Aucune donnée pour l'instant.</p>
      ${withActions ? dataActions() : ''}
    </div>`;
  }
  const c = state.counts;
  const r = state.range;
  const days = r ? Math.max(1, Math.ceil((r.last - r.first) / DAY)) : 0;
  return `<div class="card reveal">
    <div class="card-head"><div class="card-icon">${icon('database')}</div>
      <div><h2>Tes données</h2><p class="note">${state.mode === 'demo' ? 'Données démo (fictives)' : 'Apple Santé'}</p></div>
    </div>
    <dl class="stat-list">
      ${r ? `<div><dt>Période</dt><dd>${dateShort.format(r.first)} → ${dateShort.format(r.last)}</dd></div>` : ''}
      <div><dt>Jours couverts</dt><dd>${nf.format(days)}</dd></div>
      <div><dt>Mesures</dt><dd>${nf.format(c.samples)}</dd></div>
      <div><dt>Séances</dt><dd>${nf.format(c.workouts)}</dd></div>
      <div><dt>Soirs de journal</dt><dd>${nf.format(c.journal)}</dd></div>
    </dl>
    ${withActions ? `<div class="actions">
      ${state.mode === 'demo' ? `<button class="btn" data-action="load-demo" ${state.busy ? 'disabled' : ''}>${icon('flask-conical', { size: 18 })}<span>Régénérer la démo à aujourd'hui</span><span class="progress"></span></button>` : ''}
      <button class="btn danger" data-action="clear-data" ${state.busy ? 'disabled' : ''}>${icon('trash-2', { size: 18 })}Tout effacer de cet appareil</button>
    </div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- navigation

/** @param {Tab} tab */
function render(tab) {
  const el = $(`screen-${tab}`);
  el.innerHTML = screens[tab]();
  applyStagger(el);
  animateRings(el, reducedMotion.matches);
}

/** @param {Tab} tab */
function show(tab) {
  const previous = currentTab;
  currentTab = tab;
  for (const t of TABS) {
    const el = $(`screen-${t}`);
    el.hidden = t !== tab;
  }
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (/** @type {HTMLElement} */ (a).dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('fab-coach').hidden = tab === 'coach';
  document.title = tab === DEFAULT_TAB ? 'PULSE' : `${labelOf(tab)} · PULSE`;
  render(tab);

  // Changement d'onglet : glissement + fondu (250 ms), simple fondu si mouvement réduit.
  if (previous && previous !== tab) {
    const dir = TABS.indexOf(tab) > TABS.indexOf(previous) ? 1 : -1;
    const frames = reducedMotion.matches
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }];
    $(`screen-${tab}`).animate(frames, { duration: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    window.scrollTo({ top: 0 });
  }
}

/** @param {Tab} tab */
function labelOf(tab) {
  return /** @type {HTMLElement} */ (document.querySelector(`.tabbar a[data-tab="${tab}"]`)).textContent?.trim() ?? '';
}

function route() {
  const name = location.hash.replace(/^#\/?/, '');
  show(isTab(name) ? /** @type {Tab} */ (name) : DEFAULT_TAB);
}

// ---------------------------------------------------------------- données

async function refreshState() {
  const [counts, range, mode] = await Promise.all([db.counts(), db.getSampleRange(), db.getMeta('mode')]);
  state.counts = counts;
  state.range = range;
  state.mode = typeof mode === 'string' ? mode : null;
  state.lastNight = null;
  if (range) {
    const from = range.last - 3 * DAY;
    const to = range.last + DAY;
    const [sleep, hrv, rhr] = await Promise.all([
      db.getSamples('sleep', from, to), db.getSamples('hrv', from, to), db.getSamples('rhr', from, to),
    ]);
    state.lastNight = summarizeLastNight({ sleep, hrv, rhr, now: Date.now() });
  }
  state.loaded = true;
}

/** Met à jour la barre de progression des boutons « démo ». @param {number} ratio */
function setDemoProgress(ratio) {
  document.querySelectorAll('[data-action="load-demo"] .progress').forEach((bar) => {
    /** @type {HTMLElement} */ (bar).style.width = `${Math.round(ratio * 100)}%`;
  });
}

async function loadDemo() {
  if (hasData() && state.mode !== 'demo') {
    const ok = await confirmDialog('Remplacer tes données ?', 'Charger la démo efface les données Apple Santé déjà importées sur cet appareil.', 'Remplacer');
    if (!ok) return;
  }
  state.busy = true;
  document.querySelectorAll('[data-action]').forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = true; });
  setDemoProgress(0.05);
  try {
    const { generateDemo } = await import('./data/demo.js');
    const demo = generateDemo();
    await db.clearHealthData();
    await db.putSamples(demo.samples, { onProgress: (w, t) => setDemoProgress(0.05 + 0.9 * (w / t)) });
    await db.putWorkouts(demo.workouts);
    await db.putJournal(demo.journal);
    await db.setMeta('mode', 'demo');
    await db.setMeta('demoGeneratedAt', Date.now());
    await db.requestPersistence();
    setDemoProgress(1);
    await refreshState();
    toast(`Démo chargée : ${nf.format(demo.samples.length)} mesures sur 90 jours`);
  } catch (err) {
    console.error(err);
    toast('Impossible de charger la démo sur cet appareil.');
  } finally {
    state.busy = false;
    if (currentTab) render(currentTab);
  }
}

async function clearData() {
  const ok = await confirmDialog(
    'Tout effacer ?',
    'Toutes les données de santé et réglages de PULSE seront supprimés de cet appareil. C\'est définitif.',
    'Tout effacer',
  );
  if (!ok) return;
  await db.deleteEverything();
  await refreshState();
  toast('Toutes les données ont été effacées.');
  if (currentTab) render(currentTab);
}

// ---------------------------------------------------------------- démarrage

function decorateChrome() {
  document.querySelectorAll('.tabbar a').forEach((node) => {
    const a = /** @type {HTMLElement} */ (node);
    a.insertAdjacentHTML('afterbegin', icon(a.dataset.icon ?? '', { size: 24 }));
  });
  $('fab-coach').innerHTML = `${icon('sparkles', { size: 20 })}<span>Coach</span>`;
}

document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('[data-action]') : null);
  if (!target || /** @type {HTMLButtonElement} */ (target).disabled) return;
  const action = target.dataset.action;
  if (action === 'load-demo') void loadDemo();
  else if (action === 'clear-data') void clearData();
});

window.addEventListener('hashchange', route);

decorateChrome();
route();
refreshState()
  .then(() => { if (currentTab) render(currentTab); })
  .catch((err) => {
    console.error(err);
    state.loaded = true;
    toast('Le stockage local est indisponible (navigation privée ?).');
    if (currentTab) render(currentTab);
  });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker non enregistré', err));
}

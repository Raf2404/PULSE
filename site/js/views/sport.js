// @ts-check
/** Écran « Sport » : séances, charge, zones, records, programme adaptatif, bibliothèque. */
import { icon } from '../ui/icons.js';
import { header, cardHead, emptyCard, sectionTitle, chips } from '../ui/components.js';
import { lineChart, zoneBars, strainGauge, barChart } from '../ui/charts.js';
import { esc, num, dur, time, longDate, shortDate, distance, pace, WORKOUT_LABELS, WORKOUT_ICONS, dayLabel } from '../ui/format.js';
import { S, latest, todayKey, activeProgram, sessionOn } from '../state.js';
import { CONFIG } from '../scoring/config.js';
import { zoneFloors } from '../scoring/daily.js';
import { hrMaxOf } from '../data/profile.js';
import { GOAL_LABELS, LEVEL_LABELS } from '../program/generator.js';
import { EXERCISES, EXERCISE_BY_ID } from '../program/exercises.js';
import { trendTitle } from '../coach/rules.js';
import { mean } from '../scoring/stats.js';
import { localDateKey } from '../data/schema.js';

/** @typedef {import('../scoring/daily.js').WorkoutDetail} WorkoutDetail */

function hrRest() {
  return latest()?.baseline.rhr.median ?? 60;
}

function allWorkouts() {
  return S.records.flatMap((r) => r.workouts).sort((a, b) => b.start - a.start);
}

function programCard() {
  const p = activeProgram();
  if (!p) {
    return `<div class="card reveal">
      ${cardHead('list-checks', 'Programme sur mesure', { tone: 'strain', sub: '4 à 12 semaines, séance par séance' })}
      <p>Réponds à 6 questions (objectif, niveau, jours, matériel, blessures) : PULSE construit ton programme et ajuste chaque matin la séance du jour à ta récupération.</p>
      <a class="btn primary" href="#/sport/creer">${icon('plus', { size: 18 })}Créer mon programme</a>
    </div>`;
  }
  const mine = S.sessions.filter((s) => s.programId === p.id);
  const done = mine.filter((s) => s.done).length;
  const today = todayKey();
  const next = mine.find((s) => s.date >= today && !s.done);
  const week = next ? next.week : p.weeks;
  return `<a class="card link-card reveal" href="#/sport/programme">
    ${cardHead('list-checks', p.title, { tone: 'strain', sub: `Semaine ${week}/${p.weeks} · ${done}/${mine.length} séances faites`, right: icon('chevron-right', { size: 20 }) })}
    <div class="pillar-track"><span class="pillar-fill f-strain" data-width="${mine.length ? ((done / mine.length) * 100).toFixed(0) : 0}"></span></div>
    ${next ? `<p>Prochaine séance : <strong>${esc(next.title)}</strong> · ${esc(next.date === today ? 'aujourd\'hui' : longDate(next.date).toLowerCase())}</p>` : '<p>Programme terminé, bravo !</p>'}
  </a>`;
}

function loadCard() {
  const last = S.records.slice(-42);
  const r = latest();
  const acwr = r?.acwr ?? null;
  const [lo, hi] = CONFIG.load.optimal;
  let label = 'Pas encore assez de données (3 semaines)';
  if (acwr !== null) {
    label = acwr > CONFIG.load.risk ? `Charge en hausse rapide (${num(acwr, 2)}) : risque de blessure`
      : acwr > hi ? `Charge soutenue (${num(acwr, 2)}) : reste vigilant`
        : acwr >= lo ? `Zone optimale (${num(acwr, 2)})`
          : `Charge en baisse (${num(acwr, 2)}) : tu te désentraînes un peu`;
  }
  return `<div class="card reveal" data-detail="load">
    ${cardHead('trending-up', 'Charge d\'entraînement', { tone: 'strain', sub: 'Effort moyen 7 j ÷ 28 j' })}
    <p class="lead">${esc(label)}</p>
    ${lineChart({ points: last.map((x) => ({ label: shortDate(x.date), value: x.acwr })), tone: 'strain', title: label, band: [lo, hi], min: 0, max: Math.max(2, ...last.map((x) => x.acwr ?? 0)), format: (v) => num(v, 2) })}
    <p class="note">Bande = zone optimale ${num(lo, 1)}–${num(hi, 1)} · au-dessus de ${num(CONFIG.load.risk, 1)} : risque de blessure · sous ${num(lo, 1)} : désentraînement.</p>
  </div>`;
}

function zonesCard() {
  const max = hrMaxOf(S.profile);
  const rest = hrRest();
  const f = zoneFloors(rest, max);
  const week = S.records.slice(-7);
  const mins = [0, 1, 2, 3, 4].map((i) => week.reduce((a, r) => a + (r.zoneMin[i] ?? 0), 0));
  const labels = f.map((v, i) => `Z${i + 1} ${Math.round(v)}${i < 4 ? `–${Math.round(f[i + 1]) - 1}` : `–${max}`}`);
  return `<div class="card reveal">
    ${cardHead('heart-pulse', 'Tes zones cardio', { tone: 'strain', sub: `FC max ${max} · FC repos ${Math.round(rest)} (méthode Karvonen)` })}
    ${zoneBars(mins, labels)}
    <p class="note">Minutes par zone sur les 7 derniers jours. Z2 = endurance de base, Z4–Z5 = intensité.</p>
  </div>`;
}

/** @param {WorkoutDetail} w */
function workoutRow(w) {
  return `<button type="button" class="list-row" data-detail="workout:${w.start}">
    <span class="tl-icon strain">${icon(WORKOUT_ICONS[w.type] ?? 'activity', { size: 18 })}</span>
    <span class="list-main"><strong>${esc(WORKOUT_LABELS[w.type] ?? w.type)}</strong><span class="note">${esc(dayLabel(localDateKey(w.start)))} · ${time(w.start)} · ${dur(w.durationMin)}${w.distanceKm ? ` · ${distance(w.distanceKm, S.profile.units)}` : ''}</span></span>
    <span class="list-side"><span class="strain-pill">${num(w.strain, 1)}</span><span class="note">${w.avgHr ? `${w.avgHr} bpm` : ''}</span></span>
  </button>`;
}

function historyCard() {
  const list = allWorkouts().slice(0, 15);
  if (!list.length) return emptyCard({ iconName: 'dumbbell', tone: 'strain', title: 'Aucune séance', text: 'Les séances enregistrées par ta montre apparaîtront ici avec leur FC, leurs zones et leur effort.' });
  return `<div class="card reveal">${cardHead('activity', 'Séances récentes', { tone: 'strain', sub: `${allWorkouts().length} séances sur la période` })}
    <div class="list">${list.map(workoutRow).join('')}</div></div>`;
}

function recordsCard() {
  const ws = allWorkouts();
  const runs = ws.filter((w) => w.type === 'running' && w.distanceKm);
  const rides = ws.filter((w) => w.type === 'cycling' && w.distanceKm);
  const best5k = runs.filter((w) => /** @type {number} */ (w.distanceKm) >= 5).sort((a, b) => a.durationMin / /** @type {number} */ (a.distanceKm) - b.durationMin / /** @type {number} */ (b.distanceKm))[0];
  const longestRun = [...runs].sort((a, b) => /** @type {number} */ (b.distanceKm) - /** @type {number} */ (a.distanceKm))[0];
  const longestRide = [...rides].sort((a, b) => /** @type {number} */ (b.distanceKm) - /** @type {number} */ (a.distanceKm))[0];
  const maxDay = [...S.records].sort((a, b) => b.strain - a.strain)[0];
  /** @type {Map<string, number>} */
  const weeks = new Map();
  for (const w of ws) {
    const d = new Date(w.start);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = localDateKey(d);
    weeks.set(k, (weeks.get(k) ?? 0) + w.durationMin);
  }
  const bestWeek = [...weeks.entries()].sort((a, b) => b[1] - a[1])[0];
  const vo2 = S.records.filter((r) => r.vo2max !== null);
  const u = S.profile.units;
  return `<div class="card reveal">
    ${cardHead('award', 'Records et progression', { tone: 'xp' })}
    <dl class="stat-list">
      ${best5k ? `<div><dt>Meilleure allure (≥ 5 km)</dt><dd>${pace(best5k.durationMin, best5k.distanceKm, u)}</dd></div>` : ''}
      ${longestRun ? `<div><dt>Plus longue course</dt><dd>${distance(longestRun.distanceKm, u)}</dd></div>` : ''}
      ${longestRide ? `<div><dt>Plus longue sortie vélo</dt><dd>${distance(longestRide.distanceKm, u)}</dd></div>` : ''}
      ${bestWeek ? `<div><dt>Plus gros volume hebdo</dt><dd>${dur(bestWeek[1])} (sem. du ${shortDate(bestWeek[0])})</dd></div>` : ''}
      ${maxDay ? `<div><dt>Journée la plus intense</dt><dd>effort ${num(maxDay.strain, 1)} (${shortDate(maxDay.date)})</dd></div>` : ''}
    </dl>
    ${vo2.length >= 2 ? `<p class="lead">VO2 max : ${num(vo2.at(-1)?.vo2max ?? null, 1)} mL/kg/min</p>${lineChart({ points: vo2.map((r) => ({ label: shortDate(r.date), value: r.vo2max })), tone: 'strain', title: 'VO2 max', format: (v) => num(v, 1) })}` : ''}
    ${weeklyVolumeChart(weeks)}
  </div>`;
}

/** @param {Map<string, number>} weeks */
function weeklyVolumeChart(weeks) {
  const keys = [...weeks.keys()].sort().slice(-12);
  if (keys.length < 3) return '';
  return `<p class="note">Volume d'entraînement par semaine</p>${barChart({ bars: keys.map((k) => ({ label: shortDate(k), value: /** @type {number} */ (weeks.get(k)) / 60 })), max: Math.max(1, ...keys.map((k) => /** @type {number} */ (weeks.get(k)) / 60)), tone: 'strain', title: 'Volume hebdomadaire', format: (v) => dur(v * 60) })}`;
}

export function renderSport() {
  const head = header('sport', 'Sport');
  if (!S.loaded) return `${head}<div class="skeleton tall"></div>`;
  const r = latest();
  if (!r) return `${head}${emptyCard({ iconName: 'dumbbell', tone: 'strain', title: 'Tes séances et ta charge', text: 'Charge la démo ou importe tes données pour voir tes séances, tes zones cardio et ta charge d\'entraînement.', action: '<a class="btn primary" href="#/aujourdhui">Commencer</a>' })}`;
  return `${head}
    <div class="card reveal" data-detail="strain">
      ${cardHead('gauge', `Effort du jour : ${num(r.strain, 1)}`, { tone: 'strain', sub: r.target ? `Cible ${r.target[0]}–${r.target[1]}` : 'Pas de cible aujourd\'hui' })}
      ${strainGauge({ value: r.strain, target: r.target, point: r.targetPoint })}
    </div>
    ${programCard()}
    ${historyCard()}
    ${loadCard()}
    ${zonesCard()}
    ${recordsCard()}
    <a class="card link-card reveal" href="#/sport/exercices">${cardHead('book-open', 'Bibliothèque d\'exercices', { sub: `${EXERCISES.length} exercices avec consignes`, right: icon('chevron-right', { size: 20 }) })}</a>`;
}

// ---------------------------------------------------------------- sous-pages

export function renderProgram() {
  const head = header('sport', 'Mon programme', { back: '#/sport' });
  const p = activeProgram();
  if (!p) return `${head}${emptyCard({ iconName: 'list-checks', tone: 'strain', title: 'Aucun programme en cours', text: 'Crée ton programme sur mesure en 1 minute.', action: '<a class="btn primary" href="#/sport/creer">Créer mon programme</a>' })}`;
  const mine = S.sessions.filter((s) => s.programId === p.id);
  const today = todayKey();
  const byWeek = new Map();
  for (const s of mine) byWeek.set(s.week, [...(byWeek.get(s.week) ?? []), s]);
  return `${head}
    <div class="card reveal">
      ${cardHead('list-checks', p.title, { tone: 'strain', sub: `${GOAL_LABELS[p.goal]} · ${LEVEL_LABELS[p.level]} · ${p.weeks} semaines · ${p.author === 'coach' ? 'conçu par ton coach IA' : 'généré par PULSE'}` })}
      ${p.notes ? `<p>${esc(p.notes)}</p>` : ''}
      <p class="note">Séances : ${p.templates.map((t) => esc(t.title)).join(' · ')}. Progression chaque semaine, semaine allégée toutes les 4 semaines. Chaque matin, la séance du jour s'adapte à ta récupération.</p>
    </div>
    ${[...byWeek.entries()].map(([w, list]) => `
      <h2 class="section-title reveal">Semaine ${w}${list[0].deload ? ' · allégée' : ''}</h2>
      <div class="card list reveal">${list.map((/** @type {import('../program/generator.js').PlannedSession} */ s) => `
        <a class="list-row" href="#/sport/seance/${s.date}">
          <span class="tl-icon ${s.done ? 'ok' : 'strain'}">${icon(s.done ? 'check' : s.kind === 'cardio' ? 'footprints' : s.kind === 'mobility' ? 'leaf' : 'dumbbell', { size: 16 })}</span>
          <span class="list-main"><strong>${esc(s.title)}</strong><span class="note">${esc(longDate(s.date))}${s.date === today ? ' · aujourd\'hui' : ''}${s.rpe ? ` · ressenti ${s.rpe}/10` : ''}${s.version !== 'normal' ? ` · ${s.version === 'light' ? 'allégée' : 'repos actif'}` : ''}</span></span>
          ${icon('chevron-right', { size: 18 })}
        </a>`).join('')}</div>`).join('')}
    <div class="actions reveal">
      <a class="btn" href="#/sport/creer">${icon('refresh-cw', { size: 16 })}Refaire un programme</a>
      <button class="btn danger" data-action="stop-program" data-id="${esc(p.id)}">Arrêter ce programme</button>
    </div>`;
}

/** @param {string} date */
export function renderSession(date) {
  const head = header('sport', 'Séance', { back: '#/sport/programme', eyebrow: longDate(date) });
  const s = sessionOn(date);
  if (!s) return `${head}${emptyCard({ iconName: 'calendar', title: 'Pas de séance ce jour-là', text: 'Aucune séance du programme n\'est prévue à cette date.' })}`;
  const isToday = date === todayKey();
  const versions = /** @type {[string, string][]} */ ([['normal', 'Prévue'], ['light', 'Allégée'], ['rest', 'Repos actif']]);
  const restBlock = s.version === 'rest'
    ? '<div class="card reveal"><p class="lead">Repos actif aujourd\'hui : 20 à 30 min de marche, de vélo très tranquille ou de mobilité. C\'est aussi de l\'entraînement.</p></div>'
    : '';
  return `${head}
    <div class="card reveal">
      ${cardHead(s.kind === 'cardio' ? 'footprints' : s.kind === 'mobility' ? 'leaf' : 'dumbbell', s.title, { tone: 'strain', sub: `${esc(s.focus)} · semaine ${s.week}${s.deload ? ' (allégée)' : ''}` })}
      ${s.adjustNote ? `<p>${esc(s.adjustNote)}</p>` : ''}
      ${!s.done ? `<div class="segmented" role="tablist" aria-label="Version de la séance">${versions.map(([v, l]) => `<button type="button" role="tab" aria-selected="${s.version === v}" data-action="session-version" data-date="${esc(date)}" data-value="${v}">${l}</button>`).join('')}</div>` : ''}
    </div>
    ${restBlock}
    ${s.version !== 'rest' && s.cardio ? `<div class="card reveal">${cardHead('timer', `${s.cardio.mode === 'run' ? 'Course' : 'Vélo'} · ${s.cardio.durationMin} min`, { tone: 'strain', sub: `Zone ${s.cardio.zone}` })}
      <p>${esc(s.cardio.description)}</p>
      ${s.cardio.intervals ? `<p class="lead">${s.cardio.intervals.reps} × ${s.cardio.intervals.workMin} min en zone ${s.cardio.intervals.zone}, récup ${s.cardio.intervals.restMin} min</p>` : ''}</div>` : ''}
    ${s.version !== 'rest' && s.exercises.length ? `<div class="card reveal">${cardHead('list-checks', 'Exercices', { tone: 'strain', sub: `${s.exercises.length} exercices` })}
      <ol class="exercise-list">${s.exercises.map((e) => `<li>
        <button type="button" class="exercise" data-detail="exercise:${esc(e.exerciseId)}" data-name="${esc(e.name)}" data-cue="${esc(e.cue)}">
          <strong>${esc(e.name)}</strong><span class="ex-meta">${e.sets} × ${esc(e.reps)} · repos ${e.restSec} s</span>
          <span class="note">${esc(e.cue)}</span>
        </button></li>`).join('')}</ol></div>` : ''}
    <div class="card reveal">
      ${s.done
    ? `${cardHead('circle-check', 'Séance faite', { tone: 'green', sub: `Ressenti ${s.rpe ?? '—'}/10` })}<button class="btn" data-action="session-undo" data-date="${esc(date)}">Annuler</button>`
    : `<form data-form="session-done" data-date="${esc(date)}">
          ${cardHead('check', 'Marquer comme faite', { tone: 'green', sub: '+80 XP · note ton ressenti (RPE)' })}
          <div class="rpe" role="radiogroup" aria-label="Ressenti de 1 (très facile) à 10 (maximal)">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<label><input type="radio" name="rpe" value="${n}" ${n === 6 ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
          <p class="note">1 = très facile · 5 = moyen · 8 = dur · 10 = maximal</p>
          <button class="btn primary" type="submit" ${date > todayKey() ? 'disabled' : ''}>${icon('check', { size: 18 })}${isToday ? 'C\'est fait !' : 'Marquer comme faite'}</button>
        </form>`}
    </div>`;
}

export function renderCreator() {
  const head = header('sport', 'Créer mon programme', { back: '#/sport' });
  const q = activeProgram()?.questionnaire;
  const sportsGoal = S.profile.goals.includes('performance') ? 'endurance' : S.profile.goals.includes('weight') ? 'weight' : 'general';
  return `${head}
    <form class="card form reveal" data-form="create-program">
      <fieldset><legend>Ton objectif</legend>${chips({ name: 'goal', options: Object.entries(GOAL_LABELS), selected: [q?.goal ?? sportsGoal] })}</fieldset>
      <fieldset><legend>Ton niveau</legend>${chips({ name: 'level', options: Object.entries(LEVEL_LABELS), selected: [q?.level ?? 'beginner'] })}</fieldset>
      <fieldset><legend>Tes jours d'entraînement</legend>${chips({ name: 'days', multiple: true, options: [['1', 'Lun'], ['2', 'Mar'], ['3', 'Mer'], ['4', 'Jeu'], ['5', 'Ven'], ['6', 'Sam'], ['7', 'Dim']], selected: (q?.days ?? [1, 3, 5]).map(String) })}</fieldset>
      <fieldset><legend>Ton matériel</legend>${chips({ name: 'equipment', options: [['none', 'Aucun'], ['dumbbells', 'Haltères'], ['gym', 'Salle de sport']], selected: [q?.equipment ?? 'none'] })}</fieldset>
      <fieldset><legend>Zones fragiles ou blessures</legend>${chips({ name: 'injuries', multiple: true, options: [['knee', 'Genou'], ['back', 'Dos'], ['shoulder', 'Épaule'], ['wrist', 'Poignet'], ['ankle', 'Cheville']], selected: q?.injuries ?? [] })}</fieldset>
      <fieldset><legend>Cardio préféré</legend>${chips({ name: 'cardio', options: [['run', 'Course'], ['ride', 'Vélo'], ['none', 'Pas de cardio']], selected: [q?.cardio ?? (S.profile.sports.includes('cycling') && !S.profile.sports.includes('running') ? 'ride' : 'run')] })}</fieldset>
      <label class="field"><span class="field-label">Durée : <output data-out="weeks">${q?.weeks ?? 8}</output> semaines</span><input type="range" name="weeks" min="4" max="12" step="1" value="${q?.weeks ?? 8}" data-range-out="weeks"></label>
      <button class="btn primary" type="submit">${icon('sparkles', { size: 18 })}Créer le programme</button>
      <p class="note">Tu peux aussi demander au coach IA : « Crée-moi un programme pour… ». Une blessure exclut les exercices qui sollicitent cette zone ; en cas de douleur, demande l'avis d'un professionnel.</p>
    </form>`;
}

export function renderLibrary() {
  const head = header('sport', 'Exercices', { back: '#/sport' });
  const groups = /** @type {[string, string][]} */ ([['legs', 'Jambes'], ['push', 'Poussée'], ['pull', 'Tirage'], ['core', 'Gainage'], ['full', 'Corps entier'], ['mobility', 'Mobilité']]);
  const eq = { none: 'sans matériel', dumbbells: 'haltères', gym: 'salle' };
  return `${head}${groups.map(([g, label]) => `${sectionTitle(label)}
    <div class="card list reveal">${EXERCISES.filter((e) => e.group === g).map((e) => `
      <button type="button" class="list-row" data-detail="exercise:${e.id}">
        <span class="list-main"><strong>${esc(e.name)}</strong><span class="note">${esc(e.cue)}</span></span>
        <span class="badge">${eq[e.equipment]}</span>
      </button>`).join('')}</div>`).join('')}`;
}

/**
 * @param {string} key
 * @param {HTMLElement | null} origin
 * @returns {{ title: string, body: string } | null}
 */
export function sportDetail(key, origin) {
  if (key.startsWith('workout:')) {
    const start = Number(key.slice(8));
    const w = allWorkouts().find((x) => x.start === start);
    if (!w) return null;
    const total = w.zoneMin.reduce((a, b) => a + b, 0);
    return {
      title: WORKOUT_LABELS[w.type] ?? 'Séance',
      body: `<p class="lead">${esc(longDate(localDateKey(w.start)))} · ${time(w.start)}</p>
        <dl class="stat-list">
          <div><dt>Durée</dt><dd>${dur(w.durationMin)}</dd></div>
          <div><dt>Effort</dt><dd>${num(w.strain, 1)} / 21</dd></div>
          <div><dt>FC moyenne / max</dt><dd>${w.avgHr ?? '—'} / ${w.maxHr ?? '—'} bpm</dd></div>
          ${w.distanceKm ? `<div><dt>Distance</dt><dd>${distance(w.distanceKm, S.profile.units)}</dd></div>` : ''}
          ${w.distanceKm && (w.type === 'running' || w.type === 'walking' || w.type === 'hiking') ? `<div><dt>Allure</dt><dd>${pace(w.durationMin, w.distanceKm, S.profile.units)}</dd></div>` : ''}
          ${w.calories ? `<div><dt>Calories actives</dt><dd>${num(w.calories)} kcal</dd></div>` : ''}
          <div><dt>Source</dt><dd>${esc(w.source)}</dd></div>
        </dl>
        ${total > 0 ? `<p class="note">Minutes par zone cardio</p>${zoneBars(w.zoneMin)}` : '<p class="note">Pas de FC détaillée pour cette séance.</p>'}`,
    };
  }
  if (key.startsWith('exercise:')) {
    const id = key.slice(9);
    const e = EXERCISE_BY_ID.get(id);
    const name = e?.name ?? origin?.dataset.name ?? 'Exercice';
    const cue = e?.cue ?? origin?.dataset.cue ?? '';
    return { title: name, body: `<p class="lead">${esc(cue)}</p>${e?.avoid.length ? `<p class="note">À éviter en cas de fragilité : ${e.avoid.map((a) => ({ knee: 'genou', back: 'dos', shoulder: 'épaule', wrist: 'poignet', ankle: 'cheville' }[a])).join(', ')}.</p>` : ''}<p class="note">Arrête en cas de douleur. Qualité du mouvement d'abord, charge ensuite.</p>` };
  }
  if (key === 'load') {
    const r = latest();
    return {
      title: 'Charge d\'entraînement',
      body: `<p>Le ratio compare ton effort moyen des 7 derniers jours (charge aiguë) à celui des 28 derniers jours (charge chronique). Une montée brutale augmente le risque de blessure ; une baisse prolongée fait perdre la forme.</p>
        <p class="lead">Ratio actuel : ${num(r?.acwr ?? null, 2)}</p>
        <p class="note">Effort moyen 7 j : ${num(mean(S.records.slice(-7).map((x) => x.strain)), 1)} · 28 j : ${num(mean(S.records.slice(-28).map((x) => x.strain)), 1)}</p>
        ${lineChart({ points: S.records.slice(-28).map((x) => ({ label: shortDate(x.date), value: x.strain })), tone: 'strain', title: trendTitle('strain', S.records), min: 0, max: 21, format: (v) => num(v, 1) })}`,
    };
  }
  return null;
}

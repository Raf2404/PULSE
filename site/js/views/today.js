// @ts-check
/** Écran « Aujourd'hui » : 3 anneaux, brief, effort cible, métriques, ma journée, XP, stress. */
import { icon } from '../ui/icons.js';
import { ringsHTML } from '../ui/rings.js';
import { header, cardHead, emptyCard, trendArrow, xpBar, sectionTitle } from '../ui/components.js';
import { strainGauge, sparkline, lineChart, stressChart } from '../ui/charts.js';
import { esc, num, dur, time, longDate, shortDate, zoneLabel, WORKOUT_LABELS, WORKOUT_ICONS } from '../ui/format.js';
import { S, latest, todayKey, sessionOn, recordFor } from '../state.js';
import { briefText, trendTitle } from '../coach/rules.js';
import { mean, trend, round } from '../scoring/stats.js';
import { CONFIG } from '../scoring/config.js';
import { stressBaseline, stressOfDay, stressLevel } from '../scoring/stress.js';
import { localDateKey } from '../data/schema.js';
import { PHASE_LABELS } from '../scoring/cycle.js';

/** @typedef {import('../scoring/scores.js').DayRecord} DayRecord */

const ZONE_COLOR = { green: 'var(--recovery-green)', yellow: 'var(--recovery-yellow)', red: 'var(--recovery-red)' };

/** Définition des cartes métriques. */
export const METRICS = /** @type {const} */ ({
  hrv: { label: 'Batterie nerveuse', tech: 'VFC (SDNN)', unit: 'ms', iconName: 'battery-medium', higher: true, tone: 'recovery', digits: 0,
    get: (/** @type {DayRecord} */ r) => r.hrv,
    explain: 'La variabilité de ta fréquence cardiaque pendant la nuit. Plus elle est haute par rapport à TON habitude, mieux ton système nerveux a récupéré. Apple la mesure en SDNN : on compare toujours à ta propre moyenne, pas à une norme.' },
  rhr: { label: 'FC au repos', tech: 'FC repos nocturne', unit: 'bpm', iconName: 'heart-pulse', higher: false, tone: 'red', digits: 0,
    get: (/** @type {DayRecord} */ r) => r.rhr,
    explain: 'Ta fréquence cardiaque la plus basse pendant le sommeil (moyenne des 20 % de mesures les plus basses). Une hausse durable de plusieurs bpm indique que ton corps travaille plus que d\'habitude (fatigue, alcool, chaleur, stress…).' },
  resp: { label: 'Respiration', tech: 'Fréquence respiratoire', unit: '/min', iconName: 'wind', higher: false, tone: 'sleep', digits: 1,
    get: (/** @type {DayRecord} */ r) => r.resp,
    explain: 'Le nombre de respirations par minute pendant la nuit. Elle varie très peu d\'une nuit à l\'autre : un écart net par rapport à ton habitude est un signal à surveiller.' },
  temp: { label: 'Température', tech: 'Écart au poignet', unit: '°C', iconName: 'thermometer', higher: false, tone: 'yellow', digits: 2,
    get: (/** @type {DayRecord} */ r) => r.tempDelta,
    explain: 'L\'écart de ta température au poignet pendant la nuit par rapport à ta médiane sur 30 jours. Au-delà de ±0,5 °C, la récupération perd 10 points et une alerte s\'affiche.' },
  spo2: { label: 'Oxygène', tech: 'SpO2', unit: '%', iconName: 'droplets', higher: true, tone: 'strain', digits: 0,
    get: (/** @type {DayRecord} */ r) => r.spo2,
    explain: 'La saturation en oxygène du sang mesurée pendant la nuit. Elle reste en général stable ; les montres la mesurent de façon approximative.' },
  steps: { label: 'Pas', tech: 'Pas du jour', unit: '', iconName: 'footprints', higher: true, tone: 'strain', digits: 0,
    get: (/** @type {DayRecord} */ r) => r.steps,
    explain: 'Le nombre de pas de la journée (en gardant la source la plus complète entre l\'iPhone et la montre).' },
});

/** @typedef {keyof typeof METRICS} MetricKey */

/**
 * Valeur moyenne d'une métrique sur les 30 jours précédant le dernier.
 * @param {MetricKey} k
 */
function mean30(k) {
  const m = METRICS[k];
  return mean(S.records.slice(-31, -1).map(m.get).filter((v) => v !== null).map(Number));
}

/** @param {MetricKey} k @param {number | null} v */
function fmtMetric(k, v) {
  if (v === null) return '—';
  if (k === 'temp') return `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), 2)}`;
  return num(v, METRICS[k].digits);
}

/** @param {DayRecord} r */
function ringsFor(r) {
  const calibrating = r.calibration !== 'full';
  return ringsHTML([
    {
      kind: 'recovery', label: 'Récupération', value: r.recovery, max: 100, suffix: '%',
      color: r.zone ? ZONE_COLOR[r.zone] : undefined,
      sub: r.recovery === null ? (r.calibration === 'none' ? 'Calibration' : 'Pas de nuit') : `${zoneLabel(r.zone)}${calibrating ? ' · calibration' : ''}`,
    },
    { kind: 'sleep', label: 'Sommeil', value: r.sleepScore, max: 100, sub: r.night ? dur(r.night.asleepMin) : 'Pas de nuit' },
    { kind: 'strain', label: 'Effort', value: round(r.strain, 1), max: 21, sub: r.target ? `cible ${r.target[0]}–${r.target[1]}` : 'Effort du jour' },
  ]);
}

/** Brief du matin : texte IA du jour s'il existe, sinon texte à règles. */
function briefCard() {
  const today = todayKey();
  const ai = S.insights.get(`brief:${today}`);
  const session = sessionOn(today);
  const text = ai?.text ?? briefText({ records: S.records, session, style: S.profile.coachStyle });
  return `<div class="card brief reveal" data-detail="brief">
    ${cardHead('sparkles', 'Brief du matin', { tone: 'xp', sub: ai ? 'Rédigé par ton coach IA' : 'Calculé par PULSE' })}
    <p class="lead">${esc(text)}</p>
  </div>`;
}

/** @param {DayRecord} r */
function effortCard(r) {
  const point = r.targetPoint;
  const done = r.strain;
  let line;
  if (!r.target) line = 'Pas de cible sans score de récupération : vise un effort modéré.';
  else if (done >= r.target[1]) line = `Cible atteinte (${num(done, 1)}). Le reste de la journée : récupération.`;
  else if (done >= r.target[0]) line = `Tu es dans ta cible (${num(done, 1)}). Bien dosé !`;
  else line = `Fait : ${num(done, 1)} · vise ${point} (${r.target[0]} à ${r.target[1]}).`;
  const msg = r.zone === 'green' ? '« Journée idéale pour pousser »' : r.zone === 'yellow' ? '« Entraîne-toi, mais sans viser de record »' : r.zone === 'red' ? '« Mobilité, marche, repos actif »' : '';
  return `<div class="card reveal" data-detail="strain">
    ${cardHead('gauge', 'Effort cible du jour', { tone: 'strain', sub: msg })}
    ${strainGauge({ value: done, target: r.target, point })}
    <p>${esc(line)}</p>
  </div>`;
}

function sessionCard() {
  const s = sessionOn(todayKey());
  if (!s) return '';
  const badge = s.done ? `<span class="badge ok">${icon('check', { size: 13 })}Faite</span>` : s.version === 'light' ? '<span class="badge warn">Version allégée</span>' : s.version === 'rest' ? '<span class="badge warn">Repos actif</span>' : '';
  const what = s.cardio ? `${s.cardio.durationMin} min · zone ${s.cardio.zone}` : `${s.exercises.length} exercices`;
  return `<a class="card link-card reveal" href="#/sport/seance/${s.date}">
    ${cardHead(s.kind === 'cardio' ? 'footprints' : s.kind === 'mobility' ? 'leaf' : 'dumbbell', `Séance du jour : ${s.title}`, { tone: 'strain', sub: `${esc(what)} · semaine ${s.week}${s.deload ? ' (allégée)' : ''}`, right: icon('chevron-right', { size: 20 }) })}
    ${badge}
    ${s.adjustNote && !s.done ? `<p>${esc(s.adjustNote)}</p>` : ''}
  </a>`;
}

/** @param {DayRecord} r */
function metricCards(r) {
  const keys = /** @type {MetricKey[]} */ (Object.keys(METRICS));
  const cards = keys.map((k) => {
    const m = METRICS[k];
    const v = m.get(r);
    const ref = mean30(k);
    const t = k === 'temp' ? (v === null ? null : Math.abs(v) < 0.15 ? 'flat' : v > 0 ? 'up' : 'down') : trend(v, ref, k === 'steps' ? 0.1 : 0.03);
    const spark = sparkline(S.records.slice(-14).map(m.get), m.tone);
    return `<button type="button" class="metric-card" data-detail="metric:${k}">
      <span class="metric-label">${icon(m.iconName, { size: 14 })}${esc(m.label)}</span>
      <span class="metric-value">${fmtMetric(k, v)}<small>${m.unit}</small>${trendArrow(/** @type {'up' | 'down' | 'flat' | null} */ (t), m.higher)}</span>
      <span class="note">moy. 30 j : ${ref === null ? '—' : fmtMetric(k, ref)}</span>
      ${spark}
    </button>`;
  }).join('');
  return `<div class="metric-scroller reveal" role="list" aria-label="Métriques clés">${cards}</div>`;
}

/** @param {DayRecord} r */
function timelineCard(r) {
  /** @type {{ t: number, iconName: string, title: string, sub: string, tone: string }[]} */
  const items = [];
  if (r.night) items.push({ t: r.night.end, iconName: 'moon', title: `Nuit : ${dur(r.night.asleepMin)}`, sub: `${time(r.night.start)} → ${time(r.night.end)}`, tone: 'sleep' });
  for (const w of r.workouts) items.push({ t: w.start, iconName: WORKOUT_ICONS[w.type] ?? 'activity', title: `${WORKOUT_LABELS[w.type] ?? w.type} · effort ${num(w.strain, 1)}`, sub: `${time(w.start)} · ${dur(w.durationMin)}${w.avgHr ? ` · ${w.avgHr} bpm moy.` : ''}`, tone: 'strain' });
  for (const b of S.breathing.filter((x) => localDateKey(x.start) === r.date)) items.push({ t: b.start, iconName: 'wind', title: 'Respiration guidée', sub: `${time(b.start)} · ${Math.round(b.durationSec / 60)} min`, tone: 'xp' });
  const steps = r.steps ? `<p class="note">${icon('footprints', { size: 13 })} ${num(r.steps)} pas aujourd'hui</p>` : '';
  if (!items.length) return '';
  items.sort((a, b) => a.t - b.t);
  return `<div class="card reveal">
    ${cardHead('calendar', 'Ma journée', { sub: r.date === todayKey() ? 'Aujourd\'hui' : longDate(r.date) })}
    <ol class="timeline">${items.map((i) => `<li><span class="tl-icon ${i.tone}">${icon(i.iconName, { size: 16 })}</span><span><strong>${esc(i.title)}</strong><span class="note">${esc(i.sub)}</span></span></li>`).join('')}</ol>
    ${steps}
  </div>`;
}

function xpCard() {
  const p = S.progress;
  if (!p) return '';
  const today = todayKey();
  const todayXp = p.events.filter((e) => e.date === today).reduce((a, e) => a + e.points, 0);
  const c = p.challenge;
  return `<a class="card link-card xp-card reveal" href="#/profil/progression">
    <div class="xp-head"><span class="level-badge">${p.level}</span><div><strong>Niveau ${p.level} · ${esc(p.rank)}</strong><span class="note">${num(p.xpTotal)} XP · ${todayXp ? `+${todayXp} XP aujourd'hui` : 'aucun XP encore aujourd\'hui'}</span></div>${icon('chevron-right', { size: 20 })}</div>
    ${xpBar(p.ratio, `Niveau ${p.level} : ${Math.round(p.ratio * 100)} %`)}
    <div class="xp-meta">
      <span>${icon('flame', { size: 14 })} Série : ${p.streaks.regularSleep.current} j${p.streaks.regularSleep.jokerAvailable ? ' · joker dispo' : ''}</span>
      ${c ? `<span>${icon('target', { size: 14 })} ${c.progress}/${c.target}</span>` : ''}
    </div>
    ${c ? `<p class="note">${esc(c.title)}</p>` : ''}
  </a>`;
}

/** @param {DayRecord} r */
function stressCard(r) {
  const base = stressBaseline(S.records, r.date);
  const s = stressOfDay(r, base);
  if (!base || !s.hours.length) return '';
  const lvl = stressLevel(s.average);
  return `<div class="card reveal" data-detail="stress">
    ${cardHead('brain', `Stress : ${lvl?.label ?? '—'}`, { tone: 'xp', sub: `Moyenne ${s.average ?? '—'} / 3 sur les heures calmes` })}
    ${stressChart(s.hours, `Stress de la journée : ${lvl?.label ?? 'inconnu'}`)}
    <a class="btn small" href="#/respirer">${icon('wind', { size: 16 })}Respirer 2 minutes</a>
  </div>`;
}

function journalPrompt() {
  const now = new Date();
  const today = todayKey();
  if (now.getHours() < 19 || S.journal.some((j) => j.date === today)) return '';
  return `<button type="button" class="card link-card reveal" data-action="open-journal" data-date="${today}">
    ${cardHead('pencil', 'Journal du soir', { tone: 'sleep', sub: '10 secondes · +10 XP', right: icon('chevron-right', { size: 20 }) })}
  </button>`;
}

/** @param {DayRecord} r */
function alertCard(r) {
  if (!r.alert) return '';
  return `<div class="card alert reveal" role="status">
    ${cardHead('shield-alert', r.alert.kind === 'strain' ? 'Signal inhabituel' : 'Charge en hausse rapide', { tone: 'warn' })}
    <p class="lead">${esc(r.alert.text)}</p>
    <p class="note">Indication sans valeur médicale. Si quelque chose t'inquiète, parles-en à un médecin.</p>
  </div>`;
}

export function renderToday() {
  const greeting = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';
  const name = S.profile.firstName ? ` ${S.profile.firstName}` : '';
  const head = header('aujourdhui', `${greeting}${name}`, { eyebrow: longDate(todayKey()) });
  if (!S.loaded) return `${head}<div class="skeleton tall"></div><div class="skeleton"></div>`;
  const r = latest();
  if (!r) {
    return `${head}
      ${ringsHTML([
        { kind: 'recovery', label: 'Récupération', value: null, max: 100, suffix: '%' },
        { kind: 'sleep', label: 'Sommeil', value: null, max: 100 },
        { kind: 'strain', label: 'Effort', value: null, max: 21 },
      ])}
      ${emptyCard({
        iconName: 'activity', tone: 'green', title: 'Commence par tes données',
        text: 'PULSE lit ce que ta montre écrit dans Apple Santé et le transforme en 3 scores chaque matin. Tout reste sur ton téléphone.',
        action: `<div class="actions"><button class="btn primary" data-action="load-demo">${icon('flask-conical', { size: 18 })}<span>Essayer avec 90 jours de démo</span><span class="progress"></span></button>
          <button class="btn" data-action="pick-import">${icon('upload', { size: 18 })}<span>Importer mon export Apple Santé</span></button></div>`,
      })}`;
  }
  const stale = r.date !== todayKey()
    ? `<div class="banner reveal">${icon('info', { size: 16 })}<span>Dernières données : ${esc(longDate(r.date).toLowerCase())}. <button class="link" data-action="pick-import">Importer un export récent</button></span></div>`
    : '';
  const calib = r.calibration === 'none'
    ? `<p class="note center reveal">Calibration : encore ${Math.max(1, CONFIG.baseline.minNights - r.nightsInBaseline)} nuit(s) avant ton premier score de récupération.</p>`
    : r.calibration === 'calibrating' ? `<p class="note center reveal">${icon('hourglass', { size: 13 })} Calibration en cours : précision complète après ${CONFIG.baseline.fullNights} nuits.</p>` : '';
  const reduced = r.reducedPrecision ? `<p class="note center reveal">${icon('info', { size: 13 })} Précision réduite : ${esc(r.missing.join(', '))} indisponible(s) cette nuit.</p>` : '';
  const cycle = r.cycle ? `<p class="note center reveal">${icon('flower-2', { size: 13 })} Jour ${r.cycle.day} du cycle · ${PHASE_LABELS[r.cycle.phase]}${r.cycle.phase === 'luteal' ? ' : PULSE compense la FC repos et la température, plus hautes en cette phase.' : ''}</p>` : '';
  return `${head}
    ${stale}
    <div data-detail-rings>${ringsFor(r)}</div>
    ${calib}${reduced}${cycle}
    ${alertCard(r)}
    ${briefCard()}
    ${effortCard(r)}
    ${sessionCard()}
    ${sectionTitle('Métriques clés')}
    ${metricCards(r)}
    ${journalPrompt()}
    ${timelineCard(r)}
    ${xpCard()}
    ${stressCard(r)}`;
}

// ---------------------------------------------------------------- détails (niveau 3)

/** @param {DayRecord} r */
function recoveryDetail(r) {
  const z = r.recoveryDetail.z;
  const b = r.baseline;
  const rows = [
    ['Batterie nerveuse (VFC)', r.hrv === null ? '—' : `${num(r.hrv)} ms`, b.lnHrv.median === null ? '—' : `${num(Math.exp(b.lnHrv.median))} ms`, z.hrv, r.recoveryDetail.weights.hrv],
    ['FC au repos', r.rhr === null ? '—' : `${num(r.rhr)} bpm`, b.rhr.median === null ? '—' : `${num(b.rhr.median)} bpm`, z.rhr, r.recoveryDetail.weights.rhr],
    ['Score sommeil', r.sleepScore === null ? '—' : String(r.sleepScore), b.sleepScore.median === null ? '—' : num(b.sleepScore.median), z.sleep, r.recoveryDetail.weights.sleep],
    ['Respiration', r.resp === null ? '—' : `${num(r.resp, 1)} /min`, b.resp.median === null ? '—' : `${num(b.resp.median, 1)} /min`, z.resp, r.recoveryDetail.weights.resp],
  ];
  const zText = (/** @type {number | null | undefined} */ v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${num(v, 2)}`);
  return `<p class="lead">${r.recovery === null ? 'Pas de score aujourd\'hui.' : `Récupération ${r.recovery} % (${zoneLabel(r.zone).toLowerCase()}).`}</p>
    <p>Chaque mesure de la nuit est comparée à ta médiane des 30 derniers jours (écart standardisé z), puis pondérée et passée dans une courbe en S.</p>
    <table class="data-table"><thead><tr><th>Mesure</th><th>Cette nuit</th><th>Ton habitude</th><th>z</th><th>Poids</th></tr></thead>
    <tbody>${rows.map((x) => `<tr><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td><td>${zText(/** @type {number | null} */ (x[3]))}</td><td>${x[4] === undefined ? '—' : `${Math.round(Number(x[4]) * 100)} %`}</td></tr>`).join('')}</tbody></table>
    ${r.recoveryDetail.tempPenalty ? `<p>Température ${r.tempDelta !== null && r.tempDelta > 0 ? '+' : ''}${num(r.tempDelta, 2)} °C vs ta base : −${r.recoveryDetail.tempPenalty} points.</p>` : ''}
    <p class="note">S = ${num(r.recoveryDetail.S, 2)} · Récupération = 100 / (1 + e^(−1,5 × S)). Nuits dans la base : ${r.nightsInBaseline}. ${r.reducedPrecision ? `Précision réduite (${esc(r.missing.join(', '))}).` : ''}</p>
    ${lineChart({ points: S.records.slice(-30).map((x) => ({ label: shortDate(x.date), value: x.recovery })), tone: 'recovery', title: trendTitle('recovery', S.records), min: 0, max: 100 })}
    <p class="note">${esc(trendTitle('recovery', S.records))}</p>`;
}

/** @param {DayRecord} r */
function strainDetail(r) {
  const zones = CONFIG.strain.zones;
  const hrRest = S.records.at(-1)?.baseline.rhr.median ?? 60;
  return `<p class="lead">Effort ${num(r.strain, 1)} / 21 aujourd'hui.</p>
    <p>L'effort mesure la charge cardio de la journée : minutes passées dans chaque zone × poids de la zone (1 à 5), puis compression : Effort = 21 × (1 − e^(−TRIMP / ${CONFIG.strain.k})). Une heure en zone 3 ≈ 13.</p>
    <p class="note">TRIMP du jour : ${num(r.trimp)} · Zones (méthode Karvonen, FC repos ≈ ${num(hrRest)}) : ${zones.map((z, i) => `Z${i + 1} ≥ ${Math.round(z * 100)} %`).join(', ')} de ta réserve cardiaque.</p>
    ${r.target ? `<p>Cible ${r.target[0]}–${r.target[1]} car ta récupération est ${zoneLabel(r.zone).toLowerCase()} ; vise environ ${r.targetPoint}.</p>` : ''}
    ${lineChart({ points: S.records.slice(-30).map((x) => ({ label: shortDate(x.date), value: x.strain })), tone: 'strain', title: trendTitle('strain', S.records), min: 0, max: 21, format: (v) => num(v, 1) })}`;
}

/** @param {MetricKey} k */
function metricDetail(k) {
  const m = METRICS[k];
  const pts = S.records.slice(-30).map((r) => ({ label: shortDate(r.date), value: m.get(r) }));
  const vals = pts.map((p) => p.value).filter((v) => v !== null).map(Number);
  const avg = mean(vals);
  const title = k === 'temp' || k === 'spo2' ? `${m.label} sur 30 jours` : trendTitle(/** @type {'hrv' | 'rhr' | 'resp' | 'steps'} */ (k), S.records);
  return `<p class="lead">${esc(title)}</p>
    ${lineChart({ points: pts, tone: m.tone, title, format: (v) => fmtMetric(k, v), band: avg !== null && k !== 'steps' ? [avg * (k === 'temp' ? 1 : 0.95), avg * (k === 'temp' ? 1 : 1.05)] : null })}
    <p>${esc(m.explain)}</p>
    <p class="note">${esc(m.tech)} · moyenne 30 j : ${avg === null ? '—' : `${fmtMetric(k, avg)} ${m.unit}`} · min ${vals.length ? fmtMetric(k, Math.min(...vals)) : '—'} · max ${vals.length ? fmtMetric(k, Math.max(...vals)) : '—'}</p>`;
}

function stressDetail() {
  const r = latest();
  if (!r) return '';
  const base = stressBaseline(S.records, r.date);
  const s = stressOfDay(r, base);
  return `<p>Le stress est estimé à partir de ta fréquence cardiaque pendant les heures calmes (peu de pas, pas de séance), comparée à ta FC habituelle dans les mêmes conditions sur 14 jours. Échelle 0 (calme) à 3 (très élevé).</p>
    ${stressChart(s.hours, 'Stress heure par heure')}
    <p class="note">Référence : ${base ? `${num(base.median)} bpm (± ${num(base.sd, 1)})` : '—'}. La FC monte aussi avec le café, la chaleur ou la digestion : c'est une indication, pas une mesure du stress mental.</p>
    <a class="btn primary" href="#/respirer">${icon('wind', { size: 18 })}Faire une respiration guidée</a>`;
}

function briefDetail() {
  const r = latest();
  const ai = S.insights.get(`brief:${todayKey()}`);
  return `<p class="lead">${esc(ai?.text ?? briefText({ records: S.records, session: sessionOn(todayKey()), style: S.profile.coachStyle }))}</p>
    <p class="note">${ai ? 'Rédigé ce matin par ton coach IA (Claude Haiku) à partir de tes chiffres du jour.' : 'Calculé par PULSE à partir de tes scores. Ajoute ta clé API dans le profil pour un brief rédigé par le coach IA.'}</p>
    ${r ? `<p class="note">Données de la nuit du ${esc(longDate(r.date).toLowerCase())}.</p>` : ''}
    <button class="btn" data-action="regen-brief" ${S.apiKey ? '' : 'disabled'}>${icon('refresh-cw', { size: 16 })}Régénérer avec le coach IA</button>`;
}

/**
 * Contenu d'un panneau de détail.
 * @param {string} key
 * @returns {{ title: string, body: string } | null}
 */
export function todayDetail(key) {
  const r = latest();
  if (!r) return null;
  if (key === 'recovery') return { title: 'Récupération', body: recoveryDetail(r) };
  if (key === 'strain') return { title: 'Effort', body: strainDetail(r) };
  if (key === 'stress') return { title: 'Moniteur de stress', body: stressDetail() };
  if (key === 'brief') return { title: 'Brief du matin', body: briefDetail() };
  if (key.startsWith('metric:')) {
    const k = /** @type {MetricKey} */ (key.slice(7));
    if (k in METRICS) return { title: METRICS[k].label, body: metricDetail(k) };
  }
  return null;
}

export { recordFor };

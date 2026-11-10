// @ts-check
/** Écran « Sommeil » : score en 4 piliers, hypnogramme, besoin, coucher, dette, régularité, journal, historique. */
import { icon } from '../ui/icons.js';
import { header, cardHead, emptyCard, pillar, segmented, sectionTitle, toggle } from '../ui/components.js';
import { hypnogram, regularityChart, lineChart, barChart } from '../ui/charts.js';
import { esc, num, dur, time, longDate, shortDate, clock, dayLabel } from '../ui/format.js';
import { S, latest, todayKey, latencyMin, wakeMinutes, tonight } from '../state.js';
import { bedtimeText, debtPlan, trendTitle } from '../coach/rules.js';
import { journalForm } from './journal.js';
import { mean } from '../scoring/stats.js';
import { CONFIG } from '../scoring/config.js';
import { bedtimeFor } from '../scoring/scores.js';

/** @typedef {import('../scoring/scores.js').DayRecord} DayRecord */

/** Période de l'historique affichée. */
let period = /** @type {'week' | 'month' | 'year'} */ ('week');
/** @param {string} p */
export function setSleepPeriod(p) {
  if (p === 'week' || p === 'month' || p === 'year') period = p;
}

/** @param {DayRecord} r */
function scoreCard(r) {
  const p = r.pillars;
  const n = r.night;
  if (!n) {
    return `<div class="card reveal">${cardHead('moon', 'Pas de nuit enregistrée', { tone: 'sleep', sub: longDate(r.date) })}
      <p>Ta montre n'a pas enregistré de sommeil cette nuit. Porte-la au lit (assez chargée) pour avoir ton score et ta récupération.</p></div>`;
  }
  return `<div class="card reveal" data-detail="sleep-score">
    <div class="score-row"><div class="big-score sleep">${r.sleepScore ?? '—'}<small>/100</small></div>
      <div><strong>Score sommeil</strong><p class="note">${dur(n.asleepMin)} endormi · besoin ${dur(r.needMin)}</p></div></div>
    ${pillar('Durée vs besoin', p.duration, 'sleep', `${dur(n.asleepMin)} sur ${dur(r.needMin)}`)}
    ${pillar('Efficacité', p.efficiency, 'sleep', n.inBedOnly ? 'Pas de mesure du sommeil réel' : `${Math.round((n.asleepMin / Math.max(1, n.inBedMin)) * 100)} % du temps au lit passé à dormir`)}
    ${pillar('Régularité', p.regularity, 'sleep', p.regularityDevMin === null ? 'Il faut 3 nuits pour la calculer' : `écart moyen de ${p.regularityDevMin} min vs tes 7 dernières nuits`)}
    ${pillar('Qualité des phases', p.stages, 'sleep', p.deepPct === null ? 'Phases non mesurées par ta montre' : `profond ${num(p.deepPct)} % (cible 13–23) · paradoxal ${num(p.remPct)} % (cible 20–25)`)}
  </div>`;
}

/** @param {DayRecord} r */
function hypnogramCard(r) {
  const n = r.night;
  if (!n || !n.segments.length) return '';
  const total = n.asleepMin + n.awakeMin || 1;
  const parts = [
    ['Éveil', n.awakeMin, 'awake'], ['Paradoxal', n.remMin, 'rem'], ['Léger', n.coreMin, 'core'], ['Profond', n.deepMin, 'deep'],
  ];
  return `<div class="card reveal">
    ${cardHead('activity', 'Ta nuit', { tone: 'sleep', sub: `${time(n.start)} → ${time(n.end)}` })}
    ${hypnogram({ segments: n.segments, title: `Hypnogramme : ${dur(n.deepMin)} de profond et ${dur(n.remMin)} de paradoxal` })}
    <div class="stage-legend">${parts.map(([l, m, k]) => `<span><i class="dot hyp-${k}"></i>${l} <strong>${Math.round((Number(m) / total) * 100)} %</strong> <span class="note">${dur(Number(m))}</span></span>`).join('')}</div>
  </div>`;
}

function needCard() {
  const t = tonight();
  const wake = wakeMinutes();
  const lat = latencyMin();
  const bed = bedtimeFor({ needMin: t.needMin, latencyMin: lat, wakeMinutes: wake });
  return `<div class="card reveal" data-detail="sleep-need">
    ${cardHead('bed', `Ce soir : couche-toi à ${clock(bed)}`, { tone: 'sleep', sub: `Besoin ${dur(t.needMin)} · réveil ${clock(wake)}` })}
    <p>${esc(bedtimeText({ needMin: t.needMin, wakeMinutes: wake, latencyMin: lat }))}</p>
    <dl class="stat-list">
      <div><dt>Besoin de base (appris)</dt><dd>${dur(t.baseNeedMin)}</dd></div>
      <div><dt>+ 25 % de la dette</dt><dd>${dur(Math.round(CONFIG.sleep.debtWeight * t.debtMin))}</dd></div>
      <div><dt>+ effort du jour</dt><dd>${dur(t.strainAdjMin)}</dd></div>
    </dl>
    ${toggle({ name: 'bedtime', checked: S.notif.enabled && S.notif.bedtime, label: 'Me le rappeler 30 min avant', hint: S.notif.enabled ? '' : 'Active les notifications dans le profil', action: 'notif-bedtime' })}
  </div>`;
}

function debtCard() {
  const t = tonight();
  const last7 = S.records.slice(-7);
  const bars = last7.map((r) => ({
    label: dayLabel(r.date),
    value: r.night ? r.night.asleepMin / 60 : null,
    tone: /** @type {'sleep' | 'red'} */ (r.night && r.night.asleepMin < r.needMin - 30 ? 'red' : 'sleep'),
    target: /** @type {[number, number]} */ ([r.needMin / 60 - 0.05, r.needMin / 60 + 0.05]),
  }));
  return `<div class="card reveal">
    ${cardHead('hourglass', t.debtMin >= 20 ? `Dette de sommeil : ${dur(t.debtMin)}` : 'Pas de dette de sommeil', { tone: 'sleep', sub: 'Sur les 7 dernières nuits' })}
    ${barChart({ bars, max: 11, tone: 'sleep', title: 'Durée de sommeil des 7 dernières nuits face au besoin', format: (v) => dur(v * 60) })}
    <p>${esc(debtPlan(t.debtMin))}</p>
  </div>`;
}

function regularityCard() {
  const last = S.records.slice(-14);
  const devs = last.map((r) => r.pillars.regularityDevMin).filter((v) => v !== null).map(Number);
  const avgDev = mean(devs);
  const title = avgDev === null ? 'Régularité : pas encore assez de nuits' : avgDev <= 30 ? `Horaires réguliers : ±${Math.round(avgDev)} min en moyenne` : `Tes horaires varient de ±${Math.round(avgDev)} min en moyenne`;
  return `<div class="card reveal">
    ${cardHead('clock', 'Régularité', { tone: 'sleep', sub: '14 dernières nuits' })}
    <p class="lead">${esc(title)}</p>
    ${regularityChart({ nights: last.map((r) => ({ date: r.date, start: r.night?.start ?? null, end: r.night?.end ?? null })), title })}
  </div>`;
}

function correlationsCard() {
  const list = S.correlations.slice(0, 4);
  const n = S.journal.length;
  if (!list.length) {
    return `<div class="card reveal">${cardHead('brain', 'Ce qui pèse sur TON sommeil', { tone: 'sleep' })}
      <p>${n < 6 ? `Remplis le journal du soir quelques soirs (${n} pour l'instant) : PULSE comparera tes nuits avec et sans café tardif, alcool, écrans…` : 'Pas d\'effet net détecté pour l\'instant dans ton journal.'}</p></div>`;
  }
  return `<div class="card reveal">${cardHead('brain', 'Ce qui pèse sur TON sommeil', { tone: 'sleep', sub: `D'après ${n} soirs de journal` })}
    <ul class="insights">${list.map((c) => `<li class="${c.diffPct < 0 ? 'neg' : 'pos'}">${icon(c.diffPct < 0 ? 'trending-down' : 'trending-up', { size: 16 })}<span>${esc(c.text)}</span></li>`).join('')}</ul>
    <p class="note">Ce sont des moyennes sur tes propres soirées, pas des certitudes.</p></div>`;
}

function historyCard() {
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const cur = S.records.slice(-days);
  const prev = S.records.slice(-2 * days, -days);
  /** @param {DayRecord[]} rs @param {(r: DayRecord) => number | null} f */
  const avg = (rs, f) => mean(rs.map(f).filter((v) => v !== null).map(Number));
  const rows = [
    ['Score sommeil', avg(cur, (r) => r.sleepScore), avg(prev, (r) => r.sleepScore), (/** @type {number} */ v) => num(v)],
    ['Durée', avg(cur, (r) => r.night?.asleepMin ?? null), avg(prev, (r) => r.night?.asleepMin ?? null), (/** @type {number} */ v) => dur(v)],
    ['Régularité', avg(cur, (r) => r.pillars.regularity), avg(prev, (r) => r.pillars.regularity), (/** @type {number} */ v) => num(v)],
    ['Profond', avg(cur, (r) => r.pillars.deepPct), avg(prev, (r) => r.pillars.deepPct), (/** @type {number} */ v) => `${num(v)} %`],
  ];
  const chart = period === 'year'
    ? lineChart({ points: weekly(cur).map((w) => ({ label: shortDate(w.date), value: w.value })), tone: 'sleep', title: trendTitle('sleepScore', cur), min: 0, max: 100 })
    : lineChart({ points: cur.map((r) => ({ label: shortDate(r.date), value: r.sleepScore })), tone: 'sleep', title: trendTitle('sleepScore', cur), min: 0, max: 100 });
  return `<div class="card reveal">
    ${cardHead('calendar', 'Historique', { tone: 'sleep' })}
    ${segmented({ name: 'period', value: period, options: [['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']], action: 'sleep-period' })}
    <p class="lead">${esc(trendTitle('sleepScore', cur))}</p>
    ${chart}
    <table class="data-table"><thead><tr><th></th><th>Cette période</th><th>Précédente</th></tr></thead>
    <tbody>${rows.map(([l, a, b, f]) => `<tr><td>${l}</td><td>${a === null ? '—' : /** @type {(v: number) => string} */ (f)(/** @type {number} */ (a))}</td><td>${b === null ? '—' : /** @type {(v: number) => string} */ (f)(/** @type {number} */ (b))}</td></tr>`).join('')}</tbody></table>
    ${period === 'year' && S.records.length < 120 ? '<p class="note">L\'import garde 120 jours : l\'année se remplira au fil des imports.</p>' : ''}
  </div>`;
}

/** Moyenne hebdomadaire du score sommeil. @param {DayRecord[]} rs */
function weekly(rs) {
  /** @type {{ date: string, value: number | null }[]} */
  const out = [];
  for (let i = 0; i < rs.length; i += 7) {
    const chunk = rs.slice(i, i + 7);
    out.push({ date: chunk[0].date, value: mean(chunk.map((r) => r.sleepScore).filter((v) => v !== null).map(Number)) });
  }
  return out;
}

function journalCard() {
  const today = todayKey();
  const done = S.journal.some((j) => j.date === today);
  return `<details class="card reveal journal-card" ${new Date().getHours() >= 19 && !done ? 'open' : ''}>
    <summary>${cardHead('pencil', 'Journal du soir', { tone: 'sleep', sub: done ? 'Rempli ce soir ✓' : '10 secondes · +10 XP' })}</summary>
    ${journalForm(today)}
  </details>`;
}

export function renderSleep() {
  const head = header('sommeil', 'Sommeil');
  if (!S.loaded) return `${head}<div class="skeleton tall"></div>`;
  const r = latest();
  if (!r) {
    return `${head}${emptyCard({ iconName: 'moon', tone: 'sleep', title: 'Ton sommeil, décortiqué', text: 'Charge la démo ou importe tes données pour voir ton score en 4 piliers, ton hypnogramme et ton heure de coucher idéale.', action: '<a class="btn primary" href="#/aujourdhui">Commencer</a>' })}`;
  }
  return `${head}
    ${scoreCard(r)}
    ${hypnogramCard(r)}
    ${needCard()}
    ${debtCard()}
    ${regularityCard()}
    ${journalCard()}
    ${correlationsCard()}
    ${sectionTitle('Historique')}
    ${historyCard()}`;
}

/**
 * @param {string} key
 * @returns {{ title: string, body: string } | null}
 */
export function sleepDetail(key) {
  const r = latest();
  if (!r) return null;
  if (key === 'sleep-score') {
    return {
      title: 'Score sommeil',
      body: `<p class="lead">${r.sleepScore ?? '—'} / 100</p>
        <p>Le score combine 4 piliers : durée vs besoin (40 %), efficacité (20 %), régularité (20 %) et qualité des phases (20 %). Si un pilier manque (ex. ta montre ne mesure pas les phases), son poids est réparti sur les autres.</p>
        <dl class="stat-list">
          <div><dt>Durée</dt><dd>endormi ÷ besoin, plafonné à 100 %</dd></div>
          <div><dt>Efficacité</dt><dd>endormi ÷ au lit (85 % et plus = 100)</dd></div>
          <div><dt>Régularité</dt><dd>0 min d'écart = 100, 90 min et plus = 0</dd></div>
          <div><dt>Phases</dt><dd>profond 13–23 %, paradoxal 20–25 %</dd></div>
        </dl>
        ${lineChart({ points: S.records.slice(-30).map((x) => ({ label: shortDate(x.date), value: x.sleepScore })), tone: 'sleep', title: trendTitle('sleepScore', S.records), min: 0, max: 100 })}`,
    };
  }
  if (key === 'sleep-need') {
    const t = tonight();
    return {
      title: 'Besoin de sommeil',
      body: `<p class="lead">Besoin = base + 25 % de la dette + ajustement d'effort.</p>
        <p>La base part de 8 h puis s'ajuste à ta durée moyenne les nuits suivies d'une récupération verte (au moins ${CONFIG.sleep.learnMinNights} nuits). La dette compte, sur 7 nuits, ce qui t'a manqué (max 1 h par nuit) ; une nuit plus longue la rembourse. Un effort au-dessus de 14 la veille ajoute jusqu'à 45 min.</p>
        <dl class="stat-list"><div><dt>Base</dt><dd>${dur(t.baseNeedMin)}</dd></div><div><dt>Dette 7 j</dt><dd>${dur(t.debtMin)}</dd></div><div><dt>Ajustement effort</dt><dd>${dur(t.strainAdjMin)}</dd></div><div><dt>Endormissement moyen</dt><dd>${latencyMin()} min</dd></div></dl>`,
    };
  }
  return null;
}

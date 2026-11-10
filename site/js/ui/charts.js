// @ts-check
/**
 * Graphiques SVG faits main : courbe, barres, hypnogramme, régularité, jauge, stress.
 * Couleurs via des classes CSS (aucun style en ligne : compatible avec la CSP stricte).
 * Chaque graphique porte un titre qui dit la conclusion (role="img" + aria-label).
 */
import { esc, shortDate, clock, dayLabel } from './format.js';

/** @typedef {'recovery' | 'sleep' | 'strain' | 'xp' | 'muted' | 'green' | 'yellow' | 'red'} Tone */

const W = 320;

/**
 * @param {number[]} values @param {number} [pad]
 * @returns {[number, number]}
 */
function extent(values, pad = 0.08) {
  if (!values.length) return [0, 1];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

let gradientSeq = 0;

/**
 * Courbe avec aire, bande de référence facultative et dernier point mis en avant.
 * @param {{ points: { label: string, value: number | null }[], tone: Tone, title: string, height?: number,
 *   band?: [number, number] | null, min?: number, max?: number, format?: (v: number) => string }} o
 */
export function lineChart(o) {
  const H = o.height ?? 120;
  const top = 10;
  const bottom = H - 18;
  const pts = o.points;
  const vals = pts.map((p) => p.value).filter((v) => v !== null).map(Number);
  if (vals.length < 2) return emptyChart(o.title, H);
  const [lo0, hi0] = extent(o.band ? [...vals, ...o.band] : vals);
  const lo = o.min ?? lo0;
  const hi = o.max ?? hi0;
  const x = (/** @type {number} */ i) => 4 + (i / Math.max(1, pts.length - 1)) * (W - 8);
  const y = (/** @type {number} */ v) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top);
  // Segments continus (un trou dans les données coupe la courbe et son aire).
  /** @type {{ d: string, first: number, last: number }[]} */
  const segs = [];
  /** @type {{ d: string, first: number, last: number } | null} */
  let cur = null;
  pts.forEach((p, i) => {
    if (p.value === null) { if (cur) segs.push(cur); cur = null; return; }
    const pt = `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    if (cur) { cur.d += `L${pt}`; cur.last = i; } else cur = { d: `M${pt}`, first: i, last: i };
  });
  if (cur) segs.push(cur);
  let lastIdx = -1;
  pts.forEach((p, i) => { if (p.value !== null) lastIdx = i; });
  const line = segs.map((sg) => sg.d).join(' ');
  const area = segs.filter((sg) => sg.last > sg.first)
    .map((sg) => `${sg.d} L${x(sg.last).toFixed(1)},${bottom} L${x(sg.first).toFixed(1)},${bottom} Z`).join(' ');
  const gid = `g${++gradientSeq}`;
  const last = /** @type {number} */ (pts[lastIdx].value);
  const fmt = o.format ?? ((v) => String(Math.round(v)));
  const band = o.band ? `<rect class="chart-band" x="0" y="${y(o.band[1]).toFixed(1)}" width="${W}" height="${Math.max(1, y(o.band[0]) - y(o.band[1])).toFixed(1)}" rx="4"></rect>` : '';
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}" preserveAspectRatio="none">
      <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="stop-${o.tone}" stop-opacity="0.35"></stop><stop offset="1" class="stop-${o.tone}" stop-opacity="0"></stop></linearGradient></defs>
      ${band}
      <path d="${area}" fill="url(#${gid})"></path>
      <path d="${line}" class="chart-line s-${o.tone}" fill="none"></path>
      <circle cx="${x(lastIdx).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4" class="chart-dot f-${o.tone}"></circle>
    </svg>
    <figcaption class="chart-axis"><span>${esc(pts[0].label)}</span><span>${esc(fmt(Math.min(...vals)))} – ${esc(fmt(Math.max(...vals)))}</span><span>${esc(pts[pts.length - 1].label)}</span></figcaption>
  </figure>`;
}

/**
 * Barres verticales (une par jour), avec bande cible facultative par barre.
 * @param {{ bars: { label: string, value: number | null, tone?: Tone, target?: [number, number] | null }[], title: string,
 *   max: number, height?: number, tone: Tone, format?: (v: number) => string }} o
 */
export function barChart(o) {
  const H = o.height ?? 120;
  const bottom = H - 18;
  const n = o.bars.length;
  if (!n || o.bars.every((b) => b.value === null)) return emptyChart(o.title, H);
  const gap = n > 20 ? 2 : 4;
  const bw = (W - gap * (n - 1)) / n;
  const y = (/** @type {number} */ v) => bottom - (Math.min(v, o.max) / o.max) * (bottom - 6);
  const rects = o.bars.map((b, i) => {
    const x = i * (bw + gap);
    const target = b.target ? `<rect class="chart-target" x="${x.toFixed(1)}" y="${y(b.target[1]).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y(b.target[0]) - y(b.target[1])).toFixed(1)}" rx="2"></rect>` : '';
    if (b.value === null) return `${target}<rect class="chart-empty" x="${x.toFixed(1)}" y="${bottom - 2}" width="${bw.toFixed(1)}" height="2"></rect>`;
    const top = y(b.value);
    return `${target}<rect class="f-${b.tone ?? o.tone}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, bottom - top).toFixed(1)}" rx="${Math.min(4, bw / 2).toFixed(1)}"><title>${esc(b.label)} : ${esc(o.format ? o.format(b.value) : Math.round(b.value))}</title></rect>`;
  }).join('');
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}" preserveAspectRatio="none">${rects}</svg>
    <figcaption class="chart-axis"><span>${esc(o.bars[0].label)}</span><span>${esc(o.bars[n - 1].label)}</span></figcaption>
  </figure>`;
}

const STAGE_ROW = /** @type {Record<string, number>} */ ({ awake: 0, rem: 1, core: 2, asleep: 2, deep: 3 });
const STAGE_LABEL = /** @type {Record<string, string>} */ ({ awake: 'Éveil', rem: 'Paradoxal (REM)', core: 'Léger (Core)', asleep: 'Endormi', deep: 'Profond' });

/**
 * Hypnogramme interactif : un rectangle par phase ; toucher une phase affiche son heure et sa durée.
 * @param {{ segments: { stage: string, start: number, end: number }[], title: string }} o
 */
export function hypnogram(o) {
  const H = 150;
  const left = 0;
  const rowH = 30;
  if (!o.segments.length) return emptyChart(o.title, H);
  const t0 = o.segments[0].start;
  const t1 = o.segments[o.segments.length - 1].end;
  const x = (/** @type {number} */ t) => left + ((t - t0) / (t1 - t0)) * (W - left);
  const rects = o.segments.map((s) => {
    const row = STAGE_ROW[s.stage] ?? 2;
    const mins = Math.round((s.end - s.start) / 60000);
    return `<rect class="hyp-${s.stage}" x="${x(s.start).toFixed(2)}" y="${row * rowH + 4}" width="${Math.max(0.8, x(s.end) - x(s.start)).toFixed(2)}" height="${rowH - 8}" rx="3" data-stage="${esc(STAGE_LABEL[s.stage] ?? s.stage)}" data-from="${s.start}" data-mins="${mins}"></rect>`;
  }).join('');
  const grid = [0, 1, 2, 3].map((r) => `<line class="chart-grid" x1="0" x2="${W}" y1="${r * rowH + rowH / 2}" y2="${r * rowH + rowH / 2}"></line>`).join('');
  return `<figure class="chart hypnogram" data-hypnogram>
    <div class="hyp-labels"><span>Éveil</span><span>REM</span><span>Léger</span><span>Profond</span></div>
    <svg viewBox="0 0 ${W} ${4 * rowH}" role="img" aria-label="${esc(o.title)}" preserveAspectRatio="none">${grid}${rects}</svg>
    <figcaption class="chart-axis"><span>${clock(minutesOf(t0))}</span><span class="hyp-caption" data-hyp-caption>Touche une phase</span><span>${clock(minutesOf(t1))}</span></figcaption>
  </figure>`;
}

/** @param {number} t */
function minutesOf(t) {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Régularité : heures de coucher et de lever sur 14 jours (barre de la nuit sur un axe 20 h → 12 h).
 * @param {{ nights: { date: string, start: number | null, end: number | null }[], title: string }} o
 */
export function regularityChart(o) {
  const H = 160;
  const from = 20 * 60;
  const span = 16 * 60;
  const n = o.nights.length;
  const gap = 4;
  const bw = (W - 30 - gap * (n - 1)) / n;
  /** @param {number} t */
  const pos = (t) => {
    let m = minutesOf(t);
    if (m < 12 * 60) m += 1440;
    return 6 + ((m - from) / span) * (H - 24);
  };
  const bars = o.nights.map((nt, i) => {
    const xx = 30 + i * (bw + gap);
    if (nt.start === null || nt.end === null) return `<rect class="chart-empty" x="${xx.toFixed(1)}" y="${H / 2}" width="${bw.toFixed(1)}" height="2"></rect>`;
    return `<rect class="f-sleep" x="${xx.toFixed(1)}" y="${pos(nt.start).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, pos(nt.end) - pos(nt.start)).toFixed(1)}" rx="${Math.min(4, bw / 2).toFixed(1)}"><title>${esc(dayLabel(nt.date))} : ${clock(minutesOf(nt.start))} → ${clock(minutesOf(nt.end))}</title></rect>`;
  }).join('');
  const ticks = [22, 24, 26, 28, 30, 32].map((hh) => {
    const yy = 6 + ((hh * 60 - from) / span) * (H - 24);
    return `<text class="chart-tick" x="0" y="${(yy + 3).toFixed(1)}">${hh % 24}h</text><line class="chart-grid" x1="26" x2="${W}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"></line>`;
  }).join('');
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}" preserveAspectRatio="none">${ticks}${bars}</svg>
    <figcaption class="chart-axis"><span>${o.nights.length ? esc(shortDate(o.nights[0].date)) : ''}</span><span>${o.nights.length ? esc(shortDate(o.nights[n - 1].date)) : ''}</span></figcaption>
  </figure>`;
}

/**
 * Jauge horizontale d'effort : fourchette cible + effort déjà fait.
 * @param {{ value: number, target: [number, number] | null, point: number | null, max?: number }} o
 */
export function strainGauge(o) {
  const max = o.max ?? 21;
  const pct = (/** @type {number} */ v) => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}`;
  return `<div class="gauge" role="img" aria-label="Effort fait ${o.value.toFixed(1)} sur ${max}${o.target ? `, cible ${o.target[0]} à ${o.target[1]}` : ''}">
    <svg viewBox="0 0 100 12" preserveAspectRatio="none" class="gauge-svg">
      <rect class="gauge-track" x="0" y="3" width="100" height="6" rx="3"></rect>
      ${o.target ? `<rect class="gauge-target" x="${pct(o.target[0])}" y="1" width="${(Number(pct(o.target[1])) - Number(pct(o.target[0]))).toFixed(1)}" height="10" rx="3"></rect>` : ''}
      <rect class="gauge-fill" x="0" y="3" width="${pct(o.value)}" height="6" rx="3"></rect>
      ${o.point !== null ? `<rect class="gauge-point" x="${(Number(pct(o.point)) - 0.4).toFixed(1)}" y="0" width="0.8" height="12"></rect>` : ''}
    </svg>
    <div class="gauge-scale"><span>0</span><span>7</span><span>14</span><span>21</span></div>
  </div>`;
}

/**
 * Mini-courbe pour les cartes métriques.
 * @param {(number | null)[]} values @param {Tone} tone
 */
export function sparkline(values, tone) {
  const vals = values.filter((v) => v !== null).map(Number);
  if (vals.length < 2) return '';
  const [lo, hi] = extent(vals, 0.15);
  const H = 32;
  const x = (/** @type {number} */ i) => (i / Math.max(1, values.length - 1)) * 100;
  const y = (/** @type {number} */ v) => H - ((v - lo) / (hi - lo || 1)) * H;
  let d = '';
  values.forEach((v, i) => { if (v !== null) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  return `<svg class="spark" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" class="chart-line thin s-${tone}" fill="none"></path></svg>`;
}

/**
 * Minutes par zone cardio (barres horizontales).
 * @param {number[]} zoneMin @param {string[]} [labels]
 */
export function zoneBars(zoneMin, labels = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']) {
  const max = Math.max(1, ...zoneMin);
  return `<div class="zones">${zoneMin.map((m, i) => `
    <div class="zone-row"><span class="zone-name">${labels[i]}</span>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" class="zone-bar" aria-hidden="true"><rect class="gauge-track" x="0" y="0" width="100" height="8" rx="4"></rect><rect class="f-zone${i + 1}" x="0" y="0" width="${Math.max(m > 0 ? 2 : 0, (m / max) * 100).toFixed(1)}" height="8" rx="4"></rect></svg>
      <span class="zone-min">${Math.round(m)} min</span></div>`).join('')}</div>`;
}

/**
 * Stress heure par heure (0–3).
 * @param {{ hour: number, score: number }[]} hours @param {string} title
 */
export function stressChart(hours, title) {
  if (!hours.length) return emptyChart(title, 100);
  const H = 100;
  const bottom = H - 18;
  const bw = W / 14 - 4;
  const rects = hours.map((h) => {
    const x = (h.hour - 8) * (bw + 4);
    const top = bottom - (h.score / 3) * (bottom - 6);
    const tone = h.score < 1 ? 'green' : h.score < 2 ? 'yellow' : 'red';
    return `<rect class="f-${tone}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, bottom - top).toFixed(1)}" rx="3"><title>${h.hour} h : ${h.score.toFixed(1)} / 3</title></rect>`;
  }).join('');
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" preserveAspectRatio="none">${rects}</svg>
    <figcaption class="chart-axis"><span>8 h</span><span>15 h</span><span>21 h</span></figcaption>
  </figure>`;
}

/** @param {string} title @param {number} H */
function emptyChart(title, H) {
  return `<figure class="chart chart-none" role="img" aria-label="${esc(title)}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line class="chart-grid" x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}"></line></svg><figcaption class="chart-axis"><span>Pas encore assez de données</span></figcaption></figure>`;
}

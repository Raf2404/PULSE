// @ts-check
/** Rapport mensuel (Phase 3) : bilan imprimable / enregistrable en PDF (Partager → Imprimer → PDF). */
import { icon } from '../ui/icons.js';
import { header } from '../ui/components.js';
import { lineChart, barChart } from '../ui/charts.js';
import { esc, num, dur, monthLabel, shortDate, WORKOUT_LABELS } from '../ui/format.js';
import { S } from '../state.js';
import { mean, sum } from '../scoring/stats.js';
import { trendTitle } from '../coach/rules.js';

/** @param {number} n @param {string} word */
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Mois disponibles (AAAA-MM), du plus récent au plus ancien. */
export function availableMonths() {
  return [...new Set(S.records.map((r) => r.date.slice(0, 7)))].sort().reverse();
}

/** @param {string | undefined} month AAAA-MM */
export function renderReport(month) {
  const months = availableMonths();
  const m = month && months.includes(month) ? month : months[0];
  const head = header('rapport', 'Rapport mensuel', { back: '#/profil' });
  if (!m) return `${head}<div class="card reveal"><p>Pas encore de données pour un rapport.</p></div>`;
  const rs = S.records.filter((r) => r.date.startsWith(m));
  /** @param {(r: import('../scoring/scores.js').DayRecord) => number | null} f */
  const avg = (f) => mean(rs.map(f).filter((v) => v !== null).map(Number));
  const green = rs.filter((r) => r.zone === 'green').length;
  const yellow = rs.filter((r) => r.zone === 'yellow').length;
  const red = rs.filter((r) => r.zone === 'red').length;
  const workouts = rs.flatMap((r) => r.workouts);
  /** @type {Map<string, { n: number, min: number }>} */
  const byType = new Map();
  for (const w of workouts) {
    const v = byType.get(w.type) ?? { n: 0, min: 0 };
    v.n++;
    v.min += w.durationMin;
    byType.set(w.type, v);
  }
  const best = [...rs].filter((r) => r.recovery !== null).sort((a, b) => /** @type {number} */ (b.recovery) - /** @type {number} */ (a.recovery))[0];
  const xp = S.progress ? sum(S.progress.events.filter((e) => e.date.startsWith(m)).map((e) => e.points)) : 0;
  const badges = S.progress ? S.progress.badges.filter((b) => b.earnedAt?.startsWith(m)) : [];
  return `${head}
    <div class="report">
      <div class="card reveal no-print">
        <label class="field"><span class="field-label">Mois</span><select data-change="report-month">${months.map((x) => `<option value="${x}" ${x === m ? 'selected' : ''}>${esc(monthLabel(`${x}-15`))}</option>`).join('')}</select></label>
        <button class="btn primary" data-action="print">${icon('printer', { size: 18 })}Imprimer / enregistrer en PDF</button>
        <p class="note">Sur iPhone : Imprimer, puis écarte l'aperçu avec deux doigts et partage le PDF.</p>
      </div>
      <article class="card report-sheet reveal">
        <header class="report-head"><strong>PULSE</strong><span>Bilan de ${esc(monthLabel(`${m}-15`).toLowerCase())}</span></header>
        <div class="report-grid">
          <div><span class="note">Récupération moyenne</span><strong>${num(avg((r) => r.recovery))} %</strong></div>
          <div><span class="note">Score sommeil</span><strong>${num(avg((r) => r.sleepScore))}</strong></div>
          <div><span class="note">Sommeil moyen</span><strong>${dur(avg((r) => r.night?.asleepMin ?? null))}</strong></div>
          <div><span class="note">Effort moyen</span><strong>${num(avg((r) => r.strain), 1)}</strong></div>
          <div><span class="note">VFC nocturne</span><strong>${num(avg((r) => r.hrv))} ms</strong></div>
          <div><span class="note">FC repos</span><strong>${num(avg((r) => r.rhr))} bpm</strong></div>
          <div><span class="note">Pas par jour</span><strong>${num(avg((r) => r.steps))}</strong></div>
          <div><span class="note">Séances</span><strong>${workouts.length} · ${dur(sum(workouts.map((w) => w.durationMin)))}</strong></div>
        </div>
        <p><strong>Jours :</strong> ${plural(green, 'vert')}, ${plural(yellow, 'jaune')}, ${plural(red, 'rouge')}${best ? ` · meilleure récupération ${best.recovery} % le ${esc(shortDate(best.date))}` : ''}${best ? '' : '.'}</p>
        <h3>${esc(trendTitle('recovery', rs))}</h3>
        ${lineChart({ points: rs.map((r) => ({ label: shortDate(r.date), value: r.recovery })), tone: 'recovery', title: 'Récupération du mois', min: 0, max: 100 })}
        <h3>Durée de sommeil</h3>
        ${barChart({ bars: rs.map((r) => ({ label: shortDate(r.date), value: r.night ? r.night.asleepMin / 60 : null, target: [r.needMin / 60 - 0.05, r.needMin / 60 + 0.05] })), max: 11, tone: 'sleep', title: 'Durée de sommeil face au besoin', format: (v) => dur(v * 60) })}
        ${byType.size ? `<h3>Entraînement</h3><table class="data-table"><thead><tr><th>Type</th><th>Séances</th><th>Durée</th></tr></thead><tbody>${[...byType.entries()].map(([t, v]) => `<tr><td>${esc(WORKOUT_LABELS[t] ?? t)}</td><td>${v.n}</td><td>${dur(v.min)}</td></tr>`).join('')}</tbody></table>` : ''}
        ${S.correlations.length ? `<h3>Ce qui pèse sur le sommeil</h3><ul>${S.correlations.slice(0, 3).map((c) => `<li>${esc(c.text)}</li>`).join('')}</ul>` : ''}
        <p><strong>Progression :</strong> +${num(xp)} XP ce mois-ci${badges.length ? ` · badges : ${badges.map((b) => esc(b.name)).join(', ')}` : ''}.</p>
        <p class="note">Rapport généré par PULSE à partir des données d'Apple Santé. Les scores sont indicatifs ; PULSE n'est pas un dispositif médical.</p>
      </article>
    </div>`;
}

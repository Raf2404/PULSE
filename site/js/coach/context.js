// @ts-check
/**
 * Résumé compact (~2 000 tokens) envoyé au coach à chaque requête. Jamais de données brutes,
 * jamais de prénom ni d'identifiant : seulement des chiffres agrégés.
 */
import { CONFIG } from '../scoring/config.js';
import { mean, round } from '../scoring/stats.js';
import { GOALS, SPORTS, ageOf, hrMaxOf } from '../data/profile.js';
import { GOAL_LABELS, LEVEL_LABELS } from '../program/generator.js';

/** @typedef {import('../scoring/scores.js').DayRecord} DayRecord */
/** @typedef {import('../data/profile.js').Profile} Profile */
/** @typedef {import('../scoring/correlations.js').Correlation} Correlation */
/** @typedef {import('../scoring/gamification.js').Progress} Progress */
/** @typedef {import('../program/generator.js').Program} Program */
/** @typedef {import('../program/generator.js').PlannedSession} PlannedSession */

/** @param {number | null | undefined} v @param {number} [d] */
const n = (v, d = 0) => (v === null || v === undefined ? '—' : String(round(v, d)));
/** @param {number | null | undefined} m */
const h = (m) => (m === null || m === undefined ? '—' : `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`);

/**
 * Ligne compacte d'une journée.
 * @param {DayRecord} r
 */
export function dayLine(r) {
  const w = r.workouts.map((x) => `${x.type} ${Math.round(x.durationMin)}min effort ${x.strain}`).join(', ');
  return `${r.date} | récup ${n(r.recovery)}${r.zone ? ` (${r.zone})` : ''} | sommeil ${n(r.sleepScore)} (${h(r.night?.asleepMin)} / besoin ${h(r.needMin)}, dette ${h(r.debtMin)}) | VFC ${n(r.hrv)} ms | FC repos ${n(r.rhr)} | resp ${n(r.resp, 1)} | temp ${r.tempDelta === null ? '—' : `${r.tempDelta > 0 ? '+' : ''}${r.tempDelta}°C`} | effort ${n(r.strain, 1)}${r.target ? ` (cible ${r.target[0]}–${r.target[1]})` : ''} | pas ${n(r.steps)}${w ? ` | séances : ${w}` : ''}${r.alert ? ' | alerte dérive' : ''}`;
}

/**
 * @param {{ profile: Profile, memory: { key: string, value: string }[], records: DayRecord[], correlations: Correlation[],
 *   progress: Progress | null, program: Program | null, todaySession: PlannedSession | null, now?: Date }} o
 */
export function buildContext(o) {
  const now = o.now ?? new Date();
  const p = o.profile;
  const last = o.records.slice(-7);
  const month = o.records.slice(-30);
  /** @param {(r: DayRecord) => number | null} f */
  const avg = (f) => mean(month.map(f).filter((v) => v !== null).map(Number));
  const lines = [];
  lines.push(`Date et heure : ${now.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`);
  lines.push('');
  lines.push('## Profil');
  const age = ageOf(p, now);
  lines.push(`Âge ${age ?? '—'}, sexe ${p.sex ?? '—'}, ${p.heightCm ?? '—'} cm, ${p.weightKg ?? '—'} kg, FC max ${hrMaxOf(p, now)}. Réveil visé ${p.wakeTime}.`);
  lines.push(`Objectifs : ${p.goals.map((g) => GOALS[g]).join(', ') || '—'}. Sports : ${p.sports.map((s) => SPORTS[s]).join(', ') || '—'}.`);
  if (o.memory.length) {
    lines.push('Ce que tu sais déjà (mémoire du coach) :');
    for (const m of o.memory) lines.push(`- ${m.key} : ${m.value}`);
  }
  lines.push('');
  lines.push('## Moyennes 30 jours');
  lines.push(`Récup ${n(avg((r) => r.recovery))} % | sommeil ${n(avg((r) => r.sleepScore))} | durée ${h(avg((r) => r.night?.asleepMin ?? null))} | VFC ${n(avg((r) => r.hrv))} ms | FC repos ${n(avg((r) => r.rhr), 1)} | effort ${n(avg((r) => r.strain), 1)} | pas ${n(avg((r) => r.steps))}`);
  const lastRec = o.records.at(-1);
  if (lastRec) {
    lines.push(`Charge aiguë/chronique : ${lastRec.acwr ?? '—'} (zone optimale ${CONFIG.load.optimal[0]}–${CONFIG.load.optimal[1]}, risque > ${CONFIG.load.risk}). Calibration : ${lastRec.calibration}.${lastRec.reducedPrecision ? ' Précision réduite (données manquantes : ' + lastRec.missing.join(', ') + ').' : ''}`);
  }
  lines.push('');
  lines.push('## 7 derniers jours (le dernier = aujourd\'hui)');
  for (const r of last) lines.push(dayLine(r));
  const workouts = o.records.flatMap((r) => r.workouts).slice(-5);
  if (workouts.length) {
    lines.push('');
    lines.push('## 5 dernières séances');
    for (const w of workouts) {
      lines.push(`${new Date(w.start).toLocaleDateString('fr-FR')} ${w.type} ${Math.round(w.durationMin)} min, FC moy ${w.avgHr ?? '—'} max ${w.maxHr ?? '—'}, effort ${w.strain}${w.distanceKm ? `, ${w.distanceKm} km` : ''}`);
    }
  }
  lines.push('');
  lines.push('## Programme');
  if (o.program) {
    lines.push(`${o.program.title} (${GOAL_LABELS[o.program.goal]}, ${LEVEL_LABELS[o.program.level]}), ${o.program.weeks} semaines depuis le ${o.program.startDate}.`);
    if (o.todaySession) {
      const s = o.todaySession;
      lines.push(`Séance du jour : ${s.title}${s.version !== 'normal' ? ` (version ${s.version === 'light' ? 'allégée' : 'repos'})` : ''}${s.done ? ', faite' : ''}. ${s.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(', ')}${s.cardio ? `${s.cardio.durationMin} min zone ${s.cardio.zone}` : ''}`);
    } else lines.push('Pas de séance prévue aujourd\'hui.');
  } else lines.push('Aucun programme en cours.');
  if (o.correlations.length) {
    lines.push('');
    lines.push('## Corrélations du journal (moyennes, pas des causes)');
    for (const c of o.correlations.slice(0, 5)) lines.push(`- ${c.text}`);
  }
  if (o.progress) {
    const pr = o.progress;
    lines.push('');
    lines.push('## Progression');
    lines.push(`Niveau ${pr.level} (${pr.rank}), ${pr.xpTotal} XP. Série de couchers réguliers : ${pr.streaks.regularSleep.current} jours. ${pr.challenge ? `${pr.challenge.title} : ${pr.challenge.progress}/${pr.challenge.target}.` : ''}`);
  }
  return lines.join('\n');
}

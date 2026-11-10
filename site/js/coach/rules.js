// @ts-check
/**
 * Coach « à règles » : brief du matin, réponses aux questions rapides, bilan hebdo et titres
 * de graphiques qui disent la conclusion. Fonctionne sans clé API ; le coach IA prend le relais
 * quand une clé est configurée. Toujours une action, jamais de culpabilisation, jamais de diagnostic.
 */
import { CONFIG } from '../scoring/config.js';
import { mean, round } from '../scoring/stats.js';
import { hhmm } from '../scoring/gamification.js';

/** @typedef {import('../scoring/scores.js').DayRecord} DayRecord */
/** @typedef {import('../program/generator.js').PlannedSession} PlannedSession */
/** @typedef {import('../data/profile.js').CoachStyle} CoachStyle */
/** @typedef {import('../scoring/correlations.js').Correlation} Correlation */
/** @typedef {import('../scoring/gamification.js').Progress} Progress */

/** @param {number} minutes */
export function durationText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** @param {'green' | 'yellow' | 'red' | null} zone */
export function zoneWord(zone) {
  return zone === 'green' ? 'vert' : zone === 'yellow' ? 'jaune' : zone === 'red' ? 'rouge' : '—';
}

/**
 * Nombre de jours consécutifs (avant le jour i) où la VFC était sous la base.
 * @param {DayRecord[]} records @param {number} i
 */
function lowHrvRun(records, i) {
  let n = 0;
  for (let k = i - 1; k >= 0; k--) {
    const z = records[k].recoveryDetail.z.hrv;
    if (z === null || z >= 0) break;
    n++;
  }
  return n;
}

/**
 * Phrase sur le facteur principal de la récupération du jour.
 * @param {DayRecord[]} records @param {number} i
 */
export function mainDriver(records, i) {
  const r = records[i];
  const z = r.recoveryDetail.z;
  const lows = lowHrvRun(records, i);
  if (z.hrv !== null && z.hrv >= 0 && lows >= 2) return `Ta batterie nerveuse (VFC) remonte après ${lows} jours bas.`;
  if (z.hrv !== null && z.hrv < -0.5 && lows >= 2) return `Ta batterie nerveuse (VFC) est basse depuis ${lows + 1} jours.`;
  if (r.recoveryDetail.tempPenalty) return 'Ta température de nuit est inhabituelle : ton corps travaille plus que d\'habitude.';
  /** @type {[string, number][]} */
  const contrib = [];
  for (const [k, w] of Object.entries(r.recoveryDetail.weights)) {
    const v = z[k];
    if (v !== null && v !== undefined) contrib.push([k, w * v]);
  }
  contrib.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top = contrib[0];
  if (!top || Math.abs(top[1]) < 0.15) return 'Tes indicateurs sont proches de ton habitude.';
  const good = top[1] > 0;
  switch (top[0]) {
    case 'hrv': return good ? 'Ta batterie nerveuse (VFC) est au-dessus de ton habitude.' : 'Ta batterie nerveuse (VFC) est en dessous de ton habitude.';
    case 'rhr': return good ? 'Ta FC au repos est plus basse que d\'habitude, bon signe.' : 'Ta FC au repos est plus haute que d\'habitude.';
    case 'sleep': return good ? 'Ta nuit a été meilleure que d\'habitude.' : 'Ta nuit a été moins bonne que d\'habitude.';
    case 'resp': return good ? 'Ta respiration nocturne est calme.' : 'Ta respiration nocturne est plus rapide que d\'habitude.';
    default: return '';
  }
}

/** @param {PlannedSession} s */
function sessionLabel(s) {
  return s.title.charAt(0).toLowerCase() + s.title.slice(1);
}

/**
 * Brief du matin (2–3 phrases).
 * @param {{ records: DayRecord[], session: PlannedSession | null, style: CoachStyle }} ctx
 */
export function briefText({ records, session, style }) {
  const i = records.length - 1;
  const r = records[i];
  if (!r) return 'Importe tes données ou essaie la démo pour recevoir ton premier brief.';
  if (r.calibration === 'none') {
    const left = Math.max(1, CONFIG.baseline.minNights - r.nightsInBaseline);
    return `PULSE apprend à te connaître : encore ${left} nuit${left > 1 ? 's' : ''} avant ton premier score de récupération. Porte ta montre la nuit.`;
  }
  if (!r.night || r.recovery === null) {
    return 'Pas de données de sommeil cette nuit : sans elles, pas de récupération aujourd\'hui. Écoute tes sensations et vise un effort modéré.';
  }
  const first = `Récupération ${r.recovery} %.`;
  const driver = mainDriver(records, i);
  const target = r.targetPoint;
  let action;
  if (session && !session.done) {
    if (r.zone === 'red') action = `Ta séance ${sessionLabel(session)} passe en version allégée, effort max ${r.target?.[1] ?? 10}.`;
    else if (r.zone === 'yellow') action = `Fais ta séance ${sessionLabel(session)} sans chercher de record, vise un effort de ${target}.`;
    else action = `Feu vert pour ta séance ${sessionLabel(session)}, vise un effort de ${target}.`;
  } else if (r.zone === 'green') action = `Journée idéale pour pousser : vise un effort de ${target}.`;
  else if (r.zone === 'yellow') action = `Entraîne-toi, mais sans viser de record : effort autour de ${target}.`;
  else action = 'Mobilité, marche, repos actif : ton corps récupère, c\'est aussi de l\'entraînement.';
  if (r.alert?.kind === 'strain') action = 'Journée calme conseillée : marche légère, hydratation, coucher tôt.';
  const tail = style === 'sergent' ? (r.zone === 'red' ? ' Repos, c\'est un ordre.' : ' Pas d\'excuse.') : '';
  return `${first} ${driver} ${action}${tail}`.replace(/\s+/g, ' ').trim();
}

/**
 * Heure de coucher conseillée pour couvrir le besoin.
 * @param {{ needMin: number, wakeMinutes: number, latencyMin: number }} o
 */
export function bedtimeText(o) {
  const bed = o.wakeMinutes - o.needMin - o.latencyMin;
  return `Pour te réveiller à ${hhmm(o.wakeMinutes)} avec 100 % de ton besoin couvert, couche-toi à ${hhmm(Math.round(bed / 5) * 5)}.`;
}

/**
 * Plan de rattrapage de la dette de sommeil.
 * @param {number} debtMin
 */
export function debtPlan(debtMin) {
  if (debtMin < 20) return 'Pas de dette de sommeil : continue comme ça.';
  const nights = Math.ceil(debtMin / 30);
  return `Dette de ${durationText(debtMin)} sur 7 jours. Plan : couche-toi 30 min plus tôt pendant ${nights} soir${nights > 1 ? 's' : ''}, sans grasse matinée qui décale ton rythme.`;
}

/**
 * Titre de graphique qui dit la conclusion (« Ta VFC remonte depuis 3 jours »).
 * @param {'hrv' | 'rhr' | 'resp' | 'sleepScore' | 'recovery' | 'strain' | 'steps'} metric
 * @param {DayRecord[]} records
 */
export function trendTitle(metric, records) {
  const names = { hrv: 'Ta VFC', rhr: 'Ta FC repos', resp: 'Ta respiration', sleepScore: 'Ton sommeil', recovery: 'Ta récupération', strain: 'Ton effort', steps: 'Ton activité' };
  const higherIsBetter = metric !== 'rhr' && metric !== 'resp';
  const vals = records.map((r) => /** @type {number | null} */ (r[metric])).filter((v) => v !== null);
  if (vals.length < 4) return `${names[metric]} : pas encore assez de données`;
  // Série de hausses / baisses sur les derniers jours
  let ups = 0;
  let downs = 0;
  for (let k = vals.length - 1; k > 0; k--) {
    if (vals[k] > vals[k - 1]) { if (downs) break; ups++; } else if (vals[k] < vals[k - 1]) { if (ups) break; downs++; } else break;
  }
  const ref = /** @type {number} */ (mean(vals.slice(-30)));
  const last = vals[vals.length - 1];
  const rel = (last - ref) / Math.abs(ref || 1);
  if (ups >= 2) return `${names[metric]} ${metric === 'rhr' || metric === 'resp' ? 'monte' : 'remonte'} depuis ${ups} jours`;
  if (downs >= 2) return `${names[metric]} baisse depuis ${downs} jours`;
  if (Math.abs(rel) < 0.04) return `${names[metric]} est stable, proche de ton habitude`;
  const good = higherIsBetter ? rel > 0 : rel < 0;
  return `${names[metric]} est ${rel > 0 ? 'au-dessus' : 'en dessous'} de ta moyenne${good ? ', bon signe' : ''}`;
}

/**
 * Réponses du coach à règles aux questions rapides.
 * @param {'tired' | 'train' | 'week' | 'sleep'} kind
 * @param {{ records: DayRecord[], session: PlannedSession | null, correlations: Correlation[], style: CoachStyle, wakeMinutes: number, tonightNeedMin: number, latencyMin: number }} ctx
 */
export function quickAnswer(kind, ctx) {
  const { records } = ctx;
  const r = records[records.length - 1];
  if (!r) return 'Je n\'ai pas encore de données. Importe ton export Apple Santé ou essaie la démo.';
  const last7 = records.slice(-7);
  const prev7 = records.slice(-14, -7);
  if (kind === 'tired') {
    const reasons = [];
    if (r.night && r.night.asleepMin < r.needMin - 30) reasons.push(`ta nuit (${durationText(r.night.asleepMin)}) n'a pas couvert ton besoin (${durationText(r.needMin)})`);
    if (r.debtMin >= 45) reasons.push(`tu as accumulé ${durationText(r.debtMin)} de dette de sommeil sur 7 jours`);
    if (r.recoveryDetail.z.hrv !== null && r.recoveryDetail.z.hrv < -0.7) reasons.push('ta batterie nerveuse (VFC) est sous ton habitude');
    if (r.recoveryDetail.z.rhr !== null && r.recoveryDetail.z.rhr > 0.7) reasons.push('ta FC au repos est plus haute que d\'habitude');
    if (r.acwr !== null && r.acwr > CONFIG.load.optimal[1]) reasons.push(`ta charge d'entraînement des 7 derniers jours est élevée (ratio ${r.acwr})`);
    if ((r.pillars.regularity ?? 100) < 50) reasons.push('tes horaires de coucher ont beaucoup bougé');
    const corr = ctx.correlations[0];
    if (!reasons.length) return `Rien d'anormal dans tes données : récupération ${r.recovery ?? '—'} %, nuit de ${r.night ? durationText(r.night.asleepMin) : '—'}. La fatigue peut venir d'ailleurs (stress, alimentation, hydratation). Si elle dure, parles-en à un médecin.`;
    return `Plusieurs pistes dans tes données : ${reasons.join(' ; ')}.${corr ? ` À noter : ${corr.text.charAt(0).toLowerCase()}${corr.text.slice(1)}` : ''} Action : ${r.debtMin >= 45 ? 'couche-toi 30 min plus tôt ce soir.' : 'journée plus légère et coucher régulier ce soir.'}`;
  }
  if (kind === 'train') {
    if (r.recovery === null) return 'Sans données de nuit, je ne peux pas calculer ta récupération. Fais une séance modérée et écoute tes sensations.';
    const t = r.target ? `${r.target[0]} à ${r.target[1]}` : '—';
    if (r.alert?.kind === 'strain') return `Je te conseille de lever le pied aujourd'hui : ${r.alert.text}`;
    const s = ctx.session && !ctx.session.done ? ` Ta séance prévue : ${ctx.session.title}${r.zone === 'red' ? ' (version allégée)' : ''}.` : '';
    if (r.zone === 'green') return `Oui ! Récupération ${r.recovery} % (vert). Effort conseillé : ${t}.${s}`;
    if (r.zone === 'yellow') return `Oui, mais modérément. Récupération ${r.recovery} % (jaune). Effort conseillé : ${t}, sans viser de record.${s}`;
    return `Plutôt repos actif. Récupération ${r.recovery} % (rouge). Effort conseillé : ${t} : marche, mobilité, vélo très tranquille.${s}`;
  }
  if (kind === 'week') {
    const avg = (/** @type {DayRecord[]} */ rs, /** @type {(r: DayRecord) => number | null} */ f) => {
      const v = rs.map(f).filter((x) => x !== null).map(Number);
      return v.length ? /** @type {number} */ (mean(v)) : null;
    };
    const rec = avg(last7, (x) => x.recovery);
    const recPrev = avg(prev7, (x) => x.recovery);
    const sl = avg(last7, (x) => (x.night ? x.night.asleepMin : null));
    const strain = avg(last7, (x) => x.strain);
    const green = last7.filter((x) => x.zone === 'green').length;
    const red = last7.filter((x) => x.zone === 'red').length;
    const workouts = last7.reduce((a, x) => a + x.workouts.length, 0);
    const evo = rec !== null && recPrev !== null ? ` (${rec >= recPrev ? '+' : ''}${round(rec - recPrev)} pts vs la semaine d'avant)` : '';
    return `Ta semaine : récupération moyenne ${rec === null ? '—' : round(rec)} %${evo}, ${green} jour${green > 1 ? 's' : ''} vert${green > 1 ? 's' : ''} et ${red} rouge${red > 1 ? 's' : ''}. Sommeil moyen ${sl === null ? '—' : durationText(sl)}, ${workouts} séance${workouts > 1 ? 's' : ''}, effort moyen ${strain === null ? '—' : round(strain, 1)}. ${red >= 3 ? 'Beaucoup de rouge : priorité au sommeil cette semaine.' : green >= 4 ? 'Belle semaine, tu peux augmenter un peu la charge.' : 'Semaine équilibrée : garde ce rythme.'}`;
  }
  // sleep
  const tips = [];
  const reg = mean(last7.map((x) => x.pillars.regularity).filter((v) => v !== null).map(Number));
  if (reg !== null && reg < 60) tips.push('garde la même heure de coucher à ±30 min, même le week-end');
  const dur = mean(last7.map((x) => x.pillars.duration).filter((v) => v !== null).map(Number));
  if (dur !== null && dur < 90) tips.push(`vise ${durationText(ctx.tonightNeedMin)} de sommeil : ${bedtimeText({ needMin: ctx.tonightNeedMin, wakeMinutes: ctx.wakeMinutes, latencyMin: ctx.latencyMin }).toLowerCase()}`);
  for (const c of ctx.correlations.filter((x) => x.diffPct < 0).slice(0, 2)) tips.push(`limite : ${c.text.charAt(0).toLowerCase()}${c.text.slice(1)}`);
  if (!tips.length) tips.push('ton sommeil est solide : chambre fraîche et sombre, et garde tes horaires');
  return `Pour mieux dormir : ${tips.join(' ; ')}.`;
}

/**
 * Bilan hebdo à règles (chaque lundi) : ce qui a marché, ce qui a baissé, 3 actions.
 * @param {DayRecord[]} records @param {Correlation[]} correlations
 */
export function weeklyReview(records, correlations) {
  const last7 = records.slice(-7);
  const prev7 = records.slice(-14, -7);
  /** @param {DayRecord[]} rs @param {(r: DayRecord) => number | null} f */
  const avg = (rs, f) => {
    const v = rs.map(f).filter((x) => x !== null).map(Number);
    return v.length ? /** @type {number} */ (mean(v)) : null;
  };
  const metrics = [
    { label: 'récupération', f: (/** @type {DayRecord} */ r) => r.recovery, unit: ' pts', better: 1 },
    { label: 'score sommeil', f: (/** @type {DayRecord} */ r) => r.sleepScore, unit: ' pts', better: 1 },
    { label: 'VFC', f: (/** @type {DayRecord} */ r) => r.hrv, unit: ' ms', better: 1 },
    { label: 'FC repos', f: (/** @type {DayRecord} */ r) => r.rhr, unit: ' bpm', better: -1 },
    { label: 'régularité du coucher', f: (/** @type {DayRecord} */ r) => r.pillars.regularity, unit: ' pts', better: 1 },
    { label: 'pas par jour', f: (/** @type {DayRecord} */ r) => r.steps, unit: '', better: 1 },
  ];
  const worked = [];
  const dropped = [];
  for (const m of metrics) {
    const a = avg(last7, m.f);
    const b = avg(prev7, m.f);
    if (a === null || b === null || b === 0) continue;
    const delta = a - b;
    const rel = delta / Math.abs(b);
    if (Math.abs(rel) < 0.04) continue;
    const txt = `${m.label} ${delta > 0 ? '+' : ''}${m.label === 'pas par jour' ? Math.round(delta) : round(delta, 1)}${m.unit}`;
    if (delta * m.better > 0) worked.push(txt);
    else dropped.push(txt);
  }
  const actions = [];
  const debt = last7.at(-1)?.debtMin ?? 0;
  if (debt >= 45) actions.push(`Rembourse ta dette de sommeil (${durationText(debt)}) : 30 min plus tôt au lit 3 soirs.`);
  if ((avg(last7, (r) => r.pillars.regularity) ?? 100) < 60) actions.push('Fixe une heure de coucher et tiens-la 5 soirs sur 7.');
  const acwr = last7.at(-1)?.acwr ?? null;
  if (acwr !== null && acwr > CONFIG.load.optimal[1]) actions.push('Ta charge monte vite : remplace une séance intense par une séance facile.');
  else if (acwr !== null && acwr < CONFIG.load.optimal[0]) actions.push('Ta charge baisse : ajoute une séance facile pour garder la forme.');
  const corr = correlations.find((c) => c.diffPct < 0);
  if (corr) actions.push(`Teste une semaine sans ${corr.factor === 'alcohol' ? 'alcool' : corr.factor === 'screens' ? 'écrans le soir' : corr.factor === 'lateCaffeine' ? 'café après 14 h' : corr.factor === 'lateMeal' ? 'repas tardif' : 'soirée stressante'} et compare.`);
  actions.push('Remplis le journal du soir : 10 secondes qui rendent tes conseils plus précis.');
  return { worked, dropped, actions: actions.slice(0, 3) };
}

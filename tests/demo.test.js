// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo, createRng } from '../site/js/data/demo.js';
import { validateSample, validateWorkout, validateJournalEntry, localDateKey } from '../site/js/data/schema.js';

/** @typedef {import('../site/js/data/schema.js').Sample} Sample */

// 10 nov. 2026, 9 h 30 heure de Paris : la période couvre le passage à l'heure d'hiver (25 oct.).
const END = new Date(2026, 10, 10, 9, 30);
const demo = generateDemo({ end: END });

/** @param {number[]} xs */
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Regroupe les mesures nocturnes par nuit (fenêtre « au lit »), indexées par la date du réveil.
 * @param {Sample[]} samples
 */
function nights(samples) {
  const inBed = samples.filter((s) => s.type === 'sleep' && s.value === 'in_bed');
  /** @type {Map<string, { start: number, end: number, hrv: number[], hr: number[], temp: number[], asleepMin: number, deepMin: number, remMin: number }>} */
  const out = new Map();
  for (const b of inBed) {
    out.set(localDateKey(b.end), { start: b.start, end: b.end, hrv: [], hr: [], temp: [], asleepMin: 0, deepMin: 0, remMin: 0 });
  }
  for (const s of samples) {
    for (const n of out.values()) {
      if (s.start < n.start || s.start >= n.end) continue;
      if (s.type === 'hrv') n.hrv.push(s.value);
      else if (s.type === 'hr') n.hr.push(s.value);
      else if (s.type === 'wrist_temp') n.temp.push(s.value);
      else if (s.type === 'sleep' && s.value !== 'in_bed' && s.value !== 'awake') {
        const min = (s.end - s.start) / 60000;
        n.asleepMin += min;
        if (s.value === 'deep') n.deepMin += min;
        if (s.value === 'rem') n.remMin += min;
      }
      break;
    }
  }
  return out;
}

const byNight = nights(demo.samples);
const truthByDate = new Map(demo.truth.map((t) => [t.date, t]));

describe('générateur démo — structure', () => {
  test('est déterministe pour une même graine et une même date', () => {
    const again = generateDemo({ end: END });
    assert.equal(JSON.stringify(again), JSON.stringify(demo));
    const other = generateDemo({ end: END, seed: 7 });
    assert.notEqual(JSON.stringify(other.samples.slice(0, 50)), JSON.stringify(demo.samples.slice(0, 50)));
  });

  test('toutes les données respectent le format commun', () => {
    for (const s of demo.samples) {
      const r = validateSample(s);
      assert.ok(r.ok, `${JSON.stringify(s)} → ${r.errors.join(', ')}`);
    }
    for (const w of demo.workouts) assert.ok(validateWorkout(w).ok, JSON.stringify(w));
    for (const j of demo.journal) assert.ok(validateJournalEntry(j).ok, JSON.stringify(j));
  });

  test('couvre 90 jours consécutifs jusqu\'à ce matin, sans rien dans le futur', () => {
    assert.equal(demo.truth.length, 90);
    assert.equal(demo.truth.at(-1)?.date, '2026-11-10');
    for (let i = 1; i < demo.truth.length; i++) {
      const prev = new Date(`${demo.truth[i - 1].date}T12:00:00`);
      const cur = new Date(`${demo.truth[i].date}T12:00:00`);
      assert.equal(Math.round((cur.getTime() - prev.getTime()) / 86400000), 1, `trou entre ${demo.truth[i - 1].date} et ${demo.truth[i].date}`);
    }
    const end = END.getTime();
    assert.ok(demo.samples.every((s) => s.start <= end && s.end <= end));
    assert.ok(demo.workouts.every((w) => w.end <= end));
    for (let i = 1; i < demo.samples.length; i++) assert.ok(demo.samples[i - 1].start <= demo.samples[i].start);
  });

  test('volume raisonnable pour le stockage du navigateur', () => {
    assert.ok(demo.samples.length > 20000 && demo.samples.length < 60000, `${demo.samples.length} mesures`);
  });

  test('le générateur aléatoire suit une loi normale plausible', () => {
    const rng = createRng(1);
    const xs = Array.from({ length: 20000 }, () => rng.normal(10, 2));
    const m = mean(xs);
    const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    assert.ok(Math.abs(m - 10) < 0.05, `moyenne ${m}`);
    assert.ok(Math.abs(sd - 2) < 0.05, `écart-type ${sd}`);
  });
});

describe('générateur démo — réalisme', () => {
  test('les nuits sans montre n\'ont aucune donnée de sommeil', () => {
    const missing = demo.truth.filter((t) => t.missingNight);
    assert.equal(missing.length, 2);
    for (const t of missing) assert.ok(!byNight.has(t.date), `nuit ${t.date} présente`);
    assert.equal(byNight.size, 88);
  });

  test('durée et phases de sommeil plausibles', () => {
    const all = [...byNight.values()];
    const avgH = mean(all.map((n) => n.asleepMin)) / 60;
    assert.ok(avgH > 6.8 && avgH < 8.3, `sommeil moyen ${avgH.toFixed(2)} h`);
    const deepPct = mean(all.map((n) => n.deepMin / n.asleepMin)) * 100;
    const remPct = mean(all.map((n) => n.remMin / n.asleepMin)) * 100;
    assert.ok(deepPct > 10 && deepPct < 25, `profond ${deepPct.toFixed(1)} %`);
    assert.ok(remPct > 15 && remPct < 28, `paradoxal ${remPct.toFixed(1)} %`);
    assert.ok(all.some((n) => n.asleepMin < 6.5 * 60), 'au moins une nuit courte');
  });

  test('la période malade se voit nettement (VFC, FC, température)', () => {
    /** @param {(t: import('../site/js/data/demo.js').DemoDayTruth) => boolean} pred */
    const nightsWhere = (pred) => [...byNight.entries()].filter(([d]) => {
      const t = truthByDate.get(d);
      return t ? pred(t) : false;
    }).map(([, n]) => n);
    const sick = nightsWhere((t) => t.sick);
    const normal = nightsWhere((t) => !t.sick && !t.prodrome && t.alcoholPrevEvening === 0);
    assert.equal(sick.length, 4);
    const hrvRatio = mean(sick.map((n) => mean(n.hrv))) / mean(normal.map((n) => mean(n.hrv)));
    assert.ok(hrvRatio < 0.8, `VFC malade / normale = ${hrvRatio.toFixed(2)}`);
    const hrDiff = mean(sick.map((n) => mean(n.hr))) - mean(normal.map((n) => mean(n.hr)));
    assert.ok(hrDiff > 4, `FC nocturne +${hrDiff.toFixed(1)} bpm`);
    const tempDiff = mean(sick.map((n) => n.temp[0])) - mean(normal.map((n) => n.temp[0]));
    assert.ok(tempDiff > 0.3, `température +${tempDiff.toFixed(2)} °C`);
  });

  test('l\'alcool la veille fait baisser la VFC nocturne', () => {
    const entries = [...byNight.entries()].filter(([d]) => !truthByDate.get(d)?.sick && !truthByDate.get(d)?.prodrome);
    const withAlcohol = entries.filter(([d]) => (truthByDate.get(d)?.alcoholPrevEvening ?? 0) > 0).map(([, n]) => mean(n.hrv));
    const without = entries.filter(([d]) => (truthByDate.get(d)?.alcoholPrevEvening ?? 0) === 0).map(([, n]) => mean(n.hrv));
    assert.ok(withAlcohol.length >= 6, `${withAlcohol.length} soirs avec alcool`);
    const ratio = mean(withAlcohol) / mean(without);
    assert.ok(ratio < 0.93, `VFC après alcool / sans = ${ratio.toFixed(2)}`);
  });

  test('le journal du soir enregistre bien l\'alcool qui pèse sur la nuit suivante', () => {
    let checked = 0;
    for (const j of demo.journal) {
      const next = new Date(`${j.date}T12:00:00`);
      next.setDate(next.getDate() + 1);
      const t = truthByDate.get(localDateKey(next));
      if (!t) continue;
      assert.equal(t.alcoholPrevEvening, j.alcohol, `soir du ${j.date}`);
      checked++;
    }
    assert.ok(checked > 50);
  });

  test('3 à 5 séances par semaine, aucune pendant la maladie', () => {
    const perWeek = demo.workouts.length / (90 / 7);
    assert.ok(perWeek >= 3 && perWeek <= 5, `${perWeek.toFixed(1)} séances / semaine`);
    const sickDates = new Set(demo.truth.filter((t) => t.sick || t.prodrome).map((t) => t.date));
    for (const w of demo.workouts) assert.ok(!sickDates.has(localDateKey(w.start)), `séance le ${localDateKey(w.start)}`);
    const types = new Set(demo.workouts.map((w) => w.type));
    assert.deepEqual([...types].sort(), ['cycling', 'running', 'strength']);
  });

  test('la FC des séances est cohérente avec le profil', () => {
    for (const w of demo.workouts) {
      assert.ok(w.avgHr !== null && w.maxHr !== null);
      assert.ok(w.avgHr > 100 && w.avgHr < 175, `FC moy ${w.avgHr}`);
      assert.ok(w.maxHr <= 190);
    }
  });

  test('contient de la VFC de journée, que les scores devront ignorer', () => {
    const daytimeHrv = demo.samples.filter((s) => s.type === 'hrv' && new Date(s.start).getHours() >= 14 && new Date(s.start).getHours() < 19);
    assert.ok(daytimeHrv.length >= 80);
  });
});

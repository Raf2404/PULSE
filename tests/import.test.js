// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from '../site/js/vendor/fflate.js';
import { HealthXmlParser, parseAppleDate, parseAttributes, workoutTypeOf } from '../site/js/import/healthxml.js';
import { streamExport } from '../site/js/import/stream.js';

/** @typedef {import('../site/js/data/schema.js').Sample} Sample */
/** @typedef {import('../site/js/data/schema.js').Workout} Workout */

const SRC = 'Apple Watch de Rafa&#235;l';
/** @param {string} type @param {string} start @param {string} end @param {string} value @param {string} [unit] @param {string} [source] */
const rec = (type, start, end, value, unit = '', source = SRC) =>
  `<Record type="${type}" sourceName="${source}" sourceVersion="11.0" unit="${unit}" creationDate="${end}" startDate="${start}" endDate="${end}" value="${value}"/>`;

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord)*)>
<!ATTLIST Record type CDATA #REQUIRED unit CDATA #IMPLIED value CDATA #IMPLIED>
]>
<HealthData locale="fr_FR">
 <ExportDate value="2026-11-10 08:00:00 +0100"/>
 <Me HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"/>
 ${rec('HKQuantityTypeIdentifierHeartRate', '2020-01-01 10:00:00 +0100', '2020-01-01 10:00:00 +0100', '70', 'count/min')}
 ${rec('HKQuantityTypeIdentifierHeartRate', '2026-11-09 23:30:00 +0100', '2026-11-09 23:30:00 +0100', '55', 'count/min')}
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="${SRC}" unit="ms" startDate="2026-11-10 02:00:00 +0100" endDate="2026-11-10 02:01:00 +0100" value="48.5">
  <HeartRateVariabilityMetadataList>
   <InstantaneousBeatsPerMinute bpm="52" time="2:00:01,00"/>
  </HeartRateVariabilityMetadataList>
 </Record>
 ${rec('HKQuantityTypeIdentifierOxygenSaturation', '2026-11-10 03:00:00 +0100', '2026-11-10 03:00:00 +0100', '0.97', '%')}
 ${rec('HKQuantityTypeIdentifierAppleSleepingWristTemperature', '2026-11-09 23:20:00 +0100', '2026-11-10 06:50:00 +0100', '96.8', 'degF')}
 ${rec('HKQuantityTypeIdentifierStepCount', '2026-11-10 08:00:00 +0100', '2026-11-10 09:00:00 +0100', '1200', 'count', 'iPhone')}
 ${rec('HKQuantityTypeIdentifierBodyMass', '2026-11-08 07:00:00 +0100', '2026-11-08 07:00:00 +0100', '165', 'lb', 'Balance &amp; Co')}
 ${rec('HKQuantityTypeIdentifierActiveEnergyBurned', '2026-11-09 18:00:00 +0100', '2026-11-09 19:00:00 +0100', '418.4', 'kJ')}
 ${rec('HKQuantityTypeIdentifierBloodGlucose', '2026-11-09 18:00:00 +0100', '2026-11-09 18:00:00 +0100', '5', 'mmol/L')}
 ${rec('HKQuantityTypeIdentifierHeartRate', '2026-11-09 12:00:00 +0100', '2026-11-09 12:00:00 +0100', '999', 'count/min')}
 ${rec('HKCategoryTypeIdentifierSleepAnalysis', '2026-11-09 23:15:00 +0100', '2026-11-10 07:00:00 +0100', 'HKCategoryValueSleepAnalysisInBed')}
 ${rec('HKCategoryTypeIdentifierSleepAnalysis', '2026-11-09 23:30:00 +0100', '2026-11-10 01:00:00 +0100', 'HKCategoryValueSleepAnalysisAsleepCore')}
 ${rec('HKCategoryTypeIdentifierSleepAnalysis', '2026-11-10 01:00:00 +0100', '2026-11-10 01:40:00 +0100', 'HKCategoryValueSleepAnalysisAsleepDeep')}
 ${rec('HKCategoryTypeIdentifierSleepAnalysis', '2026-11-10 01:40:00 +0100', '2026-11-10 02:10:00 +0100', 'HKCategoryValueSleepAnalysisAsleepREM')}
 ${rec('HKCategoryTypeIdentifierMindfulSession', '2026-11-09 21:00:00 +0100', '2026-11-09 21:05:00 +0100', '')}
 ${rec('HKCategoryTypeIdentifierMenstrualFlow', '2026-11-08 00:00:00 +0100', '2026-11-08 00:00:00 +0100', 'HKCategoryValueMenstrualFlowLight', '', 'Santé')}
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="42.5" durationUnit="min" sourceName="${SRC}" startDate="2026-11-09 18:30:00 +0100" endDate="2026-11-09 19:12:30 +0100">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <WorkoutEvent type="HKWorkoutEventTypeSegment" date="2026-11-09 18:30:00 +0100"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2026-11-09 18:30:00 +0100" endDate="2026-11-09 19:12:30 +0100" sum="512.3" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="2026-11-09 18:30:00 +0100" endDate="2026-11-09 19:12:30 +0100" sum="8.21" unit="km"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="2026-11-09 18:30:00 +0100" endDate="2026-11-09 19:12:30 +0100" average="156.4" minimum="98" maximum="178" unit="count/min"/>
  <WorkoutRoute sourceName="${SRC}"><FileReference path="/workout-routes/route_2026-11-09_7.12pm.gpx"/></WorkoutRoute>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="1.5" durationUnit="hr" totalDistance="25" totalDistanceUnit="mi" totalEnergyBurned="600" totalEnergyBurnedUnit="kcal" sourceName="Strava" startDate="2026-11-08 10:00:00 +0100" endDate="2026-11-08 11:30:00 +0100"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="${SRC}" startDate="2019-05-01 10:00:00 +0100" endDate="2019-05-01 10:30:00 +0100">
 </Workout>
</HealthData>
`;

const CUTOFF = Date.UTC(2026, 7, 1);

/** @param {string[]} pieces */
function parse(pieces) {
  /** @type {Sample[]} */
  const samples = [];
  /** @type {Workout[]} */
  const workouts = [];
  const p = new HealthXmlParser({ cutoff: CUTOFF, onSample: (s) => samples.push(s), onWorkout: (w) => workouts.push(w) });
  for (const piece of pieces) p.push(piece);
  return { samples, workouts, stats: p.end() };
}

/** @param {string} s @param {number} size */
function split(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

test('dates Apple avec fuseau', () => {
  assert.equal(parseAppleDate('2026-11-09 23:10:00 +0100'), Date.UTC(2026, 10, 9, 22, 10));
  assert.equal(parseAppleDate('2026-07-01 08:00:00 -0400'), Date.UTC(2026, 6, 1, 12, 0));
  assert.ok(Number.isNaN(parseAppleDate('')));
});

test('attributs et entités XML', () => {
  const a = parseAttributes('Record type="X" sourceName="Balance &amp; Co &#235;" value="1"');
  assert.deepEqual(a, { type: 'X', sourceName: 'Balance & Co ë', value: '1' });
});

test('types de séances', () => {
  assert.equal(workoutTypeOf('HKWorkoutActivityTypeTraditionalStrengthTraining'), 'strength');
  assert.equal(workoutTypeOf('HKWorkoutActivityTypeSoccer'), 'team_sport');
  assert.equal(workoutTypeOf('HKWorkoutActivityTypeCurling'), 'other');
});

test('analyse un export complet, quel que soit le découpage en morceaux', () => {
  const whole = parse([XML]);
  for (const size of [1, 7, 64, 333, 4096]) {
    const r = parse(split(XML, size));
    assert.deepEqual(r.samples, whole.samples, `morceaux de ${size}`);
    assert.deepEqual(r.workouts, whole.workouts, `morceaux de ${size}`);
  }
  const { samples, workouts, stats } = whole;

  // HR ancienne ignorée, HR 999 invalide, glycémie non suivie
  assert.equal(samples.filter((s) => s.type === 'hr').length, 1);
  assert.equal(stats.invalid, 1);
  assert.ok(stats.skippedOld >= 2);

  const byType = (/** @type {string} */ t) => /** @type {Sample} */ (samples.find((s) => s.type === t));
  assert.equal(byType('hrv').value, 48.5);
  assert.equal(byType('hrv').source, 'Apple Watch de Rafaël');
  assert.equal(byType('spo2').value, 97);
  assert.equal(byType('wrist_temp').value, 36);
  assert.equal(byType('weight').value, 74.843);
  assert.equal(byType('weight').source, 'Balance & Co');
  assert.equal(byType('active_energy').value, 100);
  assert.equal(byType('mindful').value, 5);
  assert.equal(byType('menstrual').value, 'light');
  assert.deepEqual(samples.filter((s) => s.type === 'sleep').map((s) => s.value), ['in_bed', 'core', 'deep', 'rem']);

  assert.equal(workouts.length, 2);
  const run = /** @type {Workout} */ (workouts.find((w) => w.type === 'running'));
  assert.deepEqual(
    { d: run.durationMin, c: run.calories, km: run.distanceKm, avg: run.avgHr, max: run.maxHr },
    { d: 42.5, c: 512, km: 8.21, avg: 156, max: 178 },
  );
  const ride = /** @type {Workout} */ (workouts.find((w) => w.type === 'cycling'));
  assert.deepEqual({ d: ride.durationMin, km: ride.distanceKm, c: ride.calories, hr: ride.avgHr }, { d: 90, km: 40.23, c: 600, hr: null });

  assert.deepEqual(stats.sources, ['Apple Watch de Rafaël', 'Balance & Co', 'Santé', 'Strava', 'iPhone']);
  assert.equal(stats.workouts, 2);
});

test('lit export.xml à l\'intérieur d\'un export.zip, en flux', async () => {
  const zip = zipSync({
    'apple_health_export/export_cda.xml': strToU8('<ClinicalDocument>ignoré</ClinicalDocument>'),
    'apple_health_export/export.xml': strToU8(XML),
    'apple_health_export/workout-routes/route.gpx': strToU8('<gpx/>'),
  });
  /** @type {Sample[]} */
  const samples = [];
  const parser = new HealthXmlParser({ cutoff: CUTOFF, onSample: (s) => samples.push(s), onWorkout: () => {} });
  async function* chunks() {
    for (let i = 0; i < zip.length; i += 97) yield zip.subarray(i, i + 97);
  }
  let calls = 0;
  const r = await streamExport(chunks(), { zip: true, onText: (t) => parser.push(t), afterChunk: async () => { calls++; } });
  parser.end();
  assert.ok(r.found);
  assert.equal(r.bytesRead, zip.length);
  assert.ok(calls > 10);
  assert.equal(samples.length, parse([XML]).samples.length);
});

test('un zip sans export.xml est signalé', async () => {
  const zip = zipSync({ 'photos/a.txt': strToU8('rien') });
  async function* chunks() { yield zip; }
  const r = await streamExport(chunks(), { zip: true, onText: () => {} });
  assert.equal(r.found, false);
});

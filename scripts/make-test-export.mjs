// Fabrique un faux export Apple Santé (export.zip) à partir des données démo, pour tester l'import réel.
// Outil de dev : node scripts/make-test-export.mjs <fichier.zip>
import { writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from '../site/js/vendor/fflate.js';
import { generateDemo } from '../site/js/data/demo.js';

const HK = {
  hr: ['HKQuantityTypeIdentifierHeartRate', 'count/min'], rhr: ['HKQuantityTypeIdentifierRestingHeartRate', 'count/min'],
  hrv: ['HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms'], resp: ['HKQuantityTypeIdentifierRespiratoryRate', 'count/min'],
  spo2: ['HKQuantityTypeIdentifierOxygenSaturation', '%'], wrist_temp: ['HKQuantityTypeIdentifierAppleSleepingWristTemperature', 'degC'],
  steps: ['HKQuantityTypeIdentifierStepCount', 'count'], active_energy: ['HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal'],
  exercise_min: ['HKQuantityTypeIdentifierAppleExerciseTime', 'min'], vo2max: ['HKQuantityTypeIdentifierVO2Max', 'mL/min·kg'],
  weight: ['HKQuantityTypeIdentifierBodyMass', 'kg'],
};
const STAGES = { in_bed: 'InBed', core: 'AsleepCore', deep: 'AsleepDeep', rem: 'AsleepREM', awake: 'Awake', asleep: 'AsleepUnspecified' };
const WT = { strength: 'TraditionalStrengthTraining', running: 'Running', cycling: 'Cycling' };

/** Date au format Apple, heure de Paris. @param {number} t */
function appleDate(t) {
  const d = new Date(t);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(d).map((p) => [p.type, p.value]));
  const off = (parts.timeZoneName.replace('GMT', '') || '+00:00').replace(':', '');
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${off}`;
}

const demo = generateDemo({ end: new Date(Date.now()) });
const src = 'Apple Watch de Test';
const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE HealthData [', '<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord)*)>', ']>', '<HealthData locale="fr_FR">'];
lines.push(`<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="${src}" unit="count/min" startDate="2019-01-01 10:00:00 +0100" endDate="2019-01-01 10:00:00 +0100" value="70"/>`);
for (const s of demo.samples) {
  if (s.type === 'sleep') {
    lines.push(`<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${src}" startDate="${appleDate(s.start)}" endDate="${appleDate(s.end)}" value="HKCategoryValueSleepAnalysis${STAGES[s.value]}"/>`);
  } else if (HK[s.type]) {
    const [t, unit] = HK[s.type];
    const v = s.type === 'spo2' ? s.value / 100 : s.value;
    lines.push(`<Record type="${t}" sourceName="${s.type === 'steps' ? 'iPhone' : src}" unit="${unit}" startDate="${appleDate(s.start)}" endDate="${appleDate(s.end)}" value="${v}"/>`);
  }
}
for (const w of demo.workouts) {
  lines.push(`<Workout workoutActivityType="HKWorkoutActivityType${WT[w.type]}" duration="${w.durationMin}" durationUnit="min" sourceName="${src}" startDate="${appleDate(w.start)}" endDate="${appleDate(w.end)}">`);
  if (w.calories) lines.push(`<WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="${w.calories}" unit="kcal"/>`);
  if (w.distanceKm) lines.push(`<WorkoutStatistics type="HKQuantityTypeIdentifierDistance${w.type === 'cycling' ? 'Cycling' : 'WalkingRunning'}" sum="${w.distanceKm}" unit="km"/>`);
  if (w.avgHr) lines.push(`<WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="${w.avgHr}" maximum="${w.maxHr}" unit="count/min"/>`);
  lines.push('</Workout>');
}
lines.push('</HealthData>');
const zip = zipSync({ 'apple_health_export/export.xml': strToU8(lines.join('\n')), 'apple_health_export/export_cda.xml': strToU8('<x/>') });
writeFileSync(process.argv[2] ?? 'test-export.zip', zip);
console.log(`${demo.samples.length} mesures, ${demo.workouts.length} séances → ${(zip.length / 1e6).toFixed(1)} Mo`);

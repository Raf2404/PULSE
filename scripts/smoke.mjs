// Test de bout en bout : parcours complet au format iPhone, avec les en-têtes de netlify.toml (CSP comprise).
// Outil de dev : node scripts/smoke.mjs [--shots]   (captures dans screenshots/)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { startServer } from './serve-test.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const SHOTS = process.argv.includes('--shots');
const { server, base: BASE } = await startServer();
const browser = await chromium.launch();
const iphone = devices['iPhone 15 Pro'];
const context = await browser.newContext({ ...iphone, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(SHOTS ? {} : { deviceScaleFactor: 1 }) });
const page = await context.newPage();

/** @type {string[]} */
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console ${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => { if (!r.url().includes('/api/push')) problems.push(`[requête échouée] ${r.url()}`); });

if (SHOTS) mkdirSync('screenshots', { recursive: true });
let shotN = 0;
/** @param {string} name @param {boolean} [full] */
const shot = async (name, full = true) => {
  if (!SHOTS) return;
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `screenshots/${String(++shotN).padStart(2, '0')}-${name}.png`, fullPage: full });
};
/** @param {string} label */
const step = (label) => console.log(`✓ ${label}`);
/** @param {string} hash */
const nav = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(350); };
const visible = () => page.locator('.screen:not([hidden])');

// ---------------------------------------------------------------- onboarding
await page.goto(`${BASE}/`);
const ob = page.locator('.onboarding');
await ob.getByRole('heading', { name: 'Ton objectif' }).waitFor();
await shot('onboarding-1', false);
await ob.getByText('Mieux dormir').click();
await ob.getByText('Progresser en sport').click();
await ob.getByRole('button', { name: /Suivant/ }).click();
await ob.getByRole('heading', { name: 'Toi et tes sports' }).waitFor();
await ob.getByText('Course').click();
await ob.getByText('Musculation').click();
await ob.locator('input[name="firstName"]').fill('Alex');
await ob.locator('input[name="birthYear"]').fill('1994');
await ob.getByRole('button', { name: /Suivant/ }).click();
await ob.getByRole('heading', { name: 'Tes données' }).waitFor();
await ob.getByRole('button', { name: /Essayer avec 90 jours de démo/ }).click();
await page.getByRole('status').filter({ hasText: 'consentement' }).waitFor();
step('onboarding : la démo exige le consentement santé');
await ob.locator('input[name="healthConsent"]').check();
await ob.getByRole('button', { name: /Essayer avec 90 jours de démo/ }).click();
await page.getByRole('status').filter({ hasText: 'Démo chargée' }).waitFor({ timeout: 60000 });
await ob.getByText('Données démo chargées.').waitFor();
await shot('onboarding-3', false);
await ob.getByRole('button', { name: /Suivant/ }).click();
await ob.getByRole('heading', { name: 'Ton coach' }).waitFor();
await ob.getByText('Direct', { exact: true }).click();
await ob.getByRole('button', { name: /Suivant/ }).click();
await ob.getByRole('heading', { name: 'Ton premier score' }).waitFor();
assert.equal(await ob.locator('.ring').count(), 3);
await shot('onboarding-5', false);
await ob.getByRole('button', { name: /C'est parti/ }).click();
await ob.waitFor({ state: 'detached' });
step('onboarding en 5 écrans terminé (objectifs, profil, consentement + démo, coach, premier score)');

// ---------------------------------------------------------------- Aujourd'hui
const today = visible();
await today.getByRole('heading', { level: 1, name: /Bonjour|Bonsoir/ }).waitFor();
assert.match(await today.locator('h1').textContent() ?? '', /Alex/);
const recoveryLabel = await today.locator('.ring.recovery').getAttribute('aria-label');
assert.match(recoveryLabel ?? '', /Récupération : \d+% sur 100|pas encore de score/);
await today.getByRole('heading', { name: 'Brief du matin' }).waitFor();
await today.getByRole('heading', { name: 'Effort cible du jour' }).waitFor();
assert.equal(await today.locator('.metric-card').count(), 6);
await today.getByRole('heading', { name: 'Ma journée' }).waitFor();
assert.ok(await today.locator('.xp-card').count() === 1);
step(`Aujourd'hui : 3 anneaux (${recoveryLabel}), brief, effort cible, 6 métriques, ma journée, XP`);
await shot('aujourdhui');

await today.locator('.ring.recovery').click();
const sheet = page.locator('.sheet');
await sheet.getByRole('heading', { name: 'Récupération' }).waitFor();
assert.ok(await sheet.locator('.data-table tbody tr').count() === 4);
await shot('detail-recuperation', false);
await sheet.getByRole('button', { name: 'Fermer' }).click();
await sheet.waitFor({ state: 'detached' });
await today.locator('.metric-card').first().click();
await sheet.getByRole('heading', { name: 'Batterie nerveuse' }).waitFor();
await sheet.getByRole('button', { name: 'Fermer' }).click();
step('détails au tap : récupération (z-scores, poids) et métrique (30 jours)');

// ---------------------------------------------------------------- Sommeil
await page.getByRole('navigation').getByRole('link', { name: 'Sommeil' }).click();
const sleep = visible();
await sleep.getByRole('heading', { level: 1, name: 'Sommeil' }).waitFor();
assert.equal(await sleep.locator('.pillar').count(), 4);
await sleep.locator('[data-hypnogram] rect').nth(3).click();
assert.match(await sleep.locator('[data-hyp-caption]').textContent() ?? '', /min$/);
await sleep.getByRole('heading', { name: /Ce soir : couche-toi à/ }).waitFor();
await sleep.getByRole('heading', { name: 'Régularité' }).waitFor();
await sleep.getByRole('tab', { name: 'Mois' }).click();
await page.locator('.screen:not([hidden]) [role="tab"][aria-selected="true"]', { hasText: 'Mois' }).waitFor();
step('Sommeil : 4 piliers, hypnogramme interactif, heure de coucher, régularité, historique mois');
await shot('sommeil');

// Journal du soir : +10 XP
const xpBefore = await page.evaluate(async () => (await import('./js/state.js')).S.progress?.xpTotal ?? 0);
const journal = sleep.locator('.journal-card');
if (!(await journal.getAttribute('open'))) await journal.locator('summary').click();
await journal.getByText('Caféine après 14 h').click();
await journal.locator('[data-step="1"]').click();
await journal.locator('.scale span', { hasText: '4' }).click();
await journal.getByRole('button', { name: /Enregistrer|Mettre à jour/ }).click();
await page.getByRole('status').filter({ hasText: 'Journal enregistré' }).waitFor();
const xpAfter = await page.evaluate(async () => (await import('./js/state.js')).S.progress?.xpTotal ?? 0);
assert.ok(xpAfter >= xpBefore, `XP ${xpBefore} → ${xpAfter}`);
step(`journal du soir enregistré (XP ${xpBefore} → ${xpAfter})`);

// ---------------------------------------------------------------- Sport + programme
await page.getByRole('navigation').getByRole('link', { name: 'Sport' }).click();
const sport = visible();
await sport.getByRole('heading', { level: 1, name: 'Sport' }).waitFor();
await sport.getByRole('heading', { name: 'Séances récentes' }).waitFor();
await sport.getByRole('heading', { name: 'Charge d\'entraînement' }).waitFor();
await sport.getByRole('heading', { name: 'Tes zones cardio' }).waitFor();
await sport.getByRole('heading', { name: 'Records et progression' }).waitFor();
await shot('sport');
await sport.locator('.list-row').first().click();
await sheet.locator('.zones').waitFor();
await sheet.getByRole('button', { name: 'Fermer' }).click();
step('Sport : séances (détail avec zones), charge 7 j / 28 j, zones cardio, records');

await sport.getByRole('link', { name: /Créer mon programme/ }).click();
const creator = visible();
await creator.getByRole('heading', { level: 1, name: 'Créer mon programme' }).waitFor();
await creator.getByText('Haltères').click();
await creator.getByText('Genou').click();
await shot('createur');
await creator.getByRole('button', { name: /Créer le programme/ }).click();
await visible().getByRole('heading', { level: 1, name: 'Mon programme' }).waitFor();
await visible().locator('a.list-row').first().waitFor({ timeout: 10000 }).catch(async () => console.log(await visible().innerText()));
const sessions = await visible().locator('a.list-row').count();
assert.ok(sessions >= 20, `${sessions} séances`);
step(`programme créé : ${sessions} séances planifiées`);
await shot('programme');

// Séance du jour ou prochaine séance : marquer comme faite (+80 XP), date passée ou aujourd'hui seulement
const todayKey = await page.evaluate(async () => (await import('./js/state.js')).todayKey());
const hasToday = await page.evaluate(async (d) => Boolean((await import('./js/state.js')).sessionOn(d)), todayKey);
await nav(`#/sport/seance/${hasToday ? todayKey : (await visible().locator('a.list-row').first().getAttribute('href'))?.split('/').pop()}`);
const sessionView = visible();
await sessionView.getByRole('heading', { name: 'Exercices' }).or(sessionView.getByText(/Course|Vélo/).first()).first().waitFor();
await shot('seance');
if (hasToday) {
  await sessionView.getByRole('tab', { name: 'Allégée' }).click();
  await sessionView.getByText('Version allégée choisie.').waitFor();
  await sessionView.locator('.rpe span', { hasText: '7' }).click();
  await sessionView.getByRole('button', { name: /C'est fait/ }).click();
  await sessionView.getByRole('heading', { name: 'Séance faite' }).waitFor();
  step('séance du jour : version allégée choisie, faite avec ressenti 7/10');
} else {
  step('pas de séance aujourd\'hui (jour de repos du programme) : détail de la prochaine séance affiché');
}
await nav('#/sport/exercices');
assert.ok(await visible().locator('.list-row').count() >= 30);
step('bibliothèque d\'exercices');

// ---------------------------------------------------------------- Coach (à règles, sans clé)
await page.getByRole('navigation').getByRole('link', { name: 'Coach' }).click();
const coach = visible();
await coach.getByRole('heading', { level: 1, name: 'Coach' }).waitFor();
assert.equal(await page.locator('#fab-coach').isHidden(), true);
await coach.getByRole('heading', { name: 'Active le coach IA' }).waitFor();
await coach.getByRole('button', { name: 'Je m\'entraîne aujourd\'hui ?' }).click();
await coach.locator('.msg.coach').first().waitFor();
assert.match(await coach.locator('.msg.coach .msg-text').first().textContent() ?? '', /Effort conseillé|données de nuit|lever le pied/);
await coach.getByRole('button', { name: 'Analyse ma semaine' }).click();
await coach.locator('.msg.coach').nth(1).locator('.chat-card svg').waitFor();
await shot('coach');
step('Coach : questions rapides en un tap (coach à règles) avec carte graphique');

// ---------------------------------------------------------------- Coach IA (API Claude simulée)
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
/** @param {object[]} events */
const sseBody = (events) => events.map((e) => `event: ${/** @type {{ type: string }} */ (e).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
/** @param {object[]} blocks @param {string} stop */
const streamEvents = (blocks, stop) => {
  /** @type {object[]} */
  const ev = [{ type: 'message_start', message: { id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }];
  blocks.forEach((b, index) => {
    const bl = /** @type {Record<string, unknown>} */ (b);
    if (bl.type === 'text') {
      ev.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index, delta: { type: 'text_delta', text: bl.text } });
    } else {
      ev.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: bl.id, name: bl.name, input: {} } }, { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(bl.input) } });
    }
    ev.push({ type: 'content_block_stop', index });
  });
  ev.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }, { type: 'message_stop' });
  return sseBody(ev);
};
/** @type {Record<string, unknown>[]} */
const aiBodies = [];
await page.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, json: { id: 'claude-sonnet-5-5', type: 'model', display_name: 'Claude Sonnet 5.5', created_at: '2026-01-01T00:00:00Z' } });
  const body = req.postDataJSON();
  aiBodies.push(body);
  if (!body.stream) {
    return route.fulfill({ status: 200, headers: CORS, json: { id: 'msg_b', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'Brief IA : journée calme, ta batterie nerveuse remonte doucement. Couche-toi tôt ce soir.' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } });
  }
  const toolDone = body.messages.some((/** @type {{ content: unknown }} */ m) => Array.isArray(m.content) && m.content.some((/** @type {{ type: string }} */ c) => c.type === 'tool_result'));
  return route.fulfill({
    status: 200,
    headers: { ...CORS, 'content-type': 'text/event-stream' },
    body: toolDone
      ? streamEvents([{ type: 'text', text: 'Ta VFC remonte depuis 2 jours. **Action** : séance légère et coucher à 22 h 45.' }], 'end_turn')
      : streamEvents([{ type: 'text', text: 'Je regarde tes 14 derniers jours.' }, { type: 'tool_use', id: 'toolu_1', name: 'show_chart', input: { metric: 'hrv', days: 14 } }, { type: 'tool_use', id: 'toolu_2', name: 'save_memory', input: { key: 'objectif', value: 'mieux dormir en semaine' } }], 'tool_use'),
  });
});
await nav('#/profil/coach');
await visible().locator('input[name="apiKey"]').fill('sk-ant-test-0000');
await visible().getByRole('button', { name: /Vérifier et enregistrer/ }).click();
await page.getByRole('status').filter({ hasText: 'Clé vérifiée' }).waitFor();
await visible().locator('.toggle-row', { hasText: 'résumés chiffrés' }).click();
await page.getByRole('status').filter({ hasText: 'Coach IA autorisé' }).waitFor();
await nav('#/aujourdhui');
await visible().getByText('Brief IA : journée calme').waitFor({ timeout: 15000 });
await visible().getByText('Rédigé par ton coach IA').waitFor();
step('clé API vérifiée, consentement IA, brief du matin rédigé par l\'IA (Haiku)');
await page.getByRole('navigation').getByRole('link', { name: 'Coach' }).click();
await visible().locator('textarea[name="text"]').fill('Comment va ma récupération ?');
await visible().locator('textarea[name="text"]').press('Enter');
const lastCoach = visible().locator('.msg.coach').last();
await lastCoach.getByText('Ta VFC remonte depuis 2 jours.').waitFor({ timeout: 15000 });
await lastCoach.getByRole('img', { name: /VFC/ }).waitFor();
await lastCoach.getByText('mieux dormir en semaine').waitFor();
assert.equal(await lastCoach.locator('strong', { hasText: 'Action' }).count(), 1);
const chatReq = aiBodies.filter((b) => b.stream);
assert.equal(chatReq[0].model, 'claude-sonnet-5-5');
assert.equal(chatReq[0].fallbacks, 'default');
assert.ok(!JSON.stringify(chatReq[0].system).includes('Alex'), 'prénom jamais envoyé à l\'IA');
assert.ok(aiBodies.some((b) => !b.stream && b.model === 'claude-haiku-5-5'));
await shot('coach-ia');
step('coach IA : streaming, outil show_chart (carte graphique), save_memory, prénom jamais envoyé');
await page.unroute('https://api.anthropic.com/**');

// ---------------------------------------------------------------- Profil et sous-pages
await page.getByRole('navigation').getByRole('link', { name: 'Profil' }).click();
const profil = visible();
await profil.getByRole('heading', { level: 1, name: 'Profil' }).waitFor();
await shot('profil');
await nav('#/profil/progression');
await visible().getByRole('heading', { name: 'Attributs' }).waitFor();
const earned = await visible().locator('.badge-tile.earned').count();
assert.ok(earned >= 3, `${earned} badges`);
await shot('progression');
step(`progression : niveau, attributs, séries, défi, ${earned} badges gagnés`);
await nav('#/profil/coach');
await visible().getByRole('heading', { name: 'Ta clé API Claude' }).waitFor();
await visible().locator('input[name="key"]').fill('blessure');
await visible().locator('input[name="value"]').fill('genou gauche fragile');
await visible().getByRole('button', { name: /Ajouter/ }).click();
await visible().getByText('genou gauche fragile').waitFor();
step('coach IA : réglages, mémoire modifiable');
await nav('#/profil/notifications');
await visible().getByRole('heading', { name: 'Rappels' }).waitFor();
await nav('#/profil/donnees');
await visible().getByRole('heading', { name: 'Qualité des données' }).waitFor();
assert.equal(await visible().locator('.quality-row').count(), 9);
await shot('donnees');
await nav('#/profil/raccourcis');
await visible().getByRole('heading', { name: 'Créer le raccourci (une fois, ~10 min)' }).waitFor();
step('notifications, données (qualité par métrique), Raccourcis');

// ---------------------------------------------------------------- Respiration, rapport, stress
await nav('#/respirer');
await visible().getByRole('heading', { level: 1, name: 'Respiration guidée' }).waitFor();
await visible().getByRole('tab', { name: '4-7-8' }).click();
await visible().getByRole('button', { name: /Commencer/ }).click();
await page.waitForTimeout(600);
assert.equal(await visible().locator('[data-breathe-phase]').textContent(), 'Inspire');
await shot('respiration', false);
await visible().getByRole('button', { name: /Arrêter/ }).click();
step('respiration guidée animée (4-7-8)');
await nav('#/rapport');
await visible().locator('.report-sheet').waitFor();
assert.ok(await visible().locator('.report-grid > div').count() === 8);
await shot('rapport');
step('rapport mensuel imprimable');

// Rechargement : tout est conservé, plus d'onboarding
await page.reload();
await visible().getByRole('heading', { level: 1, name: /Rapport mensuel/ }).waitFor();
assert.equal(await page.locator('.onboarding').count(), 0);
step('données, programme et réglages conservés après rechargement');

// ---------------------------------------------------------------- Raccourcis (lien #import=)
const payload = encodeURIComponent('Fréquence cardiaque;55;bpm;2026-11-10T03:00:00+01:00;2026-11-10T03:00:00+01:00;Watch');
await page.goto(`${BASE}/#import=${payload}`);
await page.getByRole('status').filter({ hasText: 'Synchro Raccourcis' }).waitFor({ timeout: 30000 });
step('import Raccourcis par lien #import=');

// ---------------------------------------------------------------- synchro automatique (raccourci → boîte → PULSE)
await nav('#/profil/raccourcis');
await visible().getByRole('button', { name: /Activer la synchro automatique/ }).click();
await page.getByRole('status').filter({ hasText: 'Synchro activée' }).waitFor();
const syncAddress = (await visible().locator('.sync-url').textContent())?.trim() ?? '';
assert.match(syncAddress, /\/api\/sync\/[A-Za-z0-9_-]{43}$/);
await visible().getByRole('button', { name: 'Tester' }).click();
await page.getByRole('status').filter({ hasText: 'Circuit OK' }).waitFor();
await shot('synchro-auto');
// Ce que le raccourci iOS envoie : 2 derniers jours, noms français, dates ISO 8601
const { generateDemo } = await import('../site/js/data/demo.js');
const FR = { hr: 'Fréquence cardiaque', hrv: 'Variabilité de la fréquence cardiaque', rhr: 'Fréquence cardiaque au repos', resp: 'Fréquence respiratoire', spo2: 'Saturation en oxygène', steps: 'Nombre de pas', sleep: 'Analyse du sommeil' };
const STAGE_FR = { in_bed: 'Au lit', core: 'Essentiel', deep: 'Profond', rem: 'Paradoxal', awake: 'Éveillé' };
const nowMs = Date.now();
const recent = generateDemo({ seed: 9 }).samples.filter((x) => x.start >= nowMs - 2 * 86400000 && x.type in FR);
const lines = recent.map((x) => {
  const v = x.type === 'sleep' ? STAGE_FR[/** @type {keyof typeof STAGE_FR} */ (x.value)] : x.type === 'spo2' ? String(Number(x.value) / 100).replace('.', ',') : String(x.value).replace('.', ',');
  return `${FR[/** @type {keyof typeof FR} */ (x.type)]};${v};${x.unit};${new Date(x.start).toISOString()};${new Date(x.end).toISOString()};Apple Watch de Alex`;
}).join('\n');
const deposit = await fetch(syncAddress.replace(/^https?:\/\/[^/]+/, BASE), { method: 'POST', body: lines });
assert.equal(deposit.status, 200);
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.reload();
await page.getByRole('status').filter({ hasText: /Synchro : [\d\s\u202f]+ nouvelles mesures/ }).waitFor({ timeout: 30000 });
const synced = await page.evaluate(async () => {
  const { S } = await import('./js/state.js');
  return { lastSync: S.lastSync, nights: S.records.filter((r) => r.night).length, mode: S.mode };
});
assert.equal(synced.mode, 'apple');
assert.ok((synced.lastSync?.samples ?? 0) > 200 && synced.nights >= 1, JSON.stringify(synced));
const left = await (await fetch(syncAddress.replace(/^https?:\/\/[^/]+/, BASE))).json();
assert.equal(left.items.length, 0, 'données supprimées du serveur après relève');
step(`synchro automatique : dépôt du raccourci relevé à l'ouverture (${synced.lastSync?.samples} mesures), puis effacé du serveur`);

// ---------------------------------------------------------------- PWA et hors connexion
await nav('#/aujourdhui');
const manifest = await (await page.request.get(`${BASE}/manifest.webmanifest`)).json();
assert.equal(manifest.display, 'standalone');
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await page.reload();
await context.setOffline(true);
await page.reload();
await visible().locator('.ring').first().waitFor();
await context.setOffline(false);
step('PWA installable et utilisable hors connexion');

// ---------------------------------------------------------------- Thème clair + mouvement réduit
await nav('#/profil');
await visible().getByRole('tab', { name: 'Clair' }).click();
await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
await nav('#/aujourdhui');
await shot('theme-clair', false);
await nav('#/profil');
await visible().getByRole('tab', { name: 'Sombre' }).click();
await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
step('thème clair / sombre');

// ---------------------------------------------------------------- import réel d'un export.zip (nouvel appareil)
const zipPath = join(mkdtempSync(join(tmpdir(), 'pulse-')), 'export.zip');
execFileSync('node', ['scripts/make-test-export.mjs', zipPath], { env: { ...process.env, TZ: 'Europe/Paris' } });
const fresh = await browser.newContext({ ...iphone, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const fp = await fresh.newPage();
fp.on('pageerror', (e) => problems.push(`[pageerror import] ${e.message}`));
fp.on('console', (m) => { if (m.type() === 'error') problems.push(`[console import] ${m.text()}`); });
await fp.goto(`${BASE}/`);
const ob2 = fp.locator('.onboarding');
await ob2.getByRole('button', { name: /Suivant/ }).click();
await ob2.getByRole('button', { name: /Suivant/ }).click();
await ob2.locator('input[name="healthConsent"]').check();
const [chooser] = await Promise.all([fp.waitForEvent('filechooser'), ob2.getByRole('button', { name: /Importer mon export Apple Santé/ }).click()]);
await chooser.setFiles(zipPath);
await fp.getByRole('status').filter({ hasText: 'Import terminé' }).waitFor({ timeout: 90000 });
const imported = await fp.evaluate(async () => {
  const { S } = await import('./js/state.js');
  return { mode: S.mode, days: S.records.length, scored: S.records.filter((r) => r.recovery !== null).length, workouts: S.records.reduce((a, r) => a + r.workouts.length, 0), sources: S.lastImport?.sources ?? [] };
});
assert.equal(imported.mode, 'apple');
assert.ok(imported.days >= 85 && imported.scored >= 70, JSON.stringify(imported));
assert.ok(imported.workouts >= 30);
assert.ok(imported.sources.includes('Apple Watch de Test'));
await fresh.close();
step(`import réel d'un export.zip (worker + fflate) : ${imported.days} jours, ${imported.scored} scores, ${imported.workouts} séances`);

const reduced = await browser.newContext({ ...iphone, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const rp = await reduced.newPage();
rp.on('pageerror', (e) => problems.push(`[pageerror réduit] ${e.message}`));
await rp.goto(`${BASE}/`);
await rp.locator('.reveal').first().waitFor();
assert.equal(await rp.locator('.reveal').first().evaluate((el) => getComputedStyle(el).animationName), 'fade-in');
await reduced.close();
step('prefers-reduced-motion : simples fondus');

await browser.close();
server.close();

const unexpected = problems.filter((p) => !p.includes('net::ERR_INTERNET_DISCONNECTED') && !p.includes('Rappels non synchronisés'));
if (unexpected.length) {
  console.error(`\nProblèmes détectés :\n${unexpected.join('\n')}`);
  process.exit(1);
}
console.log('\nAucune erreur console, aucune violation CSP.');

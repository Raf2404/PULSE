// Test de fumée de bout en bout : sert site/ en local avec les en-têtes de netlify.toml (CSP comprise),
// pilote un navigateur au format iPhone et enregistre des captures dans screenshots/.
// Outil de dev : node scripts/smoke.mjs [--shots]
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const ROOT = 'site';
const SHOTS = process.argv.includes('--shots');
const toml = readFileSync('netlify.toml', 'utf8');
const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)?.[1];
assert.ok(csp, 'CSP introuvable dans netlify.toml');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Security-Policy': csp,
    'Cache-Control': 'no-cache',
  });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, 'localhost', () => r(undefined)));
const address = server.address();
const BASE = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;

const browser = await chromium.launch();
const iphone = devices['iPhone 15 Pro'];
const context = await browser.newContext({ ...iphone, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(SHOTS ? {} : { deviceScaleFactor: 1 }) });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console ${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => problems.push(`[requête échouée] ${r.url()}`));

if (SHOTS) mkdirSync('screenshots', { recursive: true });
/** @param {string} name */
const shot = async (name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(1500); // fin des animations
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
};
/** @param {string} label */
const step = (label) => console.log(`✓ ${label}`);

// 1. Premier lancement : pas de données
await page.goto(`${BASE}/`);
await page.getByRole('heading', { name: 'Bonjour' }).waitFor();
await page.getByText('Commence par tes données').waitFor();
assert.equal(await page.locator('.ring').count(), 3);
assert.equal(await page.getByRole('img', { name: /Récupération : pas encore de score/ }).count(), 1);
step('accueil vide : 3 anneaux sans score et invitation à charger des données');
await shot('1-accueil-vide');

// 2. Chargement de la démo
await page.getByRole('button', { name: /Essayer avec 90 jours de démo/ }).click();
await page.getByRole('status').filter({ hasText: 'Démo chargée' }).waitFor({ timeout: 30000 });
await page.getByRole('heading', { name: 'Dernière nuit' }).waitFor();
const toastText = await page.getByRole('status').textContent();
step(`démo chargée (${toastText?.trim()})`);
assert.match(await page.locator('.metrics').textContent() ?? '', /\d+ h \d{2}/);
assert.equal(await page.locator('.badge.demo').count(), 1);
step('dernière nuit affichée (durée, VFC, FC repos) + badge Démo');
await shot('2-accueil-demo');

// 3. Les données survivent au rechargement
await page.reload();
await page.getByRole('heading', { name: 'Dernière nuit' }).waitFor();
step('données conservées après rechargement');

// 4. Navigation dans les 5 onglets
for (const [tab, title] of [['Sommeil', 'Sommeil'], ['Sport', 'Sport'], ['Coach', 'Coach'], ['Profil', 'Profil'], ["Aujourd'hui", 'Bonjour']]) {
  await page.getByRole('navigation').getByRole('link', { name: tab }).click();
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
  const current = await page.locator('.tabbar a[aria-current="page"]').textContent();
  assert.equal(current?.trim(), tab);
  assert.equal(await page.locator('.screen:not([hidden])').count(), 1);
  if (tab === 'Coach') assert.equal(await page.locator('#fab-coach').isHidden(), true);
  if (SHOTS && tab !== "Aujourd'hui") await shot(`3-${tab.toLowerCase()}`);
}
step('5 onglets accessibles, onglet actif marqué, bouton coach masqué sur l\'onglet Coach');

// 5. Bouton flottant du coach
await page.locator('#fab-coach').click();
await page.getByRole('heading', { level: 1, name: 'Coach' }).waitFor();
step('le bouton flottant ouvre le coach');

// 6. Profil : statistiques puis effacement
await page.goto(`${BASE}/#/profil`);
const profil = page.locator('#screen-profil');
await profil.getByText('Mesures').waitFor();
const samplesText = await profil.locator('.stat-list div', { hasText: 'Mesures' }).locator('dd').textContent();
assert.ok(Number((samplesText ?? '').replace(/\D/g, '')) > 20000, `mesures : ${samplesText}`);
step(`profil : ${samplesText?.trim()} mesures listées`);
await profil.getByRole('button', { name: /Tout effacer/ }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Tout effacer' }).click();
await page.getByRole('status').filter({ hasText: 'effacées' }).waitFor();
await page.goto(`${BASE}/#/aujourdhui`);
await page.getByText('Commence par tes données').waitFor();
step('« Tout effacer » vide bien l\'appareil');

// 7. PWA : manifeste et service worker
const manifest = await (await page.request.get(`${BASE}/manifest.webmanifest`)).json();
assert.equal(manifest.display, 'standalone');
for (const i of manifest.icons) assert.equal((await page.request.get(`${BASE}/${i.src}`)).status(), 200, i.src);
const splashes = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((ls) => ls.map((l) => l.getAttribute('href')));
for (const s of splashes) assert.equal((await page.request.get(`${BASE}/${s}`)).status(), 200, s);
const swReady = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return Boolean(reg.active);
});
assert.ok(swReady);
step(`PWA : manifeste valide, ${manifest.icons.length} icônes, ${splashes.length} écrans de lancement, service worker actif`);

// 8. Hors connexion : l'app s'ouvre depuis le cache
await page.reload(); // la page est maintenant contrôlée par le service worker
await context.setOffline(true);
await page.reload();
await page.getByRole('heading', { name: 'Bonjour' }).waitFor();
await context.setOffline(false);
step('l\'app s\'ouvre hors connexion');

// 9. Mouvement réduit
const reduced = await browser.newContext({ ...iphone, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const rp = await reduced.newPage();
rp.on('pageerror', (e) => problems.push(`[pageerror réduit] ${e.message}`));
await rp.goto(`${BASE}/`);
await rp.getByRole('heading', { name: 'Bonjour' }).waitFor();
const anim = await rp.locator('.reveal').first().evaluate((el) => getComputedStyle(el).animationName);
assert.equal(anim, 'fade-in');
await reduced.close();
step('prefers-reduced-motion : animations remplacées par des fondus');

await browser.close();
server.close();

const unexpected = problems.filter((p) => !p.includes('net::ERR_INTERNET_DISCONNECTED'));
if (unexpected.length) {
  console.error('\nProblèmes détectés :\n' + unexpected.join('\n'));
  process.exit(1);
}
console.log('\nAucune erreur console, aucune violation CSP.');

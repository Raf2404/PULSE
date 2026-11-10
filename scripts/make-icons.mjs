// Génère les icônes PNG et les écrans de lancement iOS à partir de site/icons/icon.svg,
// puis insère les balises <link> des écrans de lancement dans site/index.html.
// Outil de dev : node scripts/make-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const svg = readFileSync('site/icons/icon.svg', 'utf8');
const rings = svg.replace(/<rect[^>]*\/>/, ''); // anneaux seuls, sans le fond arrondi
const BG = '#0a0b0d';

// Écrans d'iPhone actuels : taille CSS (portrait) et densité.
const DEVICES = [
  { w: 440, h: 956, r: 3, name: 'iPhone 16/17 Pro Max' },
  { w: 420, h: 912, r: 3, name: 'iPhone Air' },
  { w: 402, h: 874, r: 3, name: 'iPhone 16 Pro, 17, 17 Pro' },
  { w: 430, h: 932, r: 3, name: 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus' },
  { w: 393, h: 852, r: 3, name: 'iPhone 14 Pro, 15, 15 Pro, 16, 16e' },
  { w: 428, h: 926, r: 3, name: 'iPhone 12/13 Pro Max, 14 Plus' },
  { w: 390, h: 844, r: 3, name: 'iPhone 12, 13, 14' },
  { w: 375, h: 812, r: 3, name: 'iPhone X, XS, 11 Pro, 12/13 mini' },
  { w: 414, h: 896, r: 2, name: 'iPhone XR, 11' },
  { w: 375, h: 667, r: 2, name: 'iPhone SE, 8' },
];

mkdirSync('site/icons/splash', { recursive: true });
const browser = await chromium.launch();
const fontB64 = readFileSync('site/fonts/space-grotesk.woff2').toString('base64');

/**
 * Capture un contenu HTML à la taille CSS w×h et à la densité `scale`.
 * @param {string} body @param {number} w @param {number} h @param {number} scale @param {string} out
 */
async function shot(body, w, h, scale, out) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: SG; src: url('data:font/woff2;base64,${fontB64}'); font-weight: 300 700; }
    html, body { margin: 0; width: ${w}px; height: ${h}px; background: ${BG}; overflow: hidden; }
    .c { width: 100%; height: 100%; display: grid; place-items: center; align-content: center; }
    .wm { font-family: SG; font-weight: 600; color: #f5f7fa; letter-spacing: 0.2em; }
    svg { display: block; }
  </style></head><body>${body}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(out, await page.screenshot({ type: 'png' }));
  await ctx.close();
}

/** Icône pleine (fond carré, iOS arrondit lui-même les coins). @param {number} size @param {number} ringScale */
const squareIcon = (size, ringScale) => `<div class="c">${rings.replace('<svg ', `<svg width="${size * ringScale}" height="${size * ringScale}" `)}</div>`;

await shot(squareIcon(192, 1), 192, 192, 1, 'site/icons/icon-192.png');
await shot(squareIcon(512, 1), 512, 512, 1, 'site/icons/icon-512.png');
await shot(squareIcon(180, 1), 180, 180, 1, 'site/icons/apple-touch-icon.png');
await shot(squareIcon(512, 0.72), 512, 512, 1, 'site/icons/icon-maskable-512.png'); // zone de sécurité

const links = [];
for (const d of DEVICES) {
  const file = `icons/splash/splash-${d.w * d.r}x${d.h * d.r}.png`;
  const logo = Math.round(d.w * 0.3);
  const body = `<div class="c">${rings.replace('<svg ', `<svg width="${logo}" height="${logo}" `)}
    <div class="wm" style="font-size:${Math.round(d.w * 0.06)}px;margin-top:${Math.round(d.w * 0.06)}px">PULSE</div></div>`;
  await shot(body, d.w, d.h, d.r, `site/${file}`);
  links.push(`  <!-- ${d.name} -->\n  <link rel="apple-touch-startup-image" href="${file}" media="(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.r}) and (orientation: portrait)">`);
}
await browser.close();

const html = readFileSync('site/index.html', 'utf8');
const updated = html.replace(/  <!-- SPLASH:START -->[\s\S]*?<!-- SPLASH:END -->/, `  <!-- SPLASH:START -->\n${links.join('\n')}\n  <!-- SPLASH:END -->`);
writeFileSync('site/index.html', updated);
console.log(`4 icônes et ${DEVICES.length} écrans de lancement générés`);

// Copie les icônes Lucide utilisées par le site dans site/js/ui/icons.js (outil de dev, à relancer
// seulement si on ajoute une icône) : node scripts/build-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgDir = require.resolve('lucide-static/package.json').replace(/package\.json$/, '');
const version = JSON.parse(readFileSync(`${pkgDir}package.json`, 'utf8')).version;

const NAMES = [
  'sun', 'moon', 'dumbbell', 'sparkles', 'user-round', 'upload', 'trash-2', 'database', 'info',
  'flask-conical', 'smartphone', 'chevron-right', 'activity', 'heart-pulse', 'wind', 'thermometer',
  'footprints', 'shield-check', 'hourglass', 'bed', 'share', 'x', 'circle-alert', 'battery-medium', 'flame',
];

const entries = NAMES.map((name) => {
  const svg = readFileSync(`${pkgDir}icons/${name}.svg`, 'utf8');
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'))
    .replace(/\s*\n\s*/g, '')
    .trim();
  return `  '${name}': '${inner.replace(/'/g, "\\'")}',`;
});

const out = `// @ts-check
// Fichier généré par scripts/build-icons.mjs — ne pas modifier à la main.
// Icônes Lucide v${version} (licence ISC, https://lucide.dev).

/** @type {Record<string, string>} */
const PATHS = {
${entries.join('\n')}
};

/** @typedef {keyof typeof PATHS} IconName */

/**
 * Renvoie le code SVG d'une icône (trait 1,75 px par défaut, couleur = currentColor).
 * @param {string} name
 * @param {{ size?: number, stroke?: number, label?: string }} [opts]
 */
export function icon(name, opts = {}) {
  const size = opts.size ?? 22;
  const stroke = opts.stroke ?? 1.75;
  const a11y = opts.label ? \`role="img" aria-label="\${opts.label}"\` : 'aria-hidden="true"';
  return \`<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="\${size}" height="\${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="\${stroke}" stroke-linecap="round" stroke-linejoin="round" \${a11y}>\${PATHS[name] ?? ''}</svg>\`;
}
`;

writeFileSync('site/js/ui/icons.js', out);
console.log(`${NAMES.length} icônes écrites dans site/js/ui/icons.js`);

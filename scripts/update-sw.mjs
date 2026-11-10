// Régénère la liste SHELL de site/sw.js (fichiers gardés pour le mode hors ligne) et change la version du cache.
// Outil de dev, à lancer après l'ajout d'un fichier au site : node scripts/update-sw.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const files = walk('site').map((p) => relative('site', p).split('\\').join('/'))
  .filter((p) => !p.startsWith('icons/splash') && !p.endsWith('.txt') && !p.endsWith('.d.ts') && p !== 'sw.js' && p !== 'js/vendor/anthropic.js')
  .sort();
let sw = readFileSync('site/sw.js', 'utf8');
sw = sw.replace(/const SHELL = \[[\s\S]*?\];/, `const SHELL = [\n${['./', ...files].map((f) => `  '${f}',`).join('\n')}\n];`);
sw = sw.replace(/const CACHE = 'pulse-shell-v(\d+)';/, (_, v) => `const CACHE = 'pulse-shell-v${Number(v) + 1}';`);
writeFileSync('site/sw.js', sw);
console.log(`${files.length + 1} fichiers dans SHELL`);

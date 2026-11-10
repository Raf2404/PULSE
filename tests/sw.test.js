// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test('le service worker garde hors ligne tous les fichiers de l\'app', () => {
  const sw = readFileSync('site/sw.js', 'utf8');
  const listed = new Set([...sw.matchAll(/^ {2}'([^']+)',$/gm)].map((m) => m[1]));
  const files = walk('site').map((p) => relative('site', p).split('\\').join('/'))
    .filter((p) => !p.startsWith('icons/splash') && !p.endsWith('.txt') && !p.endsWith('.d.ts') && p !== 'sw.js' && p !== 'js/vendor/anthropic.js');
  const missing = files.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `à ajouter dans SHELL (site/sw.js) : ${missing.join(', ')}`);
  for (const f of listed) if (f !== './') assert.ok(files.includes(f), `fichier listé mais absent : ${f}`);
});

// Empaquette le SDK officiel Anthropic en un seul module ES pour le site (pas d'étape de build côté site).
// Outil de dev, à relancer pour mettre à jour le SDK : node scripts/vendor-anthropic.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'node_modules/@anthropic-ai/sdk';
const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
await build({
  stdin: { contents: "export { default as Anthropic } from '@anthropic-ai/sdk';", resolveDir: process.cwd(), loader: 'js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['safari16', 'chrome110'],
  minify: true,
  legalComments: 'none',
  outfile: 'site/js/vendor/anthropic.js',
  banner: { js: `// @anthropic-ai/sdk ${pkg.version} (MIT) — empaqueté par scripts/vendor-anthropic.mjs` },
});
writeFileSync('site/js/vendor/LICENSE-anthropic-sdk.txt', readFileSync(`${dir}/LICENSE`));
console.log(`SDK ${pkg.version} empaqueté`);

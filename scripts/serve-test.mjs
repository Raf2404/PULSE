// Petit serveur statique de test : sert site/ avec les en-têtes de netlify.toml (CSP comprise).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { handleMailbox, memoryStore } from '../netlify/functions/lib/mailbox.mjs';

const csp = /Content-Security-Policy = "([^"]+)"/.exec(readFileSync('netlify.toml', 'utf8'))?.[1] ?? '';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

/** @param {number} [port] */
export function startServer(port = 0) {
  const syncStore = memoryStore();
  const server = createServer(async (req, res) => {
    // Boîte de synchro (comme la fonction Netlify /api/sync/*), en mémoire.
    if (req.url?.startsWith('/api/sync/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(`http://localhost${req.url}`, { method: req.method, body: body && req.method !== 'GET' ? body : undefined });
      const r = await handleMailbox(request, req.url.split('/').pop() ?? '', syncStore);
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(await r.text());
      return;
    }
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join('site', path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp, 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, 'localhost', () => {
    const a = server.address();
    resolve({ server, base: `http://localhost:${typeof a === 'object' && a ? a.port : port}` });
  }));
}

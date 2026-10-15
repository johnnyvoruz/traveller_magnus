// A small static server for the jig. Serves versionvideo/ and maps /gsap/ to the installed GSAP build.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  if (clean.startsWith('..')) return null;
  if (clean.startsWith('gsap')) return join(ROOT, 'node_modules', 'gsap', 'dist', clean.slice('gsap'.length));
  return join(ROOT, clean || 'scene/index.html');
}

export function serve(port = 0) {
  const server = createServer(async (req, res) => {
    const file = resolvePath(new URL(req.url, 'http://jig').pathname);
    if (!file) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end(`Not found: ${req.url}`);
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

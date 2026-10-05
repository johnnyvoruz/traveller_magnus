import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tileRoot = path.resolve(repoRoot, 'assets', 'geomorphs');
const PREFIX = '/dev/geomorphs/';

function send(res: ServerResponse, type: string, body: Buffer): void {
    res.statusCode = 200;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
}

function fileFor(url: string): string | null {
    if (!url.startsWith(PREFIX)) return null;
    let rel = url.slice(PREFIX.length);
    try {
        rel = decodeURIComponent(rel);
    } catch {
        return null;
    }
    if (rel.length === 0 || rel.includes('\0')) return null;
    const file = path.resolve(tileRoot, rel);
    const fromRoot = path.relative(tileRoot, file);
    if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return null;
    return file;
}

function contentType(file: string): string {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.json') return 'application/json; charset=utf-8';
    return 'application/octet-stream';
}

/** Dev server only. Tile files are read from disk and are not part of the client graph. */
export function geomorphDev(): Plugin {
    return {
        name: 'geomorph-dev',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url?.split('?')[0];
                if (!url || !url.startsWith(PREFIX)) {
                    next();
                    return;
                }
                const file = fileFor(url);
                if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
                    res.statusCode = 404;
                    res.end('missing');
                    return;
                }
                try {
                    send(res, contentType(file), fs.readFileSync(file));
                } catch (err) {
                    res.statusCode = 500;
                    res.end(err instanceof Error ? err.message : String(err));
                }
            });
        },
    };
}

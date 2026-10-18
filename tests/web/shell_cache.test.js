import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { shellCacheOf, urlsToCache } from '../../apps/web/public/shell_cache.js';

test('the shell cache lists no API, join, or claim URL', () => {
    const asked = [
        '/api/me',
        '/api/universes/1/campaign',
        'https://traveller.voyage/api/campaign',
        '/join/token',
        '/claim/token',
        '/fonts/inter-latin-400-normal.woff2',
        '/',
        '/index.html',
        '/assets/index-abc.js',
        '/favicon.svg',
        '/favicon.ico',
        '/manifest.webmanifest',
        '/truth/v10/manifest.json',
        '/og.png',
        '/sheets/index.html',
    ];
    const cached = urlsToCache(asked);
    const paths = cached.map((url) => new URL(url, 'https://traveller.voyage').pathname);
    assert.equal(paths.some((path) => path.startsWith('/api/')), false);
    assert.equal(paths.some((path) => path.startsWith('/join/')), false);
    assert.equal(paths.some((path) => path.startsWith('/claim/')), false);
    assert.deepEqual(cached, [
        '/fonts/inter-latin-400-normal.woff2',
        '/',
        '/index.html',
        '/assets/index-abc.js',
        '/favicon.svg',
        '/favicon.ico',
        '/manifest.webmanifest',
    ]);
    assert.equal(shellCacheOf('/api/me'), 'network');
    assert.equal(shellCacheOf('/join/abc'), 'network');
    assert.equal(shellCacheOf('/claim/abc'), 'network');
    const worker = readFileSync('apps/web/public/sw.js', 'utf8');
    assert.equal(worker.includes('from \'./shell_cache.js\''), true);
    assert.equal(worker.includes('request.method !== \'GET\''), true);
    assert.equal(worker.includes('skipWaiting'), true);
    assert.equal(worker.includes('clients.claim'), true);
    assert.equal(worker.includes('window.'), false);
    const manifest = JSON.parse(readFileSync('apps/web/public/manifest.webmanifest', 'utf8'));
    assert.equal(manifest.icons[0].src, '/favicon.svg');
    const page = readFileSync('apps/web/index.html', 'utf8');
    assert.equal(page.includes('rel="manifest"'), true);
});

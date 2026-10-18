/**
 * The app shell and the fonts. No offline writes.
 *
 * A deploy is not a stale shell. The document and the other shell files are
 * fetched from the network first, and the cache is only the offline copy.
 * Vite fingerprints the files under /assets/, so a new document asks for new
 * URLs. skipWaiting and clients.claim let a changed worker take the open page.
 * A font URL is not fingerprinted; a changed font bumps SHELL_CACHE.
 */
import { SHELL_CACHE, shellCacheOf } from './shell_cache.js';

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name !== SHELL_CACHE).map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch {
        const hit = await cache.match(request);
        if (hit) return hit;
        if (request.mode === 'navigate') {
            const home = await cache.match('/');
            if (home) return home;
        }
        throw new Error('offline');
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    if (shellCacheOf(request.url) !== 'cache') return;
    event.respondWith(networkFirst(request));
});

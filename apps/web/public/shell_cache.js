/**
 * What the service worker may store. The shell and the fonts only.
 * /api/, /join/ and /claim/ are never stored. Everything else goes to the network.
 * sw.js imports this and does not keep a second list.
 */

export const SHELL_CACHE = 'voyage-shell-v1';

/** 'cache' or 'network'. `url` may be a path or an absolute URL. */
export function shellCacheOf(url) {
    let path = '';
    try {
        path = new URL(url, 'https://traveller.voyage').pathname;
    } catch {
        return 'network';
    }
    if (path === '/api' || path.startsWith('/api/')) return 'network';
    if (path === '/join' || path.startsWith('/join/')) return 'network';
    if (path === '/claim' || path.startsWith('/claim/')) return 'network';
    if (path === '/' || path === '/index.html') return 'cache';
    if (path.startsWith('/assets/')) return 'cache';
    if (path.startsWith('/fonts/')) return 'cache';
    if (path === '/favicon.svg' || path === '/favicon.ico') return 'cache';
    if (path === '/manifest.webmanifest') return 'cache';
    return 'network';
}

/** The URLs from `urls` that the shell cache would store. */
export function urlsToCache(urls) {
    const cached = [];
    for (const url of urls) {
        if (shellCacheOf(url) === 'cache') cached.push(url);
    }
    return cached;
}

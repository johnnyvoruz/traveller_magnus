/** The only module that touches browser globals. Slice 1 A1.1. */

export function devicePixelRatio(): number {
    if (typeof window === 'undefined') return 1;
    return window.devicePixelRatio || 1;
}

/** Fires when the device pixel ratio changes. Returns an unsubscribe. */
export function onDevicePixelRatioChange(fn: () => void): () => void {
    let media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const listen = () => {
        media.removeEventListener('change', listen);
        media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        media.addEventListener('change', listen);
        fn();
    };
    media.addEventListener('change', listen);
    return () => media.removeEventListener('change', listen);
}

export function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function nextFrame(fn: (time: number) => void): number {
    return window.requestAnimationFrame(fn);
}

export function cancelFrame(id: number): void {
    window.cancelAnimationFrame(id);
}

export function now(): number {
    return performance.now();
}

/** Page origin for apiBase. Kept here so views do not touch location. */
export function pageOrigin(): string {
    return location.origin;
}

/** Page origin, or empty where this process has no location. */
export function locationOrigin(): string {
    try {
        return globalThis.location?.origin ?? '';
    } catch {
        return '';
    }
}

/** Leaves this page for url. */
export function assignPage(url: string): void {
    globalThis.location.assign(url);
}

/** The credentials object, or null where this process has no navigator. */
export function webCredentials(): { create?: unknown; get?: unknown } | null {
    try {
        const credentials = globalThis.navigator?.credentials as { create?: unknown; get?: unknown } | undefined;
        return credentials ?? null;
    } catch {
        return null;
    }
}

/** Copies text. Throws when the browser refuses. */
export async function writeClipboard(text: string): Promise<void> {
    await globalThis.navigator.clipboard.writeText(text);
}

/** A document event. No-op where there is no document. Returns the function that stops it. */
export function onDocumentEvent<K extends 'pointerdown' | 'keydown'>(
    type: K,
    fn: (event: DocumentEventMap[K]) => void,
): () => void {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener(type, fn as EventListener);
    return () => document.removeEventListener(type, fn as EventListener);
}

/** Instant jump to the top after a path change. No smooth scroll. */
export function scrollToTop(): void {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

/** Device storage for the panel width. A private window can refuse it. */
export function storageGet(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function storageSet(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // The span stays at the default when storage is blocked.
    }
}

/** This tab's session storage. A private window can refuse it. */
export function sessionGet(key: string): string | null {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

export function sessionSet(key: string, value: string): void {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // The value stays on the page when storage is blocked.
    }
}

export function sessionRemove(key: string): void {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // A later visit asks again.
    }
}

/** The path of this page. Empty where there is no location. */
export function pagePath(): string {
    if (typeof location === 'undefined') return '';
    return location.pathname;
}

/** Replaces the address bar without loading a page. No-op where there is no history. */
export function replaceUrl(url: string): void {
    if (typeof history === 'undefined') return;
    history.replaceState(history.state, '', url);
}

/** Fires when an element's border box changes. Returns an unsubscribe. */
export function observeSize(element: Element, fn: () => void): () => void {
    const observer = new ResizeObserver(() => fn());
    observer.observe(element);
    return () => observer.disconnect();
}

/** An off-screen canvas of the given pixel size (the orbit view's backdrop and sprites). */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/** Something drawDisc can paint into. A 2D canvas context satisfies it. */
export type ImageBlit = {
    drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
};

/** Blit one image. The only drawImage the disc service uses. */
export function blitImage(target: ImageBlit, image: CanvasImageSource, x: number, y: number, w: number, h: number): void {
    target.drawImage(image, x, y, w, h);
}

/** A tile cut out of an atlas bitmap. */
export function sliceBitmap(image: ImageBitmap, sx: number, sy: number, sw: number, sh: number): Promise<ImageBitmap> {
    return createImageBitmap(image, sx, sy, sw, sh);
}

/** Release a transferred bitmap. Other image sources are left alone. */
export function closeBitmap(image: CanvasImageSource): void {
    if (typeof ImageBitmap === 'undefined') return;
    if (image instanceof ImageBitmap) image.close();
}

/**
 * Copy a rectangle out of a canvas into a canvas the caller can keep.
 * Source x and y are top-left, matching drawImage. Null when there is no 2D context.
 */
export function copyCanvasRect(
    source: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
): HTMLCanvasElement | null {
    const copy = createCanvas(Math.max(1, sw), Math.max(1, sh));
    const ctx = copy.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    return copy;
}

/** WebGL2 for the orbit disc. Attributes are js/planet_gl.js:748-749. */
export function webgl2Context(canvas: HTMLCanvasElement | OffscreenCanvas): WebGL2RenderingContext | null {
    return canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
    });
}

/** Dev pages publish a JSON result for a headless driver. */
export function publishAutomationResult(key: string, value: unknown): void {
    (window as unknown as Record<string, unknown>)[key] = value;
}

/** Starts loading an image; done runs once it can be drawn. A failed load never calls done. */
export function loadImage(src: string, done: () => void): HTMLImageElement {
    const image = new Image();
    image.onload = () => done();
    image.src = src;
    return image;
}

/**
 * A worker for the orbit view's line-up search (orbit/alignment.worker.ts). Throws where
 * workers are not available; the caller then searches on the page.
 */
export function startAlignmentWorker(): Worker {
    return new Worker(new URL('../orbit/alignment.worker.ts', import.meta.url), { type: 'module' });
}

/** The CPU surface worker (surface/surface.worker.ts). Throws where workers are not available. */
export function startSurfaceWorker(): Worker {
    return new Worker(new URL('../surface/surface.worker.ts', import.meta.url), { type: 'module' });
}

/** The vanilla disc worker. OffscreenCanvas WebGL2 lives in that file, not on the page. */
export function startDiscWorker(): Worker {
    return new Worker(new URL('../surface/vanilla/gl.worker.ts', import.meta.url), { type: 'module' });
}

/** Campaign row id. `cr_` or `cl_` plus a UUID. The server accepts only that pattern. */
export function newId(prefix: 'cr' | 'cl'): string {
    return prefix + '_' + crypto.randomUUID();
}

/** A number in [0, 1). The platform's own draw, not a seeded generator. */
export function randomUnit(): number {
    return Math.random();
}

/** Fires when the page is being hidden or unloaded. No-op where there is no document. */
export function onPageHide(fn: () => void): () => void {
    if (typeof document === 'undefined') return () => {};
    const onHide = () => fn();
    const onVisibility = () => {
        if (document.visibilityState === 'hidden') fn();
    };
    document.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
        document.removeEventListener('pagehide', onHide);
        document.removeEventListener('visibilitychange', onVisibility);
    };
}

/** False when the browser says it has no network. True where it cannot say. */
/** Saves a blob as a download under the name given, through a link that is pressed and dropped. */
export function saveBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}

export function isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Calls back when the browser goes on or off the network. Returns the function that stops it. */
export function onOnlineChange(fn: (online: boolean) => void): () => void {
    if (typeof addEventListener !== 'function') return () => {};
    const up = () => fn(true);
    const down = () => fn(false);
    addEventListener('online', up);
    addEventListener('offline', down);
    return () => {
        removeEventListener('online', up);
        removeEventListener('offline', down);
    };
}

/** Runs fn as its own task. The returned function cancels it if it has not run. */
export function afterTask(fn: () => void): () => void {
    const handle = setTimeout(fn, 0);
    return () => clearTimeout(handle);
}

/** Runs fn after ms milliseconds. clearTimeout cancels the handle. */
export function later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    return setTimeout(fn, ms);
}

/** Runs fn every ms milliseconds. The returned function stops it. */
export function every(fn: () => void, ms: number): () => void {
    const handle = setInterval(fn, ms);
    return () => clearInterval(handle);
}

/** An element in the page document. */
export function createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
    return document.createElement(tag);
}

/** Long-task entries during a cold paint. No-op where the observer is missing. */
export function observeLongTasks(fn: (duration: number) => void, buffered = true): () => void {
    if (typeof PerformanceObserver === 'undefined') return () => {};
    try {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) fn(entry.duration);
        });
        observer.observe({ type: 'longtask', buffered });
        return () => observer.disconnect();
    } catch {
        return () => {};
    }
}

/** GET a JSON document from this site. Rejects on a network error or a non-2xx status. */
export async function fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
    return response.json();
}

/** Load an image; resolves null when it fails. */
export function loadImageAsync(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
    });
}

/**
 * A keydown anywhere on the page, after the view that had focus has seen it.
 * A view that handled the key sets defaultPrevented; the listener can skip those.
 */
/** Immutable chart files only. Not the versions list, and not a place the campaign is saved. */
const CHART_CACHE = 'voyage-chart';

/** A chart file kept from an earlier visit, or null. Missing Cache API, or a locked cache, is a miss. */
export async function chartMatch(url: string): Promise<Response | null> {
    if (typeof caches === 'undefined') return null;
    try {
        const cache = await caches.open(CHART_CACHE);
        const hit = await cache.match(url);
        return hit ?? null;
    } catch {
        return null;
    }
}

/** The version already swept. A later ask for the same version does not list the cache again. */
let chartSwept: string | null = null;

/** The truth version in a chart URL, or null when the URL is not under `/truth/<version>/`. */
function chartVersionOf(url: string): string | null {
    const found = /\/truth\/([^/]+)\//.exec(url);
    return found ? found[1] : null;
}

/**
 * Drops `voyage-chart` entries under any truth version other than `version`.
 * Object bytes stay. They are named by hash, not by version. `chartMatch` is unchanged.
 * A missing Cache API, or a cache that cannot list keys, is left as it is.
 */
export async function chartKeepVersion(version: string): Promise<void> {
    if (!version || typeof caches === 'undefined' || chartSwept === version) return;
    try {
        const cache = await caches.open(CHART_CACHE);
        if (typeof cache.keys !== 'function' || typeof cache.delete !== 'function') {
            chartSwept = version;
            return;
        }
        const keys = await cache.keys();
        for (const request of keys) {
            const url = typeof request === 'string' ? request : request.url;
            const held = chartVersionOf(url);
            if (held && held !== version) await cache.delete(request);
        }
        chartSwept = version;
    } catch {
        // The next version ask tries again.
    }
}

/** Keeps one successful chart response. A failure here does not affect the read that just succeeded. */
export async function chartPut(url: string, response: Response): Promise<void> {
    if (typeof caches === 'undefined') return;
    try {
        const cache = await caches.open(CHART_CACHE);
        await cache.put(url, response);
    } catch {
        // The network read already succeeded. The next visit fetches again.
    }
}

/** The map locator pill's height, in CSS pixels. Zero when the line is absent or empty. */
export function locatorHeight(): number {
    if (typeof document === 'undefined') return 0;
    const node = document.querySelector('.ui-status');
    if (!(node instanceof HTMLElement)) return 0;
    if (node.getClientRects().length === 0) return 0;
    return node.offsetHeight;
}

/** A viewport resize. The map's locator line can wrap, so a card above it measures again. */
export function onPageResize(fn: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
}

/** The installable shell. No-op where this browser has no service worker. */
export function registerAppShell(): void {
    if (typeof navigator === 'undefined' || navigator.serviceWorker == null) return;
    void navigator.serviceWorker.register('/sw.js', { type: 'module' });
}

export function onPageKeyDown(fn: (event: KeyboardEvent) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
}

/** The browser's print dialog, for the page as the print stylesheet shows it (DU31). */
export function printPage(): void {
    if (typeof window === 'undefined') return;
    window.print();
}

/** Calls back each time the print dialog closes. Returns an unsubscribe. */
export function onAfterPrint(fn: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('afterprint', fn);
    return () => window.removeEventListener('afterprint', fn);
}

/** True when this tab is the one the reader is looking at. True where there is no document. */
export function pageVisible(): boolean {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
}

/** Fires when the tab is shown or hidden. Returns the function that stops it. */
export function onPageVisibility(fn: () => void): () => void {
    if (typeof document === 'undefined') return () => {};
    const onVis = () => fn();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
}

/** The canvas as a PNG, or null when the browser refuses it (an image too large). DP1. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
        try {
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        } catch {
            resolve(null);
        }
    });
}

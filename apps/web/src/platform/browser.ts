/** The only module that touches browser globals. Slice 1 A1.1. */

export function devicePixelRatio(): number {
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

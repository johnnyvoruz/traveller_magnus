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

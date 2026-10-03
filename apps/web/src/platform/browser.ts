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

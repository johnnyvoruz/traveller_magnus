import type { Rect } from './geometry.ts';
import { PPP_MAX, PPP_MIN } from './tiers.ts';

export type Camera = { x: number; y: number; ppp: number };
export type Viewport = { width: number; height: number };

/** design_reference.md §4: a hop of this many parsecs eases in place. Farther flights zoom out. */
export const SHORT_HOP = 12;

/** Token curves. Durations stay with the caller. --ease-out and --ease-in-out. */
function bezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
    const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
    const sampleDX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
    let s = t;
    for (let i = 0; i < 6; i++) {
        const dx = sampleX(s) - t;
        const deriv = sampleDX(s);
        if (Math.abs(dx) < 1e-6 || Math.abs(deriv) < 1e-6) break;
        s -= dx / deriv;
    }
    return sampleY(Math.min(1, Math.max(0, s)));
}

const easeOut = (t: number) => bezier(0.2, 0.8, 0.2, 1, t);
const easeInOut = (t: number) => bezier(0.4, 0, 0.2, 1, t);

export function clampPpp(ppp: number): number {
    if (ppp < PPP_MIN) return PPP_MIN;
    if (ppp > PPP_MAX) return PPP_MAX;
    return ppp;
}

function clampCamera(cam: Camera): Camera {
    const ppp = clampPpp(cam.ppp);
    return ppp === cam.ppp ? cam : { x: cam.x, y: cam.y, ppp };
}

export function toScreen(cam: Camera, vp: Viewport, x: number, y: number): { sx: number; sy: number } {
    return {
        sx: (x - cam.x) * cam.ppp + vp.width / 2,
        sy: (y - cam.y) * cam.ppp + vp.height / 2,
    };
}

export function toWorld(cam: Camera, vp: Viewport, sx: number, sy: number): { x: number; y: number } {
    return {
        x: cam.x + (sx - vp.width / 2) / cam.ppp,
        y: cam.y + (sy - vp.height / 2) / cam.ppp,
    };
}

export function visibleRect(cam: Camera, vp: Viewport): Rect {
    const halfW = vp.width / 2 / cam.ppp;
    const halfH = vp.height / 2 / cam.ppp;
    return { x0: cam.x - halfW, y0: cam.y - halfH, x1: cam.x + halfW, y1: cam.y + halfH };
}

/** Keeps the world point under (sx, sy) fixed. Positive factor zooms in. */
export function zoomAt(cam: Camera, vp: Viewport, sx: number, sy: number, factor: number): Camera {
    const world = toWorld(cam, vp, sx, sy);
    const ppp = clampPpp(cam.ppp * factor);
    return {
        x: world.x - (sx - vp.width / 2) / ppp,
        y: world.y - (sy - vp.height / 2) / ppp,
        ppp,
    };
}

/** Positive dxPx moves the camera right (the field slides left). */
export function panBy(cam: Camera, dxPx: number, dyPx: number): Camera {
    const ppp = clampPpp(cam.ppp);
    return { x: cam.x + dxPx / ppp, y: cam.y + dyPx / ppp, ppp };
}

export function fit(rect: Rect, vp: Viewport, marginPx: number): Camera {
    const worldW = rect.x1 - rect.x0;
    const worldH = rect.y1 - rect.y0;
    const availW = vp.width - 2 * marginPx;
    const availH = vp.height - 2 * marginPx;
    let ppp = PPP_MAX;
    if (worldW > 0 && availW > 0) ppp = Math.min(ppp, availW / worldW);
    if (worldH > 0 && availH > 0) ppp = Math.min(ppp, availH / worldH);
    if (!(availW > 0) || !(availH > 0)) ppp = PPP_MIN;
    return { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2, ppp: clampPpp(ppp) };
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * t is linear in [0, 1]. The caller owns the duration (--t-slow or --t-long).
 * Within SHORT_HOP parsecs, position and ppp share one ease-out.
 * Farther: zoom out to the ppp at which the two centres span SHORT_HOP
 * parsecs of the closer zoom, pan, then zoom in. Ease-in-out across the three thirds.
 */
export function flight(from: Camera, to: Camera, t: number): Camera {
    const start = clampCamera(from);
    const end = clampCamera(to);
    if (t <= 0) return start;
    if (t >= 1) return end;
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    if (dist <= SHORT_HOP) {
        const k = easeOut(t);
        return {
            x: lerp(start.x, end.x, k),
            y: lerp(start.y, end.y, k),
            ppp: clampPpp(lerp(start.ppp, end.ppp, k)),
        };
    }
    const mid = clampPpp(Math.min(start.ppp, end.ppp) * SHORT_HOP / dist);
    const u = easeInOut(t);
    if (u < 1 / 3) {
        const k = u / (1 / 3);
        return { x: start.x, y: start.y, ppp: clampPpp(lerp(start.ppp, mid, k)) };
    }
    if (u < 2 / 3) {
        const k = (u - 1 / 3) / (1 / 3);
        return { x: lerp(start.x, end.x, k), y: lerp(start.y, end.y, k), ppp: mid };
    }
    const k = (u - 2 / 3) / (1 / 3);
    return { x: end.x, y: end.y, ppp: clampPpp(lerp(mid, end.ppp, k)) };
}

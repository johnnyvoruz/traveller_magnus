/**
 * The orbit view's camera: zoom, pan, fit, frame and follow. Ported from
 * js/system_viewer.js (wheel 4657-4699, fit 5122-5171, frame 5283-5322, follow 5182-5199);
 * the state those functions closed over is the Camera value passed in and returned.
 * Pure: every function returns a new camera.
 */
import {
    hitOf, layoutScene, localBounds, sceneBounds, zoomScale,
    type Hit, type Plan, type View,
} from './layout.ts';

/** js/system_viewer.js:44. */
export const MAX_ZOOM = 5000;
/** js/system_viewer.js:4661. One notch of a mouse wheel. */
export const WHEEL_FACTOR = 1.15;
/** js/system_viewer.js:4670. Within this of the canvas centre, the zoom point is the centre. */
export const WHEEL_SNAP_PX = 3;
/** deltaY of one mouse wheel notch, in pixels and in lines. */
export const WHEEL_NOTCH_PX = 100;
export const WHEEL_NOTCH_LINES = 3;
/** js/system_viewer.js:5146. Fit leaves this much of the canvas free, both sides together. */
export const FIT_INSET = 32;
/** js/system_viewer.js:5290. */
export const FRAME_PAD = 36;
/** js/system_viewer.js:4716. A press that moves further than this is a drag, not a click. */
export const DRAG_SLOP = 4;

export type Size = { w: number; h: number };

export type Camera = {
    zoom: number;
    offX: number;
    offY: number;
    /** The zoom that fits the system, and the floor of zooming out (5159-5160). */
    minZoom: number;
    fitZoom: number;
    fitOffX: number;
    fitOffY: number;
    /** True while the view is the fitted view: it then refits as the bodies move (2030). */
    atFit: boolean;
};

/** js/system_viewer.js:59-66. */
export function startCamera(): Camera {
    return { zoom: 1, offX: 0, offY: 0, minZoom: 1, fitZoom: 1, fitOffX: 0, fitOffY: 0, atFit: true };
}

export function viewOf(cam: Camera, size: Size, linear: boolean): View {
    return {
        w: size.w, h: size.h, zoom: cam.zoom, offX: cam.offX, offY: cam.offY,
        z: zoomScale(cam.zoom, cam.fitZoom, false), linear,
    };
}

/**
 * js/system_viewer.js:5122-5171, orbits layout. Measures the picture up to twelve times until
 * it fills the canvas less FIT_INSET. With preserve, a view that is not the fitted view keeps
 * its zoom and pan relative to the new fit.
 */
export function fitCamera(plan: Plan, size: Size, days: number, cam: Camera, preserve: boolean, linear: boolean): Camera {
    if (!(size.w > 0) || !(size.h > 0)) return cam;
    const width = Math.max(20, size.w - FIT_INSET);
    const height = Math.max(20, size.h - FIT_INSET);
    const view: View = { w: size.w, h: size.h, zoom: cam.minZoom || 1, offX: 0, offY: 0, z: 1, linear };
    if (!plan.hasOrbits) view.zoom = 1;
    let lastSpan: number | null = null;
    for (let i = 0; i < 12; i++) {
        const bounds = sceneBounds(plan, view, days);
        const bw = bounds.right - bounds.left;
        const bh = bounds.bottom - bounds.top;
        const ratio = Math.min(width / Math.max(1, bw), height / Math.max(1, bh));
        if (!plan.hasOrbits || Math.abs(1 - ratio) < 0.0005 || (lastSpan !== null && Math.abs(bw + bh - lastSpan) < 0.001)) break;
        lastSpan = bw + bh;
        view.zoom = Math.max(0.00001, Math.min(MAX_ZOOM, view.zoom * ratio));
    }
    const bounds = sceneBounds(plan, view, days);
    const fitOffX = size.w / 2 - (bounds.left + bounds.right) / 2;
    const fitOffY = size.h / 2 - (bounds.top + bounds.bottom) / 2;
    const next: Camera = {
        zoom: view.zoom, offX: fitOffX, offY: fitOffY,
        minZoom: view.zoom, fitZoom: view.zoom, fitOffX, fitOffY, atFit: cam.atFit,
    };
    if (preserve && !cam.atFit) {
        const ratio = next.minZoom / (cam.minZoom || 1);
        next.zoom = Math.max(next.minZoom, cam.zoom * ratio);
        next.offX += (cam.offX - cam.fitOffX) * ratio;
        next.offY += (cam.offY - cam.fitOffY) * ratio;
    }
    return next;
}

/** One wheel event never counts for more than this many notches. */
export const WHEEL_MAX_NOTCHES = 4;

/**
 * Wheel movement as notches: +1 is one notch toward the picture (zoom in). A mouse wheel
 * sends a whole notch per event, as the legacy handler assumed; a trackpad sends many small
 * deltas, which become fractions of a notch instead of a full step each; a fast spin that
 * the browser merges into one event counts for the notches it merged.
 */
export function wheelNotches(deltaY: number, deltaMode: number): number {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
    const notch = deltaMode === 1 ? WHEEL_NOTCH_LINES : WHEEL_NOTCH_PX;
    return Math.max(-WHEEL_MAX_NOTCHES, Math.min(WHEEL_MAX_NOTCHES, -deltaY / notch));
}

/**
 * js/system_viewer.js:4657-4699. Zooms toward (mx, my); while a body is tracked, or within
 * WHEEL_SNAP_PX of the centre, toward the centre. `fit` is true when zooming out reached the
 * floor: the caller then fits the view (4690).
 */
export function zoomAt(cam: Camera, size: Size, mx: number, my: number, notches: number, tracking: boolean): { cam: Camera; fit: boolean } {
    if (!notches) return { cam, fit: false };
    const cx = size.w / 2;
    const cy = size.h / 2;
    let x = mx;
    let y = my;
    if (tracking) { x = cx; y = cy; }
    if (Math.abs(x - cx) <= WHEEL_SNAP_PX) x = cx;
    if (Math.abs(y - cy) <= WHEEL_SNAP_PX) y = cy;
    const factor = Math.pow(WHEEL_FACTOR, Math.abs(notches));
    let zoom: number;
    if (notches > 0) {
        zoom = Math.min(cam.zoom * factor, MAX_ZOOM);
    } else {
        zoom = Math.max(cam.minZoom, cam.zoom / factor);
        if (zoom <= cam.minZoom * 1.001) return { cam, fit: true };
    }
    const ratio = zoom / cam.zoom;
    return {
        cam: {
            ...cam,
            zoom,
            offX: x - cx - (x - cx - cam.offX) * ratio,
            offY: y - cy - (y - cy - cam.offY) * ratio,
            atFit: notches > 0 ? false : cam.atFit,
        },
        fit: false,
    };
}

/** js/system_viewer.js:4717-4718. */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
    return { ...cam, offX: cam.offX + dx, offY: cam.offY + dy };
}

/**
 * js/system_viewer.js:5182-5199. Moves a share of the way to putting the hit at the canvas
 * centre; share 1 is the legacy recentre.
 */
export function centreOn(cam: Camera, hit: Pick<Hit, 'cx' | 'cy'>, size: Size, share = 1): Camera {
    return {
        ...cam,
        offX: cam.offX + (size.w / 2 - hit.cx) * share,
        offY: cam.offY + (size.h / 2 - hit.cy) * share,
    };
}

/**
 * Moves a share of the way to a zoom, about the system's centre: the offsets scale with the
 * zoom, as in the legacy frame loop (5311-5314). The share is taken in log space, so a long
 * zoom reads as steady.
 */
export function zoomToward(cam: Camera, zoom: number, share: number): Camera {
    if (!(zoom > 0) || !(cam.zoom > 0)) return cam;
    const ratio = Math.pow(zoom / cam.zoom, share);
    return { ...cam, zoom: cam.zoom * ratio, offX: cam.offX * ratio, offY: cam.offY * ratio };
}

/** Moves a share of the way to another camera; at share 1 the result is that camera. */
export function toward(cam: Camera, target: Camera, share: number): Camera {
    if (share >= 1) return { ...target };
    const zoomed = zoomToward(cam, target.zoom, share);
    return {
        ...target,
        zoom: zoomed.zoom,
        offX: zoomed.offX + (target.offX - zoomed.offX) * share,
        offY: zoomed.offY + (target.offY - zoomed.offY) * share,
    };
}

/**
 * js/system_viewer.js:5283-5322. The camera that frames a body and what orbits it inside the
 * canvas less FRAME_PAD, the body at the centre. Null when the body has no hit target.
 */
export function frameCamera(plan: Plan, size: Size, days: number, cam: Camera, key: string, linear: boolean): Camera | null {
    const width = Math.max(20, size.w - FRAME_PAD * 2);
    const height = Math.max(20, size.h - FRAME_PAD * 2);
    const cx = size.w / 2;
    const cy = size.h / 2;
    let next: Camera = { ...cam, atFit: false };
    for (let i = 0; i < 12; i++) {
        const box = localBounds(plan, layoutScene(plan, viewOf(next, size, linear), days), key);
        if (!box) return null;
        const bw = Math.max(1, box.right - box.left);
        const bh = Math.max(1, box.bottom - box.top);
        const ratio = Math.min(width / bw, height / bh);
        next = panBy(next, cx - (box.left + box.right) / 2, cy - (box.top + box.bottom) / 2);
        if (Math.abs(1 - ratio) < 0.02) break;
        const zoom = Math.max(next.minZoom, Math.min(MAX_ZOOM, next.zoom * ratio));
        next = zoomToward(next, zoom, 1);
    }
    const hit = hitOf(layoutScene(plan, viewOf(next, size, linear), days), key);
    if (!hit) return null;
    return centreOn(next, hit, size);
}

/** Ease in and out, 0..1 to 0..1 (a cubic; the shape of --ease-in-out). */
export function easeInOut(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * The share of the remaining distance to close this frame, so that a move toward a target
 * that itself moves (a body on its orbit) still follows the eased curve and lands exactly.
 * remain is 1 − eased progress; before is last frame's, now is this frame's.
 */
export function tweenShare(before: number, now: number): number {
    if (!(before > 0)) return 1;
    return Math.max(0, Math.min(1, 1 - now / before));
}

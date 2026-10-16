/**
 * The sharp window over a baked surface sheet.
 * The bake stays on screen. Past one bake pixel per device pixel, the visible
 * stage is painted again with the same layout math, one device pixel per sample.
 * The buffer is the stage's device pixels, under SHARP_PIXEL_CAP times that.
 */
import type { SheetLayout } from './hybrid/field.ts';
import type { MapView } from './hybrid/view.ts';

/** The sharp buffer stays at or under this many times the stage's device pixels. */
export const SHARP_PIXEL_CAP = 4;

/** Device pixels of the stage for one pixel of the bake. Above 1, the bake is being enlarged. */
export function devicePerBake(stageW: number, bakeW: number, zoom: number, dpr: number): number {
    return (stageW * zoom * Math.max(dpr, 0)) / Math.max(bakeW, 1);
}

export type SharpFrame = {
    readonly layout: SheetLayout;
    readonly width: number;
    readonly height: number;
    /** Bake-pixel rectangle the bitmap covers, continuous. */
    readonly bakeX: number;
    readonly bakeY: number;
    readonly bakeW: number;
    readonly bakeH: number;
    readonly pixels: number;
    readonly cap: number;
};

/**
 * Bitmap and sheet layout for the visible stage. Null when the bake still has
 * a pixel for every device pixel.
 */
export function sharpFrame(base: SheetLayout, view: MapView, stageW: number, stageH: number, dpr: number): SharpFrame | null {
    if (!(stageW > 0) || !(stageH > 0) || !(view.zoom > 0)) return null;
    const d = dpr > 0 ? dpr : 1;
    if (!(devicePerBake(stageW, base.width, view.zoom, d) > 1)) return null;
    const width = Math.max(1, Math.round(stageW * d));
    const height = Math.max(1, Math.round(stageH * d));
    const pixels = width * height;
    const cap = SHARP_PIXEL_CAP * pixels;
    const bakeX = (0 - view.x) / (stageW * view.zoom) * base.width;
    const bakeY = (0 - view.y) / (stageH * view.zoom) * base.height;
    // Bake pixels per device pixel. The stage and the bake are both 2:1.
    const S = base.width / (stageW * view.zoom * d);
    const side = base.side / S;
    return {
        layout: {
            width,
            height,
            side,
            ox: (base.ox - bakeX) / S,
            oy: (base.oy - bakeY) / S,
        },
        width,
        height,
        bakeX,
        bakeY,
        bakeW: width * S,
        bakeH: height * (base.height / (stageH * view.zoom * d)),
        pixels,
        cap,
    };
}

/** A rectangle of a sharp frame, in that frame's pixels, as its own sheet. */
export function cropFrame(layout: SheetLayout, x0: number, y0: number, x1: number, y1: number): SheetLayout {
    return {
        width: Math.max(1, x1 - x0),
        height: Math.max(1, y1 - y0),
        side: layout.side,
        ox: layout.ox - x0,
        oy: layout.oy - y0,
    };
}

/**
 * Rectangles a shift of (kx, ky) device pixels uncovers. Positive kx moves the
 * picture right and leaves a strip on the left.
 */
export function panStrips(width: number, height: number, kx: number, ky: number): Array<[number, number, number, number]> {
    const rects: Array<[number, number, number, number]> = [];
    if (kx > 0) rects.push([0, 0, Math.min(width, kx), height]);
    else if (kx < 0) rects.push([Math.max(0, width + kx), 0, width, height]);
    const x0 = kx > 0 ? Math.min(width, kx) : 0;
    const x1 = kx < 0 ? Math.max(0, width + kx) : width;
    if (x1 <= x0) return rects;
    if (ky > 0) rects.push([x0, 0, x1, Math.min(height, ky)]);
    else if (ky < 0) rects.push([x0, Math.max(0, height + ky), x1, height]);
    return rects;
}

/** Where the sharp canvas sits in the unscaled zoom box, for the view it was painted at. */
export function sharpPlacement(view: MapView, stageW: number, stageH: number): { left: number; top: number; width: number; height: number } {
    return {
        left: (0 - view.x) / view.zoom,
        top: (0 - view.y) / view.zoom,
        width: stageW / view.zoom,
        height: stageH / view.zoom,
    };
}

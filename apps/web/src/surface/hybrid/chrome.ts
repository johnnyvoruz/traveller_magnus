/**
 * The faint terminator and the quiet sun mark. Both are strokes on the marks layer,
 * in sheet pixels, so they follow pan and zoom. The night tint itself stays in overlay.ts.
 */
import type { SheetLayout } from './field.ts';
import { sheetPoint } from './field.ts';
import type { Grid, V3 } from './grid.ts';
import type { Ctx2D } from './icons.ts';
import { iconPaint } from './icons.ts';
import { elevationAt } from './overlay.ts';

/** Terminator strengths compared in the shots. The built one is the middle, in --surface-terminus. */
export const TERMINUS_ALPHA_STEPS = [0.22, 0.40, 0.62] as const;
export const TERMINUS_ALPHA = TERMINUS_ALPHA_STEPS[1];

/**
 * One segment per hex the day/night boundary crosses, in sheet pixels.
 * An edge that jumps the net's cut is left out, so the line stops at a tear and
 * starts again on the next face.
 */
export function terminusSegments(grid: Grid, layout: SheetLayout, sun: V3): Array<[number, number, number, number]> {
    const elev = new Float64Array(grid.count);
    for (let i = 0; i < grid.count; i += 1) elev[i] = elevationAt(grid.P[i], sun);
    const out: Array<[number, number, number, number]> = [];
    const tear = layout.side * 0.45;
    for (let a = 0; a < grid.count; a += 1) {
        const pts: [number, number][] = [];
        const pa = sheetPoint(layout, grid.P[a]);
        for (const b of grid.nb[a]) {
            const ea = elev[a];
            const eb = elev[b];
            if (ea * eb > 0 || ea === eb) continue;
            const t = ea / (ea - eb);
            if (t < 0 || t > 1) continue;
            const pb = sheetPoint(layout, grid.P[b]);
            if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) > tear) continue;
            pts.push([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]);
        }
        if (pts.length >= 2) out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
    }
    return out;
}

/** The faint line. `width` is in sheet pixels (about one CSS pixel once the view scales it). */
export function drawTerminus(ctx: Ctx2D, grid: Grid, layout: SheetLayout, sun: V3, width: number): void {
    const segments = terminusSegments(grid, layout, sun);
    if (!segments.length) return;
    ctx.strokeStyle = iconPaint('--surface-terminus');
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of segments) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
    }
    ctx.stroke();
}

/** A small ring at the subsolar point. `radius` is in sheet pixels. */
export function drawSunMark(ctx: Ctx2D, layout: SheetLayout, sun: V3, radius: number): void {
    const [x, y] = sheetPoint(layout, sun);
    ctx.strokeStyle = iconPaint('--surface-sun-mark');
    ctx.lineWidth = Math.max(radius * 0.18, 0.4);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
}

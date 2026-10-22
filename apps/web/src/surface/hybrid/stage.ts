/**
 * The page side of the hybrid map: the net outline (for the blank sheet and the scan), and
 * where the star stands on the sheet for a clock value. Pure; SurfaceStage.vue draws.
 */
import type { Subsolar } from '../../orbit/sun.ts';
import { AVERAGED_ABOVE_DAYS_PER_SECOND, localDaysPerSecond } from '../../orbit/sun.ts';
import type { SheetLayout } from './field.ts';
import type { V3 } from './grid.ts';
import type { HybridModel } from './model.ts';
import { sunVector, type ShadowMode } from './overlay.ts';

/** The net's outline in sheet pixels, clockwise from the left corner of the band. */
export function netOutline(layout: SheetLayout): [number, number][] {
    const h = Math.sqrt(3) / 2;
    const pts: [number, number][] = [[0, h]];
    for (let k = 0; k < 5; k += 1) pts.push([k + 0.5, 0], [k + 1, h]);
    pts.push([5.5, 2 * h]);
    for (let k = 4; k >= 0; k -= 1) pts.push([k + 1, 3 * h], [k + 0.5, 2 * h]);
    return pts.map(([x, y]) => [layout.ox + x * layout.side, layout.oy + y * layout.side]);
}

/** The outline as a CSS clip-path polygon, in percentages of the sheet. */
export function netClipPath(layout: SheetLayout): string {
    const pct = (v: number, of: number): string => (Math.round((v / of) * 10000) / 100) + '%';
    return 'polygon(' + netOutline(layout).map(([x, y]) => pct(x, layout.width) + ' ' + pct(y, layout.height)).join(', ') + ')';
}

export type MapSun = {
    /** What the shadow layer draws, or null for no shadow. */
    readonly shadow: ShadowMode | null;
    /** The subsolar point on the sheet's sphere, or null when averaged or unknown. */
    readonly sun: V3 | null;
    readonly averaged: boolean;
    /** A world locked to its star: the shadow never moves. */
    readonly still: boolean;
};

/**
 * The star over the sheet. A locked world's shadow comes from its own substellar point (the
 * model's, which sets its climate). A turning world's subsolar longitude is counted from the
 * starport hex. Past a local day a second the shadow is the day-averaged one.
 */
export function mapSun(model: HybridModel, sub: Subsolar | null, playing: boolean, rate: number): MapSun {
    if (model.sub) return { shadow: { kind: 'instant', sun: model.sub }, sun: model.sub, averaged: false, still: true };
    if (!sub) return { shadow: null, sun: null, averaged: false, still: false };
    const fast = playing && localDaysPerSecond(rate, sub.solarDayHours) > AVERAGED_ABOVE_DAYS_PER_SECOND;
    if (fast) return { shadow: { kind: 'averaged', declinationDeg: sub.latDeg }, sun: null, averaged: true, still: false };
    let lon = (model.starportLon ?? 0) + sub.lonFromPortDeg;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    const sun = sunVector(sub.latDeg, lon);
    return { shadow: { kind: 'instant', sun }, sun, averaged: false, still: false };
}

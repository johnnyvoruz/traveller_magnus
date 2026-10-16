/**
 * Zoom and pan for the large surface map. The numbers match the chart's wheel and key
 * steps (map/input.ts) without taking that camera: it carries parsec state.
 * Pan stays clamped so the map cannot leave the stage.
 */

/** One wheel notch, the same step as map/input.ts. */
export const ZOOM_WHEEL = 1.1;
/** CSS pixels the chart treats as one wheel notch. */
export const ZOOM_NOTCH_PX = 100;
/** One key or button step, the same as the chart's plus and minus keys. */
export const ZOOM_KEY = 1.5;
/**
 * A hex at maximum zoom, in CSS pixels. 320 is about 6.7 times the old 48 px
 * cap: one hex fills a reading width. Past the bake, sharp.ts redraws the
 * window so that size stays crisp.
 */
export const HEX_READ_PX = 320;
/** Grid stroke stays one CSS pixel until a hex is this wide, then grows to two at HEX_READ_PX. */
export const HEX_GRID_QUIET_PX = 48;

/** Hex-grid stroke in CSS pixels. One at the old cap, two at HEX_READ_PX. */
export function hexGridCss(hexCss: number): number {
    const span = HEX_READ_PX - HEX_GRID_QUIET_PX;
    const t = span <= 0 ? 1 : (hexCss - HEX_GRID_QUIET_PX) / span;
    return 1 + Math.max(0, Math.min(1, t));
}

export type MapView = {
    readonly zoom: number;
    /** Stage CSS pixels from the stage origin to the sheet's origin. */
    readonly x: number;
    readonly y: number;
};

export const FIT_VIEW: MapView = { zoom: 1, x: 0, y: 0 };

/** Largest zoom that puts one hex at HEX_READ_PX on this stage. Fit is 1. */
export function maxZoom(stageW: number, sheetW: number, side: number, n: number): number {
    const hexFit = (side / Math.max(1, n)) * (stageW / Math.max(sheetW, 1));
    if (!(hexFit > 0)) return 1;
    return Math.max(1, HEX_READ_PX / hexFit);
}

/** On-screen width of one hex, in CSS pixels. */
export function hexCssPx(stageW: number, sheetW: number, side: number, n: number, zoom: number): number {
    return (side / Math.max(1, n)) * (stageW / Math.max(sheetW, 1)) * zoom;
}

export function clampView(view: MapView, stageW: number, stageH: number): MapView {
    const zoom = view.zoom < 1 ? 1 : view.zoom;
    const mw = stageW * zoom;
    const mh = stageH * zoom;
    let x = view.x;
    let y = view.y;
    if (mw <= stageW + 0.5) x = (stageW - mw) / 2;
    else x = Math.min(0, Math.max(stageW - mw, x));
    if (mh <= stageH + 0.5) y = (stageH - mh) / 2;
    else y = Math.min(0, Math.max(stageH - mh, y));
    return { zoom, x, y };
}

/** Zoom about a stage point. The sheet point under it stays under it. */
export function zoomAbout(view: MapView, stageW: number, stageH: number, sx: number, sy: number, factor: number, limit: number): MapView {
    const zoom = Math.min(limit, Math.max(1, view.zoom * factor));
    const u = stageW * view.zoom === 0 ? 0 : (sx - view.x) / (stageW * view.zoom);
    const v = stageH * view.zoom === 0 ? 0 : (sy - view.y) / (stageH * view.zoom);
    return clampView({ zoom, x: sx - u * stageW * zoom, y: sy - v * stageH * zoom }, stageW, stageH);
}

export function panBy(view: MapView, stageW: number, stageH: number, dx: number, dy: number): MapView {
    return clampView({ zoom: view.zoom, x: view.x + dx, y: view.y + dy }, stageW, stageH);
}

/**
 * Where the build marks go on the chart (findings/builder_system_design.md §1): the outline of
 * each selected hex, the dashed hex of a preview, the faint dashed hex of a removed system,
 * and the hexes inside a dragged box. Pure geometry in the chart's own units (parsecs); the
 * overlay scales it with the camera. Runs under Node.
 */
import { toWorld, type Camera, type Viewport } from '../../map/camera.ts';
import { formatHex, fromGlobal, hexAt, hexCentre, hexCorners, parseHex, sectorRect, toGlobal } from '../../map/geometry.ts';
import { parseHexKey } from '../places.ts';

export type SectorPlace = { slug: string; x: number; y: number };

/** "x,y x,y ..." for an SVG polygon, in parsecs. Empty when the sector is not on the chart. */
export function hexPoints(hexKey: string, sectorOf: (slug: string) => SectorPlace | null): string {
    const place = parseHexKey(hexKey);
    const local = place ? parseHex(place.hex) : null;
    const sector = place ? sectorOf(place.slug) : null;
    if (!place || !local || !sector) return '';
    const global = toGlobal(sector.x, sector.y, local.col, local.row);
    const centre = hexCentre(global.q, global.r);
    const corners = hexCorners(centre.x, centre.y);
    const out: string[] = [];
    for (let i = 0; i < corners.length; i += 2) out.push(corners[i].toFixed(4) + ',' + corners[i + 1].toFixed(4));
    return out.join(' ');
}

/** A slot on the grid of sectors as an SVG rect, in parsecs: the place a sector fills. */
export function slotBox(slot: { x: number; y: number }): { x: number; y: number; width: number; height: number } {
    const rect = sectorRect(slot.x, slot.y);
    return { x: rect.x0, y: rect.y0, width: rect.x1 - rect.x0, height: rect.y1 - rect.y0 };
}

/** The slot under a point of the canvas. */
export function slotAt(cam: Camera, vp: Viewport, sx: number, sy: number): { x: number; y: number } {
    const world = toWorld(cam, vp, sx, sy);
    const hit = hexAt(world.x, world.y);
    const place = fromGlobal(hit.q, hit.r);
    return { x: place.sx, y: place.sy };
}

/** The block of slots the canvas shows, for offering the empty ones. */
export function slotsInView(cam: Camera, vp: Viewport): { from: { x: number; y: number }; to: { x: number; y: number } } {
    return { from: slotAt(cam, vp, 0, 0), to: slotAt(cam, vp, vp.width, vp.height) };
}

/** The SVG transform that puts parsecs on the screen for this camera. */
export function cameraTransform(cam: Camera, vp: Viewport): string {
    const tx = vp.width / 2 - cam.x * cam.ppp;
    const ty = vp.height / 2 - cam.y * cam.ppp;
    return 'translate(' + tx.toFixed(2) + ' ' + ty.toFixed(2) + ') scale(' + cam.ppp.toFixed(4) + ')';
}

/** The hex under a point of the canvas, as a key, or null where the chart has no sector. */
export function keyAt(cam: Camera, vp: Viewport, sx: number, sy: number, sectorAt: (x: number, y: number) => string | null): string | null {
    const world = toWorld(cam, vp, sx, sy);
    const hit = hexAt(world.x, world.y);
    const place = fromGlobal(hit.q, hit.r);
    const slug = sectorAt(place.sx, place.sy);
    return slug ? slug + '/' + formatHex(place.col, place.row) : null;
}

/**
 * Every hex whose centre lies inside the box dragged between two points of the canvas,
 * column by column. Stops at `cap` hexes.
 */
export function keysInBox(
    cam: Camera,
    vp: Viewport,
    a: { x: number; y: number },
    b: { x: number; y: number },
    sectorAt: (x: number, y: number) => string | null,
    cap: number,
): string[] {
    const p = toWorld(cam, vp, Math.min(a.x, b.x), Math.min(a.y, b.y));
    const q = toWorld(cam, vp, Math.max(a.x, b.x), Math.max(a.y, b.y));
    const first = hexAt(p.x, p.y);
    const last = hexAt(q.x, q.y);
    const out: string[] = [];
    for (let col = first.q - 1; col <= last.q + 1; col += 1) {
        for (let row = first.r - 1; row <= last.r + 1; row += 1) {
            const centre = hexCentre(col, row);
            if (centre.x < p.x || centre.x > q.x || centre.y < p.y || centre.y > q.y) continue;
            const place = fromGlobal(col, row);
            const slug = sectorAt(place.sx, place.sy);
            if (!slug) continue;
            out.push(slug + '/' + formatHex(place.col, place.row));
            if (out.length >= cap) return out;
        }
    }
    return out;
}

// ---- §18: the hover, the box's preview and what the pane must not hide -----------------------------

type World = { x0: number; y0: number; x1: number; y1: number };

/** The box a hex fills on the chart, in parsecs. Null when its sector is not on the chart. */
export function hexWorldBox(hexKey: string, sectorOf: (slug: string) => SectorPlace | null): World | null {
    const place = parseHexKey(hexKey);
    const local = place ? parseHex(place.hex) : null;
    const sector = place ? sectorOf(place.slug) : null;
    if (!place || !local || !sector) return null;
    const global = toGlobal(sector.x, sector.y, local.col, local.row);
    const centre = hexCentre(global.q, global.r);
    const corners = hexCorners(centre.x, centre.y);
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let i = 0; i < corners.length; i += 2) {
        box.x0 = Math.min(box.x0, corners[i]);
        box.x1 = Math.max(box.x1, corners[i]);
        box.y0 = Math.min(box.y0, corners[i + 1]);
        box.y1 = Math.max(box.y1, corners[i + 1]);
    }
    return box;
}

/** The box that holds every one of these hexes, in parsecs. */
export function keysWorldBox(keys: readonly string[], sectorOf: (slug: string) => SectorPlace | null): World | null {
    let out: World | null = null;
    for (const key of keys) {
        const box = hexWorldBox(key, sectorOf);
        if (!box) continue;
        out = out ? { x0: Math.min(out.x0, box.x0), y0: Math.min(out.y0, box.y0), x1: Math.max(out.x1, box.x1), y1: Math.max(out.y1, box.y1) } : box;
    }
    return out;
}

/** A box of the chart as the canvas shows it under a camera, in pixels. */
export function screenBox(cam: Camera, vp: Viewport, world: World): { left: number; top: number; right: number; bottom: number } {
    return {
        left: (world.x0 - cam.x) * cam.ppp + vp.width / 2,
        top: (world.y0 - cam.y) * cam.ppp + vp.height / 2,
        right: (world.x1 - cam.x) * cam.ppp + vp.width / 2,
        bottom: (world.y1 - cam.y) * cam.ppp + vp.height / 2,
    };
}

/** Many hexes as one SVG path, in parsecs: what a dragged box would add or take away, drawn as one element. */
export function hexesPath(keys: readonly string[], sectorOf: (slug: string) => SectorPlace | null): string {
    let d = '';
    for (const key of keys) {
        const at = hexPoints(key, sectorOf);
        if (at) d += 'M' + at.replace(/ /g, 'L') + 'Z';
    }
    return d;
}

/** An empty slot's ghost grid as one SVG path, in parsecs: its edge and the lines between its sixteen subsectors. */
export function slotGhostPath(slot: { x: number; y: number }): string {
    const rect = sectorRect(slot.x, slot.y);
    const w = (rect.x1 - rect.x0) / 4;
    const h = (rect.y1 - rect.y0) / 4;
    let d = 'M' + rect.x0 + ',' + rect.y0 + 'H' + rect.x1 + 'V' + rect.y1 + 'H' + rect.x0 + 'Z';
    for (let i = 1; i < 4; i += 1) {
        d += 'M' + (rect.x0 + i * w) + ',' + rect.y0 + 'V' + rect.y1;
        d += 'M' + rect.x0 + ',' + (rect.y0 + i * h) + 'H' + rect.x1;
    }
    return d;
}

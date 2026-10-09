/**
 * Where the build marks go on the chart (findings/builder_system_design.md §1): the outline of
 * each selected hex, the dashed hex of a preview, the faint dashed hex of a removed system,
 * and the hexes inside a dragged box. Pure geometry in the chart's own units (parsecs); the
 * overlay scales it with the camera. Runs under Node.
 */
import { toWorld, type Camera, type Viewport } from '../../map/camera.ts';
import { formatHex, fromGlobal, hexAt, hexCentre, hexCorners, parseHex, toGlobal } from '../../map/geometry.ts';
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

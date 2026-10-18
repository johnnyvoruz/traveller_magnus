/**
 * What a click would open, zoomed out (streams/D.md DF8; Johnny 20:20: "need hover to let the user
 * know"). Below the hex tier a click on a hex that holds a world opens its system: the world under the
 * pointer is found here by the click's own rule (views/MapView.vue chartClick and holdsWorld: the
 * canonical sector at that place, and the overview's cell for the hex), so the hover never promises
 * what the click does not do. The words come from what is loaded (the sector's index, the far labels);
 * never a fetch. Pure: it runs under Node.
 */
import { toScreen, toWorld, type Camera, type Viewport } from './camera.ts';
import { formatHex, fromGlobal, hexAt, hexCentre, SECTOR_ROWS } from './geometry.ts';
import { tierFor } from './tiers.ts';

export type HoverSources = {
    /** The canonical sector at a place on the grid of sectors, or null for none. */
    sectorAt(sx: number, sy: number): { slug: string; name: string } | null;
    /** The overview's cells for a sector: one character a hex, column by column, "." for no world. */
    cells(slug: string): string | null;
    /** A world's name from what is loaded (its sector's index, or a far label), or null. Never a fetch. */
    name(slug: string, hhhh: string): string | null;
};

/** The ring on the thing under the pointer and the data block beside it, in canvas pixels. */
export type ChartHoverMark = { x: number; y: number; r: number; title: string; line: string };

/** The ring is never smaller than this, so a 1 px dot far out still shows it is the one. */
export const RING_MIN = 7;

/** The ring round a world at this zoom: just outside its dot or disc. */
export function worldRing(ppp: number): number {
    return Math.max(RING_MIN, Math.min(ppp * 0.45, 14) + 3);
}

/** The world under a point below the hex tier, as the click would find it, with its words; null for none. */
export function worldUnder(sx: number, sy: number, cam: Camera, vp: Viewport, src: HoverSources): ChartHoverMark & { slug: string; hhhh: string } | null {
    if (tierFor(cam.ppp) === 'hex') return null;
    const world = toWorld(cam, vp, sx, sy);
    const hit = hexAt(world.x, world.y);
    const place = fromGlobal(hit.q, hit.r);
    const sector = src.sectorAt(place.sx, place.sy);
    if (!sector) return null;
    const cells = src.cells(sector.slug);
    if (!cells || cells.charAt((place.col - 1) * SECTOR_ROWS + (place.row - 1)) === '.') return null;
    const hhhh = formatHex(place.col, place.row);
    const centre = hexCentre(hit.q, hit.r);
    const at = toScreen(cam, vp, centre.x, centre.y);
    const name = src.name(sector.slug, hhhh);
    const where = sector.name + ' ' + hhhh;
    return { slug: sector.slug, hhhh, x: at.sx, y: at.sy, r: worldRing(cam.ppp), title: name || where, line: name ? where : 'Select to open its system' };
}

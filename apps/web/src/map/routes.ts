import type { Camera } from './camera.ts';
import { hexCentre, parseHex, ROW_STEP, sectorRect, SECTOR_COLS, SECTOR_ROWS, toGlobal, type Rect } from './geometry.ts';

export type ChartSector = {
    slug: string;
    x: number;
    y: number;
    tags: string[];
    name?: string;
    /** Absent means the sector is on the drawn layer. False is off the canonical chart. */
    canonical?: boolean;
};
export type ChartManifest = { sectors: ChartSector[] };

export type Target =
    | { kind: 'fit'; rect: Rect }
    | { kind: 'camera'; camera: Camera }
    | { kind: 'account' }
    | { kind: 'design' }
    | { kind: 'unknown'; message: string };

const HEX_PPP = 80;

/** First column and row of a subsector letter, or null when the letter is not A–P. */
function subsectorOrigin(letter: string): { col: number; row: number } | null {
    if (!/^[A-P]$/.test(letter)) return null;
    const index = letter.charCodeAt(0) - 65;
    return { col: (index % 4) * 8 + 1, row: Math.floor(index / 4) * 10 + 1 };
}

/** The eight-by-ten block, with a margin of one hex so the fit holds the outer hexes. */
function subsectorRect(sx: number, sy: number, col: number, row: number): Rect {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const column of [col, col + 7]) {
        for (const line of [row, row + 9]) {
            const global = toGlobal(sx, sy, column, line);
            const centre = hexCentre(global.q, global.r);
            if (centre.x < x0) x0 = centre.x;
            if (centre.y < y0) y0 = centre.y;
            if (centre.x > x1) x1 = centre.x;
            if (centre.y > y1) y1 = centre.y;
        }
    }
    return { x0: x0 - 1, y0: y0 - ROW_STEP, x1: x1 + 1, y1: y1 + ROW_STEP };
}

/** Bounding box of sectors tagged OTU. The home view. */
export function homeRect(manifest: ChartManifest): Rect | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let any = false;
    for (const sector of manifest.sectors) {
        if (!sector.tags.includes('OTU')) continue;
        const rect = sectorRect(sector.x, sector.y);
        any = true;
        if (rect.x0 < x0) x0 = rect.x0;
        if (rect.y0 < y0) y0 = rect.y0;
        if (rect.x1 > x1) x1 = rect.x1;
        if (rect.y1 > y1) y1 = rect.y1;
    }
    return any ? { x0, y0, x1, y1 } : null;
}

function findSector(manifest: ChartManifest, slug: string): ChartSector | null {
    for (const sector of manifest.sectors) if (sector.slug === slug) return sector;
    return null;
}

export type DossierRoute =
    | { kind: 'closed' }
    | { kind: 'overview'; slug: string; hex: string }
    | { kind: 'body'; slug: string; hex: string; body: string };

/**
 * Panel route. A body key is the overview until `keys` is known and does not contain it.
 * Omit `keys` while the system tree has not arrived.
 */
export function dossierRoute(path: string, keys?: readonly string[]): DossierRoute {
    const parts = path.split('/').filter((part) => part.length > 0);
    if (parts[0] !== 's' || parts.length < 3) return { kind: 'closed' };
    const slug = decodeURIComponent(parts[1]);
    const hex = decodeURIComponent(parts[2]);
    if (parts.length === 3) return { kind: 'overview', slug, hex };
    if (parts.length === 5 && parts[3] === 'b') {
        const body = decodeURIComponent(parts[4]);
        if (keys && !keys.includes(body)) return { kind: 'overview', slug, hex };
        return { kind: 'body', slug, hex, body };
    }
    return { kind: 'closed' };
}

/** Route path to a camera target. Account and design are pages, not cameras. */
export function targetFor(route: { path: string }, manifest: ChartManifest): Target {
    const path = route.path;
    if (path === '/' || path === '') {
        const rect = homeRect(manifest);
        if (!rect) return { kind: 'unknown', message: 'This truth has no OTU sectors.' };
        return { kind: 'fit', rect };
    }
    if (path === '/account') return { kind: 'account' };
    if (path === '/design') return { kind: 'design' };
    const parts = path.split('/').filter((part) => part.length > 0);
    const bodyPath = parts.length === 5 && parts[3] === 'b';
    const subsectorPath = parts.length === 4 && parts[2] === 'sub';
    if (parts[0] === 's' && (parts.length === 2 || parts.length === 3 || bodyPath || subsectorPath)) {
        const slug = decodeURIComponent(parts[1]);
        const sector = findSector(manifest, slug);
        if (!sector) return { kind: 'unknown', message: 'No sector ' + slug + '.' };
        if (sector.canonical === false) {
            return { kind: 'unknown', message: (sector.name || sector.slug) + ' is not on the canonical chart.' };
        }
        if (parts.length === 2) return { kind: 'fit', rect: sectorRect(sector.x, sector.y) };
        if (parts.length === 4 && parts[2] === 'sub') {
            const letter = decodeURIComponent(parts[3]);
            const origin = subsectorOrigin(letter);
            if (!origin) return { kind: 'unknown', message: 'No subsector ' + letter + '.' };
            return { kind: 'fit', rect: subsectorRect(sector.x, sector.y, origin.col, origin.row) };
        }
        const hhhh = decodeURIComponent(parts[2]);
        const local = parseHex(hhhh);
        if (!local || local.col < 1 || local.col > SECTOR_COLS || local.row < 1 || local.row > SECTOR_ROWS) {
            return { kind: 'unknown', message: 'No hex ' + hhhh + '.' };
        }
        const global = toGlobal(sector.x, sector.y, local.col, local.row);
        const centre = hexCentre(global.q, global.r);
        return { kind: 'camera', camera: { x: centre.x, y: centre.y, ppp: HEX_PPP } };
    }
    return { kind: 'unknown', message: 'Unknown route ' + path + '.' };
}

/** World space is parsecs. One column step is 1. Copied from packages/engines hex.js at HEX_SIZE. */

export const SECTOR_COLS = 32;
export const SECTOR_ROWS = 40;
export const SQRT3 = Math.sqrt(3);
export const ROW_STEP = SQRT3 / 1.5;
export const HEX_SIZE = 1 / 1.5;

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export function parseHex(hhhh: string): { col: number; row: number } | null {
    if (!/^[0-9]{4}$/.test(hhhh)) return null;
    return { col: Number(hhhh.slice(0, 2)), row: Number(hhhh.slice(2, 4)) };
}

export function formatHex(col: number, row: number): string {
    return String(col).padStart(2, '0') + String(row).padStart(2, '0');
}

export function toGlobal(sx: number, sy: number, col: number, row: number): { q: number; r: number } {
    return { q: sx * SECTOR_COLS + (col - 1), r: sy * SECTOR_ROWS + (row - 1) };
}

/** One step on the odd-q chart. Above is a smaller row number. */
export type HexStep = 'nw' | 'n' | 'ne' | 'sw' | 's' | 'se';

/** [column, row] for an even q, then an odd q. N is a smaller row. */
const HEX_STEP: Record<HexStep, readonly [readonly [number, number], readonly [number, number]]> = {
    nw: [[-1, -1], [-1, 0]],
    n: [[0, -1], [0, -1]],
    ne: [[1, -1], [1, 0]],
    sw: [[-1, 0], [-1, 1]],
    s: [[0, 1], [0, 1]],
    se: [[1, 0], [1, 1]],
};

export function stepGlobal(q: number, r: number, step: HexStep): { q: number; r: number } {
    const delta = HEX_STEP[step][(q & 1) === 1 ? 1 : 0];
    return { q: q + delta[0], r: r + delta[1] };
}

export function fromGlobal(q: number, r: number): { sx: number; sy: number; col: number; row: number } {
    const sx = Math.floor(q / SECTOR_COLS);
    const sy = Math.floor(r / SECTOR_ROWS);
    return { sx, sy, col: q - sx * SECTOR_COLS + 1, row: r - sy * SECTOR_ROWS + 1 };
}

/** getHexPixel with baseHexSize = 1/1.5, so the column step is 1. */
export function hexCentre(q: number, r: number): { x: number; y: number } {
    return { x: q, y: ROW_STEP * (r + ((q & 1) ? 0.5 : 0)) };
}

/**
 * pixelToHex from packages/engines/src/core/hex.js with size = HEX_SIZE.
 * Copied, not imported: the viewer bundle does not import engines.
 */
export function hexAt(x: number, y: number): { q: number; r: number } {
    const size = HEX_SIZE;
    const q_frac = (2.0 / 3.0 * x) / size;
    const r_frac = (-1.0 / 3.0 * x + Math.sqrt(3) / 3.0 * y) / size;
    let q = Math.round(q_frac), r = Math.round(r_frac), s = Math.round(-q_frac - r_frac);
    const q_diff = Math.abs(q - q_frac), r_diff = Math.abs(r - r_frac), s_diff = Math.abs(s - (-q_frac - r_frac));
    if (q_diff > r_diff && q_diff > s_diff) q = -r - s;
    else if (r_diff > s_diff) r = -q - s;
    return { q: q, r: r + (q - (q & 1)) / 2 };
}

/** Sector grid span. sx -21..11 and sy -21..15 is 1056 by 37*40*ROW_STEP parsecs. */
export function sectorRect(sx: number, sy: number): Rect {
    return {
        x0: sx * SECTOR_COLS,
        x1: (sx + 1) * SECTOR_COLS,
        y0: sy * SECTOR_ROWS * ROW_STEP,
        y1: (sy + 1) * SECTOR_ROWS * ROW_STEP,
    };
}

/**
 * getHexDistance from packages/engines/src/core/hex.js.
 * Copied, not imported: the viewer bundle does not import engines.
 * Odd-q offset to cube, then the longest cube axis.
 */
export function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
    const x1 = a.q;
    const z1 = a.r - (a.q - (a.q & 1)) / 2;
    const y1 = -x1 - z1;
    const x2 = b.q;
    const z2 = b.r - (b.q - (b.q & 1)) / 2;
    const y2 = -x2 - z2;
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

function globalOf(
    hexKey: string,
    sectorAt: (slug: string) => { sx: number; sy: number } | null,
): { q: number; r: number } | null {
    const slash = hexKey.indexOf('/');
    if (slash <= 0 || slash !== hexKey.lastIndexOf('/')) return null;
    const local = parseHex(hexKey.slice(slash + 1));
    if (!local) return null;
    const sector = sectorAt(hexKey.slice(0, slash));
    if (!sector) return null;
    return toGlobal(sector.sx, sector.sy, local.col, local.row);
}

/**
 * Parsecs between two chart hexes. One hex is one parsec.
 * `sectorAt` reads the sector grid position; null when the sector is unknown.
 */
export function parsecsBetween(
    hexKeyA: string,
    hexKeyB: string,
    sectorAt: (slug: string) => { sx: number; sy: number } | null,
): number | null {
    const a = globalOf(hexKeyA, sectorAt);
    const b = globalOf(hexKeyB, sectorAt);
    if (!a || !b) return null;
    return hexDistance(a, b);
}

/** Twelve numbers, flat-top: point to the right, then counterclockwise. */
export function hexCorners(x: number, y: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        out.push(x + HEX_SIZE * Math.cos(angle), y + HEX_SIZE * Math.sin(angle));
    }
    return out;
}

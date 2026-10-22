/** World space is parsecs. One column step is 1. Copied from apps/web/src/map/geometry.ts. */

import { HEX_SIZE, ROW_STEP, SECTOR_COLS, SECTOR_ROWS } from '@voyage/shared';

export { HEX_SIZE, SECTOR_ROWS };

export function toGlobal(sx: number, sy: number, col: number, row: number): { q: number; r: number } {
    return { q: sx * SECTOR_COLS + (col - 1), r: sy * SECTOR_ROWS + (row - 1) };
}

/** getHexPixel with baseHexSize = 1/1.5, so the column step is 1. */
export function hexCentre(q: number, r: number): { x: number; y: number } {
    return { x: q, y: ROW_STEP * (r + ((q & 1) ? 0.5 : 0)) };
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

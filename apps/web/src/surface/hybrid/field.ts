/**
 * Pixel geometry of the flat net: for each pixel of a sheet, the face it lies on, its point
 * on the sphere, the nearest hex and the three hexes it blends between. Depends only on the
 * layout and the grid side, never on a world, so it is built once and shared.
 */
import { bary, facePoint, gridOf, NET_HEIGHT, NET_WIDTH, type Grid } from './grid.ts';

export type SheetLayout = {
    readonly width: number;
    readonly height: number;
    /** Triangle side in pixels. */
    readonly side: number;
    /** Net origin in pixels. */
    readonly ox: number;
    readonly oy: number;
};

/** A layout that centres the net in width × height with the given side. */
export function layoutFor(width: number, height: number, side: number): SheetLayout {
    return { width, height, side, ox: (width - NET_WIDTH * side) / 2, oy: (height - NET_HEIGHT * side) / 2 };
}

/** The app's sheet: 800 × 400, as the stage and the cache have always had it. */
export const SHEET_LAYOUT: SheetLayout = layoutFor(800, 400, 132);

/** The large map: the same net, twice the side, on a 1600 × 800 sheet. */
export const LARGE_SHEET: SheetLayout = layoutFor(1600, 800, 264);

/** Half size, for the day and night overlay. */
export function halfLayout(layout: SheetLayout): SheetLayout {
    return { width: Math.ceil(layout.width / 2), height: Math.ceil(layout.height / 2), side: layout.side / 2, ox: layout.ox / 2, oy: layout.oy / 2 };
}

export type Field = {
    readonly layout: SheetLayout;
    readonly grid: Grid;
    /** Face index per pixel, -1 off the net. */
    readonly face: Int8Array;
    /** Unit vector per pixel (x, y, z). */
    readonly P: Float32Array;
    /** Nearest hex per pixel, -1 off the net. */
    readonly hex: Int32Array;
    /** Three hexes and their weights per pixel. */
    readonly bl: Int32Array;
    readonly bw: Float32Array;
};

const fields = new Map<string, Field>();

const fieldKey = (layout: SheetLayout, n: number): string => [layout.width, layout.height, layout.side, layout.ox, layout.oy, n].join(',');

export function fieldOf(layout: SheetLayout, n: number): Field {
    const build = fieldBuild(layout, n);
    while (!build.row()) { /* to the end */ }
    return build.field;
}

/** A field built a row at a time (the page paints without a worker in small steps). */
export type FieldBuild = {
    /** Build one row; true when the field is complete (and cached). */
    row(): boolean;
    readonly field: Field;
};

export function fieldBuild(layout: SheetLayout, n: number, cache = true): FieldBuild {
    const key = fieldKey(layout, n);
    const cached = cache ? fields.get(key) : undefined;
    if (cached) return { row: () => true, field: cached };
    const build = buildField(layout, gridOf(n));
    return {
        row(): boolean {
            if (!build.row()) return false;
            if (cache && !fields.has(key)) {
                if (fields.size > 8) fields.clear();
                fields.set(key, build.field);
            }
            return true;
        },
        field: build.field,
    };
}

function buildField(layout: SheetLayout, grid: Grid): FieldBuild {
    const { width: W, height: H, side: s, ox, oy } = layout;
    const n = grid.n;
    const faces = grid.faces;
    const N = W * H;
    const face = new Int8Array(N).fill(-1);
    const P = new Float32Array(N * 3);
    const hex = new Int32Array(N).fill(-1);
    const bl = new Int32Array(N * 3);
    const bw = new Float32Array(N * 3);
    const box = faces.map((f) => [
        Math.min(f.a[0], f.b[0], f.c[0]), Math.max(f.a[0], f.b[0], f.c[0]),
        Math.min(f.a[1], f.b[1], f.c[1]), Math.max(f.a[1], f.b[1], f.c[1]),
    ]);
    const slack = 0.01 / s;
    const field: Field = { layout, grid, face, P, hex, bl, bw };
    let y = 0;
    const row = (): boolean => {
        if (y >= H) return true;
        const ny = (y + 0.5 - oy) / s;
        y += 1;
        if (ny < -slack || ny > NET_HEIGHT + slack) return y >= H;
        const yRow = y - 1;
        for (let x = 0; x < W; x += 1) {
            const nx = (x + 0.5 - ox) / s;
            const k = yRow * W + x;
            for (let fi = 0; fi < 20; fi += 1) {
                const bb = box[fi];
                if (nx < bb[0] - slack || nx > bb[1] + slack || ny < bb[2] - slack || ny > bb[3] + slack) continue;
                const [w0, w1, w2] = bary(faces[fi], nx, ny);
                if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
                face[k] = fi;
                const p = facePoint(faces[fi], w0, w1, w2);
                P[k * 3] = p[0];
                P[k * 3 + 1] = p[1];
                P[k * 3 + 2] = p[2];
                const table = grid.vid[fi];
                const V = (i: number, j: number): number => table[i * (n + 1) + j];
                const a = Math.max(0, Math.min(n, n * w1));
                const b = Math.max(0, Math.min(n, n * w2));
                let i0 = Math.floor(a);
                let j0 = Math.floor(b);
                // Nearest lattice point in the 60-degree metric.
                let best = -1;
                let bd = 1e9;
                for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                    const i = i0 + di;
                    const j = j0 + dj;
                    if (i + j > n) continue;
                    const fa = a - i;
                    const fb = b - j;
                    const d = fa * fa + fb * fb + fa * fb;
                    if (d < bd) {
                        bd = d;
                        best = V(i, j);
                    }
                }
                hex[k] = best;
                // The lattice triangle the pixel lies in, for a barycentric blend.
                if (i0 + j0 > n - 1) {
                    if (j0 > 0) j0 = Math.max(0, n - 1 - i0);
                    if (i0 + j0 > n - 1) i0 = n - 1 - j0;
                }
                const fa = a - i0;
                const fb = b - j0;
                const q = k * 3;
                if (fa + fb <= 1) {
                    bl[q] = V(i0, j0); bl[q + 1] = V(i0 + 1, j0); bl[q + 2] = V(i0, j0 + 1);
                    bw[q] = 1 - fa - fb; bw[q + 1] = fa; bw[q + 2] = fb;
                } else {
                    bl[q] = V(i0 + 1, j0 + 1); bl[q + 1] = V(i0, j0 + 1); bl[q + 2] = V(i0 + 1, j0);
                    bw[q] = fa + fb - 1; bw[q + 1] = 1 - fa; bw[q + 2] = 1 - fb;
                }
                for (let t = 0; t < 3; t += 1) if (!(bl[q + t] >= 0)) bl[q + t] = best;
                break;
            }
        }
        return y >= H;
    };
    return { row, field };
}

/** Where a sphere point falls on the sheet, in pixels (the first face that holds it). */
export function sheetPoint(layout: SheetLayout, p: readonly [number, number, number]): [number, number] {
    const faces = gridOf(1).faces;
    for (const f of faces) {
        const w = solveWeights(f.A, f.B, f.C, p);
        if (!w) continue;
        const sum = w[0] + w[1] + w[2];
        if (!(sum > 0)) continue;
        const w0 = w[0] / sum;
        const w1 = w[1] / sum;
        const w2 = w[2] / sum;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        const nx = w0 * f.a[0] + w1 * f.b[0] + w2 * f.c[0];
        const ny = w0 * f.a[1] + w1 * f.b[1] + w2 * f.c[1];
        return [layout.ox + nx * layout.side, layout.oy + ny * layout.side];
    }
    return [layout.ox, layout.oy];
}

type V = readonly [number, number, number];
function det3(a: V, b: V, c: V): number {
    return a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
}
/** Weights w with w0·A + w1·B + w2·C = p (Cramer's rule). */
function solveWeights(A: V, B: V, C: V, p: V): [number, number, number] | null {
    const d = det3(A, B, C);
    if (Math.abs(d) < 1e-12) return null;
    return [det3(p, B, C) / d, det3(A, p, C) / d, det3(A, B, p) / d];
}

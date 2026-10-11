/**
 * The hex grid of the hybrid surface map (design §4): an icosahedron of 20 triangles, each
 * cut into a triangular lattice of side n. Every lattice point is a hex (12 of them, the
 * icosahedron's corners, are pentagons). A world of size n has 10·n² + 2 hexes.
 *
 * Coordinates: unit vectors with y up, x = cos(lat)·cos(lon), z = cos(lat)·sin(lon), so
 * longitude grows eastward and the noise fields of vanilla/map_fields.ts read them as they are.
 *
 * Addressing: the flat net lays the triangles out in rows. A lattice point's row is its
 * height on the net in lattice steps, 0 (north pole) to 3n (south pole), and is the same on
 * every triangle that shares it. Its column is its rank by longitude within the row. The id
 * is the hex's place in that row-major order. Row r holds 1, 5r, 5n or 5(3n − r) hexes.
 */
export type V3 = readonly [number, number, number];
export type NetPoint = readonly [number, number];

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const sphere = (latRad: number, lonRad: number): V3 => [
    Math.cos(latRad) * Math.cos(lonRad), Math.sin(latRad), Math.cos(latRad) * Math.sin(lonRad),
];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (p: readonly number[]): V3 => {
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    return [p[0] / l, p[1] / l, p[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function latOf(p: V3): number {
    return Math.asin(Math.max(-1, Math.min(1, p[1]))) * R2D;
}
export function lonOf(p: V3): number {
    return Math.atan2(p[2], p[0]) * R2D;
}

/**
 * One triangle of the net: its corners on the sphere (A, B, C) and on the flat net (a, b, c),
 * in units of the triangle side (side 1). Lattice point (i, j) is A + i/n·(B − A) + j/n·(C − A).
 */
export type Face = {
    readonly A: V3; readonly B: V3; readonly C: V3;
    readonly a: NetPoint; readonly b: NetPoint; readonly c: NetPoint;
    /** Net row of A, and the row steps per i and per j (in units of n). */
    readonly rowA: number; readonly rowI: number; readonly rowJ: number;
};

export const NET_WIDTH = 5.5;
export const NET_HEIGHT = 1.5 * Math.sqrt(3);

/** The 20 faces: five north, ten in the band, five south. Side 1. */
export function buildNet(): readonly Face[] {
    const h = Math.sqrt(3) / 2;
    const T = Math.atan(0.5);
    const NP: V3 = [0, 1, 0];
    const SP: V3 = [0, -1, 0];
    const U = (k: number): V3 => sphere(T, (-180 + 72 * k) * D2R);
    const L = (k: number): V3 => sphere(-T, (-144 + 72 * k) * D2R);
    const Un = (k: number): NetPoint => [k, h];
    const Ln = (k: number): NetPoint => [k + 0.5, 2 * h];
    const faces: Face[] = [];
    for (let k = 0; k < 5; k += 1) faces.push({ A: NP, B: U(k), C: U(k + 1), a: [k + 0.5, 0], b: Un(k), c: Un(k + 1), rowA: 0, rowI: 1, rowJ: 1 });
    for (let k = 0; k < 5; k += 1) {
        faces.push({ A: U(k), B: U(k + 1), C: L(k), a: Un(k), b: Un(k + 1), c: Ln(k), rowA: 1, rowI: 0, rowJ: 1 });
        faces.push({ A: L(k), B: L(k + 1), C: U(k + 1), a: Ln(k), b: Ln(k + 1), c: Un(k + 1), rowA: 2, rowI: 0, rowJ: -1 });
    }
    for (let k = 0; k < 5; k += 1) faces.push({ A: L(k), B: L(k + 1), C: SP, a: Ln(k), b: Ln(k + 1), c: [k + 1, 3 * h], rowA: 2, rowI: 0, rowJ: 1 });
    return faces;
}

/** Barycentric weights of net point (x, y) (side-1 units) in a face: [wA, wB, wC]. */
export function bary(f: Face, x: number, y: number): [number, number, number] {
    const [ax, ay] = f.a;
    const [bx, by] = f.b;
    const [cx, cy] = f.c;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
    const w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    return [w0, w1, 1 - w0 - w1];
}

/** The sphere point under barycentric weights: gnomonic within the face. */
export function facePoint(f: Face, w0: number, w1: number, w2: number): V3 {
    return norm([
        w0 * f.A[0] + w1 * f.B[0] + w2 * f.C[0],
        w0 * f.A[1] + w1 * f.B[1] + w2 * f.C[1],
        w0 * f.A[2] + w1 * f.B[2] + w2 * f.C[2],
    ]);
}

/** Net position (side-1 units) of lattice point (i, j) on a face. */
export function latticeNet(f: Face, n: number, i: number, j: number): NetPoint {
    return [
        f.a[0] + (i / n) * (f.b[0] - f.a[0]) + (j / n) * (f.c[0] - f.a[0]),
        f.a[1] + (i / n) * (f.b[1] - f.a[1]) + (j / n) * (f.c[1] - f.a[1]),
    ];
}

export type HexAddress = { readonly row: number; readonly col: number };

export type Grid = {
    readonly n: number;
    readonly count: number;
    readonly faces: readonly Face[];
    /** Unit vector of each hex centre, by id. */
    readonly P: readonly V3[];
    readonly lat: Float64Array;
    readonly lon: Float64Array;
    /** Share of the sphere's area nearest each hex; sums to 1. */
    readonly area: Float64Array;
    /** The first face that holds the hex. */
    readonly face: Int16Array;
    readonly row: Int32Array;
    readonly col: Int32Array;
    /** First id of each row, 3n + 2 entries (the last is count). */
    readonly rowStart: Int32Array;
    /** Neighbour ids, ascending. Five for the 12 corners, six otherwise. */
    readonly nb: readonly (readonly number[])[];
    /** Per face, (i·(n+1) + j) to hex id. */
    readonly vid: readonly Int32Array[];
};

/** Hexes in row r of a grid of side n. */
export function rowLength(n: number, r: number): number {
    if (r === 0 || r === 3 * n) return 1;
    if (r <= n) return 5 * r;
    if (r <= 2 * n) return 5 * n;
    return 5 * (3 * n - r);
}

export function hexCount(n: number): number {
    return 10 * n * n + 2;
}

const grids = new Map<number, Grid>();

/** The grid of side n (n ≥ 1), built once. */
export function gridOf(n: number): Grid {
    const side = Math.max(1, Math.floor(n));
    let grid = grids.get(side);
    if (!grid) {
        grid = buildGrid(side);
        grids.set(side, grid);
    }
    return grid;
}

function buildGrid(n: number): Grid {
    const faces = buildNet();
    const key = (p: V3): string => Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6) + ',' + Math.round(p[2] * 1e6);
    const found = new Map<string, number>();
    const pts: V3[] = [];
    const rows: number[] = [];
    const firstFace: number[] = [];
    const raw = faces.map(() => new Int32Array((n + 1) * (n + 1)).fill(-1));
    faces.forEach((f, fi) => {
        for (let i = 0; i <= n; i += 1) {
            for (let j = 0; i + j <= n; j += 1) {
                const p = facePoint(f, 1 - (i + j) / n, i / n, j / n);
                const k = key(p);
                let id = found.get(k);
                if (id === undefined) {
                    id = pts.length;
                    found.set(k, id);
                    pts.push(p);
                    rows.push(f.rowA * n + f.rowI * i + f.rowJ * j);
                    firstFace.push(fi);
                }
                raw[fi][i * (n + 1) + j] = id;
            }
        }
    });
    const count = pts.length;
    // Row-major order: by row, then by longitude from -180.
    const lonRaw = pts.map((p) => lonOf(p));
    const order = pts.map((_, id) => id).sort((x, y) => rows[x] - rows[y] || lonRaw[x] - lonRaw[y]);
    const remap = new Int32Array(count);
    order.forEach((oldId, newId) => { remap[oldId] = newId; });
    const P: V3[] = order.map((oldId) => pts[oldId]);
    const row = new Int32Array(order.map((oldId) => rows[oldId]));
    const face = new Int16Array(order.map((oldId) => firstFace[oldId]));
    const rowStart = new Int32Array(3 * n + 2);
    for (let r = 0, at = 0; r <= 3 * n + 1; r += 1) {
        rowStart[r] = at;
        if (r <= 3 * n) at += rowLength(n, r);
    }
    const col = new Int32Array(count);
    for (let id = 0; id < count; id += 1) col[id] = id - rowStart[row[id]];
    const vid = raw.map((table) => table.map((oldId) => remap[oldId]));
    const nbs = P.map(() => new Set<number>());
    const area = new Float64Array(count);
    faces.forEach((_, fi) => {
        const V = (i: number, j: number): number => vid[fi][i * (n + 1) + j];
        for (let i = 0; i <= n; i += 1) {
            for (let j = 0; i + j <= n; j += 1) {
                const me = V(i, j);
                for (const [di, dj] of [[1, 0], [0, 1], [-1, 1], [1, -1], [-1, 0], [0, -1]]) {
                    const a = i + di;
                    const b = j + dj;
                    if (a >= 0 && b >= 0 && a + b <= n) nbs[me].add(V(a, b));
                }
                const tri = (x: number, y: number, z: number): void => {
                    const pa = P[x];
                    const pb = P[y];
                    const pc = P[z];
                    const e = 2 * Math.atan2(Math.abs(dot(pa, cross(pb, pc))), 1 + dot(pa, pb) + dot(pb, pc) + dot(pc, pa));
                    area[x] += e / 3;
                    area[y] += e / 3;
                    area[z] += e / 3;
                };
                if (i + j + 1 <= n) tri(V(i, j), V(i + 1, j), V(i, j + 1));
                if (i + j + 2 <= n) tri(V(i + 1, j), V(i + 1, j + 1), V(i, j + 1));
            }
        }
    });
    let total = 0;
    for (let id = 0; id < count; id += 1) total += area[id];
    for (let id = 0; id < count; id += 1) area[id] /= total;
    return {
        n,
        count,
        faces,
        P,
        lat: new Float64Array(P.map(latOf)),
        lon: new Float64Array(P.map(lonOf)),
        area,
        face,
        row,
        col,
        rowStart,
        nb: nbs.map((set) => [...set].sort((x, y) => x - y)),
        vid,
    };
}

export function addressOf(grid: Grid, id: number): HexAddress | null {
    if (!(id >= 0 && id < grid.count)) return null;
    return { row: grid.row[id], col: grid.col[id] };
}

export function hexAt(grid: Grid, address: HexAddress): number | null {
    const { row, col } = address;
    if (!(row >= 0 && row <= 3 * grid.n)) return null;
    if (!(col >= 0 && col < rowLength(grid.n, row))) return null;
    return grid.rowStart[row] + col;
}

/** The hex nearest a sphere point. */
export function nearestHex(grid: Grid, p: V3): number {
    let best = 0;
    let bestDot = -2;
    for (let id = 0; id < grid.count; id += 1) {
        const d = dot(grid.P[id], p);
        if (d > bestDot) {
            bestDot = d;
            best = id;
        }
    }
    return best;
}

/** Angle in radians between neighbouring hex centres, roughly: the icosahedron edge over n. */
export function hexSpacing(n: number): number {
    return 1.1071487177940904 / Math.max(1, n);
}

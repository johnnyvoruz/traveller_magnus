/**
 * Which surface hex is under a point, and the polygon to stroke around it.
 * The sheet painters do not import this. The stage draws the polygon on its own canvas.
 */
import { sheetPoint, type SheetLayout } from './hybrid/field.ts';
import { latticeNet, type Grid } from './hybrid/grid.ts';
import { POLE_FRAC } from './vanilla/map_fields.ts';
import { vanillaHexLattice, type VanillaHexLattice } from './vanilla/map_grid.ts';

const CENTRE = new WeakMap<Grid, Map<number, Float64Array>>();

function centresOf(grid: Grid, layout: SheetLayout): Float64Array {
    let bySide = CENTRE.get(grid);
    if (!bySide) {
        bySide = new Map();
        CENTRE.set(grid, bySide);
    }
    let xy = bySide.get(layout.side);
    if (xy) return xy;
    xy = new Float64Array(grid.count * 2);
    for (let id = 0; id < grid.count; id += 1) {
        const p = sheetPoint(layout, grid.P[id]);
        xy[id * 2] = p[0];
        xy[id * 2 + 1] = p[1];
    }
    bySide.set(layout.side, xy);
    return xy;
}

/**
 * The hybrid hex nearest a sheet point, or null when the point is farther than the
 * stage's existing pick limit (0.7 of the lattice step).
 */
export function hybridHit(grid: Grid, layout: SheetLayout, x: number, y: number): number | null {
    const xy = centresOf(grid, layout);
    const limit = (layout.side / grid.n) * 0.7;
    const limit2 = limit * limit;
    let best = -1;
    let bestD = Infinity;
    for (let id = 0; id < grid.count; id += 1) {
        const dx = xy[id * 2] - x;
        const dy = xy[id * 2 + 1] - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
            bestD = d;
            best = id;
        }
    }
    if (best < 0 || bestD > limit2) return null;
    return best;
}

type Place = { fi: number; i: number; j: number };

function placesOf(grid: Grid, id: number): Place[] {
    const n = grid.n;
    const out: Place[] = [];
    for (let fi = 0; fi < grid.faces.length; fi += 1) {
        const table = grid.vid[fi];
        for (let i = 0; i <= n; i += 1) {
            for (let j = 0; i + j <= n; j += 1) {
                if (table[i * (n + 1) + j] === id) out.push({ fi, i, j });
            }
        }
    }
    return out;
}

function sheetOf(grid: Grid, layout: SheetLayout, place: Place): [number, number] {
    const [nx, ny] = latticeNet(grid.faces[place.fi], grid.n, place.i, place.j);
    return [layout.ox + nx * layout.side, layout.oy + ny * layout.side];
}

const STEPS: readonly (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/**
 * The hex (or pentagon) around a hybrid hex, in sheet pixels.
 * An interior hex uses the cell corners. A hex split by the net uses a regular outline
 * of the same step, so the stroke still closes.
 */
export function hybridOutline(grid: Grid, layout: SheetLayout, id: number): [number, number][] {
    if (!(id >= 0 && id < grid.count)) return [];
    const xy = centresOf(grid, layout);
    const cx = xy[id * 2];
    const cy = xy[id * 2 + 1];
    const places = placesOf(grid, id);
    let home: Place | null = null;
    let homeD = Infinity;
    for (const place of places) {
        const p = sheetOf(grid, layout, place);
        const d = (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy);
        if (d < homeD) {
            homeD = d;
            home = place;
        }
    }
    const near: [number, number][] = [];
    const reach = (layout.side / grid.n) * 1.6;
    const reach2 = reach * reach;
    if (home) {
        const n = grid.n;
        for (const [di, dj] of STEPS) {
            const i = home.i + di;
            const j = home.j + dj;
            if (i < 0 || j < 0 || i + j > n) continue;
            const p = sheetOf(grid, layout, { fi: home.fi, i, j });
            const d = (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy);
            if (d <= reach2) near.push(p);
        }
    }
    const sides = grid.nb[id].length === 5 ? 5 : 6;
    if (near.length >= sides) {
        near.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
        const ring: [number, number][] = [];
        for (let i = 0; i < near.length; i += 1) {
            const a = near[i];
            const b = near[(i + 1) % near.length];
            ring.push([(cx + a[0] + b[0]) / 3, (cy + a[1] + b[1]) / 3]);
        }
        return ring;
    }
    const radius = (layout.side / grid.n) / Math.sqrt(3);
    const turn = near.length ? Math.atan2(near[0][1] - cy, near[0][0] - cx) + Math.PI / sides : Math.PI / 6;
    const ring: [number, number][] = [];
    for (let v = 0; v < sides; v += 1) {
        const angle = turn + v * (2 * Math.PI / sides);
        ring.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
    return ring;
}

export type VanillaHit = {
    readonly row: number;
    readonly col: number;
    readonly cx: number;
    readonly cy: number;
    readonly ring: [number, number][];
};

function inTri(x: number, y: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
    const c1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const c2 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
    const c3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
    return (c1 >= 0 && c2 >= 0 && c3 >= 0) || (c1 <= 0 && c2 <= 0 && c3 <= 0);
}

/** The diamond the vanilla grid is clipped to. Lobes match drawHexGrid's separator count. */
export function insideDiamond(x: number, y: number, W: number, H: number, lobes: number): boolean {
    if (!(x >= 0 && y >= 0 && x <= W && y <= H)) return false;
    if (!(lobes > 0)) return true;
    const bandTop = H * POLE_FRAC;
    const bandBot = H - bandTop;
    if (y >= bandTop && y <= bandBot) return true;
    const hw = W / (2 * lobes);
    if (y < bandTop) {
        for (let li = 0; li <= lobes; li += 1) {
            const cx = li * W / lobes;
            if (inTri(x, y, cx, 0, cx + hw, bandTop, cx - hw, bandTop)) return true;
        }
        return false;
    }
    for (let li = 0; li < lobes; li += 1) {
        const cx = (li + 0.5) * W / lobes;
        if (inTri(x, y, cx, H, cx + hw, bandBot, cx - hw, bandBot)) return true;
    }
    return false;
}

function vanillaRing(lattice: VanillaHexLattice, cx: number, cy: number): [number, number][] {
    const ring: [number, number][] = [];
    for (let v = 0; v < 6; v += 1) {
        const angle = Math.PI / 6 + v * Math.PI / 3;
        ring.push([cx + lattice.R * Math.cos(angle), cy + lattice.R * Math.sin(angle)]);
    }
    return ring;
}

function vanillaCentre(lattice: VanillaHexLattice, row: number, col: number): [number, number] {
    const xOffset = (row & 1) ? lattice.colStep / 2 : 0;
    return [col * lattice.colStep + lattice.xPhase + xOffset, lattice.yOffset + row * lattice.rowStep];
}

/**
 * The vanilla diamond hex under a sheet point, or null off the diamond.
 * The ring is the same six vertices drawHexGrid strokes.
 */
export function vanillaHit(x: number, y: number, W: number, H: number, size: number, lobes: number): VanillaHit | null {
    const lattice = vanillaHexLattice(W, H, size, lobes);
    if (!lattice || !insideDiamond(x, y, W, H, lobes)) return null;
    const r0 = Math.round((y - lattice.yOffset) / lattice.rowStep);
    let best: VanillaHit | null = null;
    let bestD = lattice.R * lattice.R;
    for (let row = r0 - 1; row <= r0 + 1; row += 1) {
        const xOffset = (row & 1) ? lattice.colStep / 2 : 0;
        const c0 = Math.round((x - lattice.xPhase - xOffset) / lattice.colStep);
        for (let col = c0 - 1; col <= c0 + 1; col += 1) {
            const [cx, cy] = vanillaCentre(lattice, row, col);
            const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
            if (d <= bestD) {
                bestD = d;
                best = { row, col, cx, cy, ring: vanillaRing(lattice, cx, cy) };
            }
        }
    }
    return best;
}

/**
 * Hold the latest pointer and run the hit-test once per frame.
 * A second point before the frame runs replaces the first. Touch never calls this.
 */
export function queueHover<T>(slot: { point: T | null; open: boolean }, point: T, request: (run: () => void) => void, run: (point: T) => void): void {
    slot.point = point;
    if (slot.open) return;
    slot.open = true;
    request(() => {
        slot.open = false;
        const held = slot.point;
        slot.point = null;
        if (held !== null) run(held);
    });
}

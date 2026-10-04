/**
 * Tile sizes, atlas packing and bake job order for the vanilla orbit disc.
 * js/planet_gl.js:18 (HALO), 937-945, 978-993, 1014-1038, 1132-1142.
 * Pure. No WebGL.
 */

/** js/planet_gl.js:18 */
export const HALO = 0.16;

/** js/planet_gl.js:980 and 987. The atlas stops growing at this edge. */
export const ATLAS_CAP = 4096;

export type Vec3 = [number, number, number];

export type AxisBasis = { axis: Vec3; e1: Vec3; e2: Vec3 };

/**
 * js/planet_gl.js:1134-1141. View space: x right, y down the screen, z toward you.
 * A degenerate rejected vector becomes the unit x axis.
 */
export function axisBasis(profile: { axisAzimuth: number }, tiltDeg: number): AxisBasis {
    const tilt = tiltDeg * Math.PI / 180;
    const az = profile.axisAzimuth;
    const axis: Vec3 = [Math.sin(tilt) * Math.cos(az), Math.sin(tilt) * Math.sin(az), Math.cos(tilt)];
    const raw: Vec3 = [axis[2], 0, -axis[0]];
    const len = Math.hypot(raw[0], raw[1], raw[2]);
    const e1: Vec3 = len > 1e-6 ? [raw[0] / len, raw[1] / len, raw[2] / len] : [1, 0, 0];
    const e2: Vec3 = [
        axis[1] * e1[2] - axis[2] * e1[1],
        axis[2] * e1[0] - axis[0] * e1[2],
        axis[0] * e1[1] - axis[1] * e1[0],
    ];
    return { axis, e1, e2 };
}

/** js/planet_gl.js:1036. ringOuter is null when the request has no ring. */
export function tileReach(radius: number, ringOuter: number | null): number {
    return radius * Math.max(1 + HALO, ringOuter != null ? ringOuter * 1.01 : 0);
}

/** js/planet_gl.js:1037. */
export function tileSide(radius: number, ringOuter: number | null): number {
    return Math.ceil(tileReach(radius, ringOuter) * 2) + 2;
}

/**
 * Where a held tile is blitted. Centred on (cx, cy).
 * The tile was rendered for renderedRadius device pixels and includes its halo,
 * so a different draw radius scales the whole tile. A non-positive rendered
 * radius is drawn at the tile's own side, which avoids dividing by zero.
 */
export function discDest(
    size: number,
    renderedRadius: number,
    cx: number,
    cy: number,
    radiusPx: number,
): { x: number; y: number; w: number; h: number } {
    const side = renderedRadius > 0 ? size * (radiusPx / renderedRadius) : size;
    return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
}

export type AtlasPlacement = { index: number; tileSize: number; tx: number; ty: number };

/**
 * js/planet_gl.js:978-993. Shelf pack, largest tile first, stable.
 * Copies items. The canvas only grows, and only up to ATLAS_CAP.
 * A tile whose bottom passes the grown height is dropped.
 */
export function packAtlas(
    items: { tileSize: number }[],
    canvasWidth: number,
    canvasHeight: number,
): { width: number; height: number; placed: AtlasPlacement[] } {
    const tagged = items.map((item, index) => ({ tileSize: item.tileSize, index, tx: 0, ty: 0 }));
    const sorted = [...tagged].sort((a, b) => b.tileSize - a.tileSize);
    let width = Math.max(canvasWidth, Math.min(ATLAS_CAP, sorted[0]?.tileSize || 0));
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const req of sorted) {
        if (x + req.tileSize > width) {
            x = 0;
            y += shelf;
            shelf = 0;
        }
        req.tx = x;
        req.ty = y;
        x += req.tileSize;
        shelf = Math.max(shelf, req.tileSize);
    }
    const content = Math.min(ATLAS_CAP, y + shelf);
    let grownW = canvasWidth;
    let grownH = canvasHeight;
    if (width > canvasWidth || content > canvasHeight) {
        grownW = Math.max(canvasWidth, width);
        grownH = Math.max(canvasHeight, content);
    }
    const placed = sorted
        .filter((req) => req.ty + req.tileSize <= grownH)
        .map((req) => ({ index: req.index, tileSize: req.tileSize, tx: req.tx, ty: req.ty }));
    return { width: grownW, height: grownH, placed };
}

/**
 * js/planet_gl.js:937-945. Finished sizes only, in insertion order.
 * A size at least `want` wins a near tie by 0.01. The first minimum wins.
 */
export function bestCubeSize(sizes: number[], want: number): number | null {
    let best: number | null = null;
    let bestScore = Infinity;
    for (const size of sizes) {
        const score = Math.abs(Math.log2(size / want)) - (size >= want ? 0.01 : 0);
        if (score < bestScore) {
            best = size;
            bestScore = score;
        }
    }
    return best;
}

export type BakeJobState = { size: number; face: number } | null;

export type BakePlan = { paint32: boolean; dropJob: boolean; start: number | null };

/**
 * js/planet_gl.js:1017-1030. The 32 px cube is painted before the job test,
 * so a wanted 32 does not also start a job. A job whose face is still 0 is
 * replaced. A started job is replaced only by a larger want.
 */
export function planBake(finished: number[], job: BakeJobState, want: number): BakePlan {
    const present = new Set(finished);
    const paint32 = finished.length === 0;
    if (paint32) present.add(32);
    let dropJob = false;
    let start: number | null = null;
    if (!present.has(want) && (!job || job.size !== want)) {
        if (!job || job.face === 0 || want > job.size) {
            dropJob = !!job;
            start = want;
        }
    }
    return { paint32, dropJob, start };
}

/** One frame of the first bake. Coarse work stops when this is used. */
export const FRAME_BAKE_MS = 8;

export type FrameBody = {
    id: string;
    /** Smaller is nearer the selected body. */
    near: number;
    hasStats: boolean;
    has32: boolean;
    want: number;
    finished: number[];
    job: BakeJobState;
};

export type FrameAction =
    | { kind: 'stop' }
    | { kind: 'stats'; id: string }
    | { kind: 'cube32'; id: string }
    | { kind: 'start'; id: string; size: number }
    | { kind: 'face'; id: string };

/**
 * At most one body's statistics and 32 px cube while the frame is under budget.
 * Larger cubes start on a later frame, nearest to the selected body first.
 */
export function planFrame(
    bodies: FrameBody[],
    spentMs: number,
    coarseId: string | null,
    budgetMs = FRAME_BAKE_MS,
): { action: FrameAction; coarseId: string | null } {
    if (!(spentMs < budgetMs)) return { action: { kind: 'stop' }, coarseId };
    const ordered = bodies
        .map((body, index) => ({ body, index }))
        .sort((a, b) => a.body.near - b.body.near || a.index - b.index)
        .map((row) => row.body);
    if (coarseId) {
        const body = ordered.find((item) => item.id === coarseId);
        if (body && !body.has32) return { action: { kind: 'cube32', id: body.id }, coarseId };
        return { action: { kind: 'stop' }, coarseId };
    }
    const coarse = ordered.find((body) => !body.hasStats || !body.has32);
    if (coarse) {
        if (!coarse.hasStats) return { action: { kind: 'stats', id: coarse.id }, coarseId: coarse.id };
        return { action: { kind: 'cube32', id: coarse.id }, coarseId: coarse.id };
    }
    for (const body of ordered) {
        const plan = planBake(body.finished, body.job, body.want);
        if (plan.start != null) return { action: { kind: 'start', id: body.id, size: plan.start }, coarseId: null };
        if (body.job && body.job.face < 6) return { action: { kind: 'face', id: body.id }, coarseId: null };
    }
    return { action: { kind: 'stop' }, coarseId: null };
}

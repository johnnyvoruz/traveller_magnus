/**
 * The software disc worker: orbit discs painted from globes when the browser has no WebGL.
 * The page posts a watch every frame; only the newest is kept. Work runs in slices of about
 * SLICE_MS: first every disc whose picture changed and whose globe is ready is painted, then
 * the next globe is built a step at a time. A body's first globe is small so it shows at once;
 * a sharper one follows when its disc is large (as the WebGL bakes go from 32 px up).
 * Globes are kept until GLOBE_BYTES, the least recently used first out; tile geometry is kept
 * per radius, tilt and ring. A disc is painted again only when its picture would change.
 */
import type { WorkerState, WorkerTile, WorkerTiles } from '../vanilla/gl_messages.ts';
import { discGeometry, globeRowSums, paintSoftDisc, type DiscGeometry, type SoftTile } from './disc_paint.ts';
import { startGlobe, type Globe, type GlobeBuild } from './globe.ts';
import { SOFT_MAX_RADIUS, type SoftDisc, type SoftWatch } from './messages.ts';

const SLICE_MS = 24;
const GLOBE_BYTES = 96 * 1024 * 1024;
const GEOMETRIES = 48;
/** Every body's first globe: small enough to paint in a slice or two, so each disc shows at once. */
const FIRST_ROWS = 64;

export type SoftPort = {
    postMessage(data: WorkerState | WorkerTiles, transfer?: Transferable[]): void;
    addEventListener(type: 'message', listener: (event: { data: SoftWatch }) => void): void;
};

export type SoftWorkerOptions = {
    clock?: () => number;
    schedule?: (fn: () => void) => void;
    /** Turns a painted tile into the image the page draws. The default is an ImageBitmap. */
    toImage?: (tile: SoftTile) => Promise<ImageBitmap>;
};

/** Globe rows for a disc radius in device pixels: about one texel per pixel at the pole. */
export function rowsFor(radius: number): number {
    if (radius <= 24) return 64;
    if (radius <= 64) return 128;
    if (radius <= 160) return 256;
    return 512;
}

type Held = { rows: number; globe: Globe; sums: Float32Array | null; used: number };
type Building = { key: string; rows: number; build: GlobeBuild };

function bytesOf(held: Held): number {
    return held.globe.pixels.byteLength + (held.sums ? held.sums.byteLength : 0);
}

function fixed(n: number, places: number): string {
    return Number.isFinite(n) ? n.toFixed(places) : '0';
}

/** Everything that changes a disc's pixels. Spin counts in half-pixel steps at the limb. */
function signature(disc: SoftDisc, radius: number, rows: number, watch: SoftWatch): string {
    const blur = Math.round((disc.sweep / (Math.PI * 2)) * rows * 2);
    const ring = disc.ring ? fixed(disc.ring.opacity, 3) + ',' + fixed(disc.ring.inner, 3) + ',' + fixed(disc.ring.outer, 3) : '-';
    return [
        watch.mode, watch.version, watch.generation, rows, fixed(radius, 2), fixed(disc.tiltDeg, 2), fixed(disc.axisAzimuth, 4),
        fixed(disc.lonOffset, 4), Math.round(disc.spin * radius * 2), blur >= 2 ? blur : 0,
        fixed(disc.light[0] ?? 0, 3), fixed(disc.light[1] ?? 0, 3), disc.sun.map((v) => fixed(v, 3)).join(','),
        disc.casters.map((c) => c.map((v) => fixed(v, 3)).join(',')).join(';'), ring, disc.lightMode ? 1 : 0, fixed(disc.air, 3),
        disc.gas ? 1 : 0,
    ].join('|');
}

export function attachSoftDiscWorker(port: SoftPort, options: SoftWorkerOptions = {}): void {
    const clock = options.clock ?? (() => performance.now());
    const schedule = options.schedule ?? ((fn: () => void) => { setTimeout(fn, 0); });
    const canImage = options.toImage !== undefined || typeof createImageBitmap === 'function';
    const toImage = options.toImage
        ?? ((tile: SoftTile) => createImageBitmap(new ImageData(tile.pixels as Uint8ClampedArray<ArrayBuffer>, tile.side, tile.side)));
    let latest: SoftWatch | null = null;
    let scheduled = false;
    const globes = new Map<string, Held>();
    const geometries = new Map<string, DiscGeometry>();
    const drawn = new Map<string, string>();
    let building: Building | null = null;
    let tick = 0;

    const state = (failed: boolean): WorkerState => ({ op: 'state', ready: !failed, lost: false, failed });

    function kick(): void {
        if (scheduled) return;
        scheduled = true;
        schedule(() => {
            scheduled = false;
            slice();
        });
    }

    function geometryOf(disc: SoftDisc, radius: number): DiscGeometry {
        const ring = disc.ring ? { inner: disc.ring.inner, outer: disc.ring.outer } : null;
        const key = [fixed(radius, 2), fixed(disc.tiltDeg, 2), fixed(disc.axisAzimuth, 4), ring ? fixed(ring.inner, 3) + ',' + fixed(ring.outer, 3) : '-'].join('|');
        let geo = geometries.get(key);
        if (!geo) {
            if (geometries.size >= GEOMETRIES) geometries.clear();
            geo = discGeometry(radius, disc.tiltDeg, disc.axisAzimuth, ring);
            geometries.set(key, geo);
        }
        return geo;
    }

    function evict(keep: ReadonlySet<string>): void {
        let total = 0;
        for (const held of globes.values()) total += bytesOf(held);
        if (total <= GLOBE_BYTES) return;
        const order = [...globes.entries()].filter(([key]) => !keep.has(key)).sort((a, b) => a[1].used - b[1].used);
        for (const [key, held] of order) {
            if (total <= GLOBE_BYTES) break;
            total -= bytesOf(held);
            globes.delete(key);
        }
    }

    /** The globe size each body wants now: the largest of its discs' sizes. Largest discs first. */
    function wanted(watch: SoftWatch): Map<string, { rows: number; disc: SoftDisc }> {
        const want = new Map<string, { rows: number; disc: SoftDisc }>();
        const bySize = [...watch.discs].sort((a, b) => b.radiusPx - a.radiusPx);
        for (const disc of bySize) {
            const rows = rowsFor(Math.min(disc.radiusPx, SOFT_MAX_RADIUS));
            const had = want.get(disc.globe.key);
            if (!had || rows > had.rows) want.set(disc.globe.key, { rows, disc });
        }
        return want;
    }

    /** The next globe to build: a body with none first, in the batch's order; then a sharper one. */
    function nextTarget(watch: SoftWatch): { key: string; rows: number; disc: SoftDisc } | null {
        const want = wanted(watch);
        for (const [key, { rows, disc }] of want) {
            if (globes.has(key)) continue;
            return { key, rows: Math.min(rows, FIRST_ROWS), disc };
        }
        for (const [key, { rows, disc }] of want) {
            const held = globes.get(key);
            if (held && held.rows < rows) return { key, rows, disc };
        }
        return null;
    }

    function slice(): void {
        const watch = latest;
        if (!watch) return;
        const began = clock();
        const spent = (): boolean => clock() - began >= SLICE_MS;
        tick += 1;
        const tiles: { key: string; radius: number; tile: SoftTile }[] = [];
        let more = false;
        for (const disc of watch.discs) {
            const held = globes.get(disc.globe.key);
            if (!held) continue;
            held.used = tick;
            const radius = Math.min(disc.radiusPx, SOFT_MAX_RADIUS);
            const sig = signature(disc, radius, held.rows, watch);
            if (drawn.get(disc.key) === sig) continue;
            if (spent()) {
                more = true;
                break;
            }
            const blur = (disc.sweep / (Math.PI * 2)) * held.globe.width >= 1.5;
            if (blur && !held.sums) held.sums = globeRowSums(held.globe);
            const tile = paintSoftDisc(held.globe, disc, geometryOf(disc, radius), blur ? held.sums : null);
            tiles.push({ key: disc.key, radius, tile });
            drawn.set(disc.key, sig);
        }
        if (building && !wanted(watch).has(building.key)) building = null;
        if (!building && !more) {
            const target = nextTarget(watch);
            if (target) building = { key: target.key, rows: target.rows, build: startGlobe(target.disc.globe.recipe, target.rows, clock, SLICE_MS) };
        }
        let finished = false;
        if (building && !spent()) {
            // A build's own steps are small (the hybrid one is made for the page): run them to the slice's end.
            let done = building.build.step();
            while (!done && !spent()) done = building.build.step();
            if (done) {
                const done = building;
                building = null;
                finished = true;
                globes.set(done.key, { rows: done.rows, globe: done.build.globe, sums: null, used: tick });
                evict(new Set(watch.discs.map((disc) => disc.globe.key)));
            }
        }
        // A finished globe is painted onto its discs on the next slice.
        if (building || more || finished || nextTarget(watch) !== null) kick();
        if (tiles.length > 0) void post(watch, tiles);
    }

    async function post(watch: SoftWatch, tiles: { key: string; radius: number; tile: SoftTile }[]): Promise<void> {
        const out: WorkerTile[] = [];
        for (const row of tiles) {
            out.push({ key: row.key, size: row.tile.side, radiusPx: row.radius, image: await toImage(row.tile) });
        }
        const message: WorkerTiles = {
            op: 'tiles', ready: true, lost: false, failed: false, slow: [], delivery: 'tiles',
            mode: watch.mode, version: watch.version, generation: watch.generation, tiles: out,
        };
        port.postMessage(message, out.map((tile) => tile.image));
    }

    port.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.op !== 'watch' || !canImage) return;
        latest = message;
        kick();
    });

    port.postMessage(state(!canImage));
}

type WorkerScope = {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    addEventListener(type: string, listener: (event: MessageEvent) => void): void;
    document?: Document;
};

const scope = globalThis as unknown as WorkerScope;
if (typeof scope.addEventListener === 'function' && typeof scope.postMessage === 'function' && typeof scope.document === 'undefined'
    && typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
    attachSoftDiscWorker({
        postMessage(data, transfer) {
            scope.postMessage(data, transfer);
        },
        addEventListener(_type, listener) {
            scope.addEventListener('message', (event) => {
                listener({ data: event.data as SoftWatch });
            });
        },
    });
}

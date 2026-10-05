/**
 * Vanilla disc GL off the page thread. The canvas here is an OffscreenCanvas.
 * The page posts batches and receives tiles. It does not create this canvas.
 */
import { cubeSizeFor, MEMORY_BUDGET, type BakeProfile, type CubeFaces, type GpuSpan } from './gl_bake.ts';
import { createDiscBaker, type DiscBaker, type DiscCapture } from './gl.ts';
import type { AtlasSlot, DiscDelivery, RpcRequest, WatchRequest, WorkerTile } from './gl_messages.ts';
import type { ShadeRequest } from './gl_shade.ts';

type Scope = {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = globalThis as unknown as Scope;

let baker: DiscBaker | null = null;
let canvas: OffscreenCanvas | null = null;
let warmed = false;
let watch: WatchRequest | null = null;
const jobs: (() => Promise<void>)[] = [];
let running = false;

function post(message: unknown, transfer?: Transferable[]): void {
    if (transfer && transfer.length) scope.postMessage(message, transfer);
    else scope.postMessage(message);
}

function session(): DiscBaker {
    if (baker) return baker;
    canvas = new OffscreenCanvas(1024, 1024);
    baker = createDiscBaker(canvas, {
        onLost: () => {
            warmed = false;
            post({ op: 'state', ready: false, lost: true, failed: false });
        },
        onRestored: () => {
            post({ op: 'state', ready: false, lost: false, failed: false });
        },
    });
    return baker;
}

function stateOf(target: DiscBaker): { ready: boolean; lost: boolean; failed: boolean } {
    return { ready: target.ready(), lost: target.lost(), failed: target.failed() };
}

function enqueue(job: () => Promise<void>): void {
    jobs.push(job);
    void drain();
}

async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
        while (jobs.length) {
            const job = jobs.shift();
            if (job) await job();
        }
    } finally {
        running = false;
        if (jobs.length) void drain();
    }
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function warm(profile: BakeProfile): GpuSpan[] {
    if (warmed) return [];
    const spans = session().warmup(profile);
    warmed = true;
    return spans;
}

function slowOf(spans: GpuSpan[]): GpuSpan[] {
    return spans.filter((span) => span.ms >= 50);
}

async function pack(
    delivery: DiscDelivery,
    tiles: Map<string, { sx: number; sy: number; size: number }>,
    requests: ShadeRequest[],
): Promise<{ payload: { delivery: DiscDelivery; tiles?: WorkerTile[]; image?: ImageBitmap; table?: AtlasSlot[] }; transfer: Transferable[] }> {
    const surface = canvas;
    if (!surface) return { payload: { delivery }, transfer: [] };
    const radius = new Map(requests.map((item) => [item.key, item.radius]));
    if (delivery === 'atlas') {
        const image = surface.transferToImageBitmap();
        const table: AtlasSlot[] = [];
        for (const [key, tile] of tiles) {
            table.push({ key, sx: tile.sx, sy: tile.sy, size: tile.size, radiusPx: radius.get(key) ?? 0 });
        }
        return { payload: { delivery, image, table }, transfer: [image] };
    }
    const packed: WorkerTile[] = [];
    const transfer: Transferable[] = [];
    for (const [key, tile] of tiles) {
        const image = await createImageBitmap(surface, tile.sx, tile.sy, tile.size, tile.size);
        packed.push({ key, size: tile.size, radiusPx: radius.get(key) ?? 0, image });
        transfer.push(image);
    }
    return { payload: { delivery, tiles: packed }, transfer };
}

async function runWatch(job: WatchRequest): Promise<void> {
    const target = session();
    target.pump();
    const flag = stateOf(target);
    if (flag.failed || flag.lost || !flag.ready) {
        post({ op: 'state', ...flag });
        if (flag.failed || flag.lost) return;
        await wait(16);
        if (!watch) watch = job;
        enqueue(async () => {
            const next = watch;
            watch = null;
            if (next) await runWatch(next);
        });
        return;
    }
    post({ op: 'state', ...flag });
    const spans = job.requests[0] ? warm(job.requests[0].profile) : [];
    target.takeSpans();
    const tiles = target.renderBatch(job.requests);
    spans.push(...target.takeSpans());
    const packed = await pack(job.delivery, tiles, job.requests);
    post({
        op: 'tiles',
        ...stateOf(target),
        slow: slowOf(spans),
        ...packed.payload,
    }, packed.transfer);
}

function faces(cube: CubeFaces | null, transfer: Transferable[]): CubeFaces | null {
    if (!cube) return null;
    for (const face of [...cube.a, ...cube.b]) transfer.push(face.buffer);
    return cube;
}

function capturePayload(shot: DiscCapture, transfer: Transferable[]): DiscCapture {
    if (shot.stats) transfer.push(shot.stats.buffer);
    faces(shot.cube32, transfer);
    faces(shot.cube128, transfer);
    faces(shot.cube512, transfer);
    faces(shot.mip128, transfer);
    return shot;
}

async function rpc(message: RpcRequest): Promise<void> {
    const target = session();
    const id = message.id;
    switch (message.op) {
        case 'pump':
            target.pump();
            post({ id, ok: true, result: stateOf(target) });
            return;
        case 'ready':
            post({ id, ok: true, result: target.ready() });
            return;
        case 'lost':
            post({ id, ok: true, result: target.lost() });
            return;
        case 'failed':
            post({ id, ok: true, result: target.failed() });
            return;
        case 'clear':
            target.clear();
            post({ id, ok: true, result: true });
            return;
        case 'step': {
            const profile = message.profile;
            if (!profile) throw new Error('step needs a profile');
            warm(profile);
            const ms = target.step(profile, message.radius ?? 0, message.uTime ?? 0);
            post({ id, ok: true, result: ms });
            return;
        }
        case 'spans':
            post({ id, ok: true, result: target.takeSpans() });
            return;
        case 'sync':
            post({ id, ok: true, result: target.sync() });
            return;
        case 'pending':
            post({ id, ok: true, result: target.jobPending(message.profileId ?? '') });
            return;
        case 'hasCube':
            post({ id, ok: true, result: target.hasCube(message.profileId ?? '', message.size ?? 0) });
            return;
        case 'capture': {
            const transfer: Transferable[] = [];
            const shot = capturePayload(target.capture(message.profileId ?? ''), transfer);
            post({ id, ok: true, result: shot }, transfer);
            return;
        }
        case 'render': {
            const requests = message.requests ?? [];
            if (requests[0]) warm(requests[0].profile);
            const tiles = target.renderBatch(requests);
            const listed = [...tiles.entries()].map(([key, tile]) => ({ key, ...tile }));
            post({ id, ok: true, result: listed });
            return;
        }
        case 'readTile': {
            const pixels = target.readTile(message.key ?? '');
            const transfer: Transferable[] = [];
            if (pixels) transfer.push(pixels.buffer);
            post({ id, ok: true, result: pixels }, transfer);
            return;
        }
        case 'tile':
            post({ id, ok: true, result: target.tile(message.key ?? '') });
            return;
        case 'openMs':
            post({ id, ok: true, result: target.openMs() });
            return;
        case 'prepare': {
            const profile = message.profile;
            if (!profile) throw new Error('prepare needs a profile');
            warm(profile);
            post({ id, ok: true, result: target.prepare(profile, message.uTime ?? 0) });
            return;
        }
        case 'bakeSize': {
            const profile = message.profile;
            if (!profile) throw new Error('bakeSize needs a profile');
            warm(profile);
            post({ id, ok: true, result: target.bakeSize(profile, message.size ?? 0, message.uTime ?? 0) });
            return;
        }
        case 'drop':
            target.dropCubes(message.profileId ?? '');
            post({ id, ok: true, result: true });
            return;
        case 'longest':
            post({ id, ok: true, result: target.longestSliceMs() });
            return;
        case 'memory':
            post({ id, ok: true, result: target.memory() });
            return;
        case 'costs':
            post({ id, ok: true, result: target.costs() });
            return;
        case 'lose':
            post({ id, ok: true, result: target.loseForTest() });
            return;
        case 'restore':
            post({ id, ok: true, result: target.restoreForTest() });
            return;
        case 'dispose':
            target.dispose();
            baker = null;
            canvas = null;
            warmed = false;
            post({ id, ok: true, result: true });
            return;
        case 'frame': {
            const requests = message.requests ?? [];
            target.pump();
            const flag = stateOf(target);
            if (!flag.ready) {
                post({
                    id,
                    ok: true,
                    result: {
                        ...flag,
                        lit: false,
                        full: false,
                        slow: [],
                        memory: 0,
                        withinBudget: true,
                        delivery: message.delivery ?? 'tiles',
                    },
                });
                return;
            }
            const spans = requests[0] ? warm(requests[0].profile) : [];
            target.takeSpans();
            const tiles = target.renderBatch(requests);
            spans.push(...target.takeSpans());
            const packed = await pack(message.delivery ?? 'tiles', tiles, requests);
            const full = requests.every((item) => target.hasCube(item.profile.id, cubeSizeFor(item.radius)));
            const lit = requests.some((item) => tiles.has(item.key));
            const memory = target.memory();
            post({
                id,
                ok: true,
                result: {
                    ...stateOf(target),
                    lit,
                    full,
                    slow: slowOf(spans),
                    memory,
                    withinBudget: memory <= MEMORY_BUDGET,
                    ...packed.payload,
                },
            }, packed.transfer);
            return;
        }
        default:
            throw new Error('unknown disc op ' + message.op);
    }
}

scope.onmessage = (event: MessageEvent) => {
    const data = event.data as RpcRequest | WatchRequest | null;
    if (!data || typeof data !== 'object') return;
    if (data.op === 'watch' && !('id' in data)) {
        const job = data as WatchRequest;
        watch = job;
        enqueue(async () => {
            const job = watch;
            watch = null;
            if (!job) return;
            try {
                await runWatch(job);
            } catch (err) {
                post({ op: 'state', ready: false, lost: false, failed: true, error: err instanceof Error ? err.message : String(err) });
            }
        });
        return;
    }
    if (typeof (data as RpcRequest).id !== 'number') return;
    const message = data as RpcRequest;
    enqueue(async () => {
        try {
            await rpc(message);
        } catch (err) {
            post({ id: message.id, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
    });
};

/**
 * Map requests. Both sheets paint in the surface worker: 'vanilla' the legacy painter
 * (vanilla/map.ts), 'enhanced' the enhanced one (enhanced/map.ts: the same continents, seas
 * and sea ice from enhanced/seas.ts). The two are told apart here and nowhere in vanilla.
 * The cache key carries the mode, the painter and, for enhanced, the sea it was asked to
 * draw, so one mode's sheet is never handed to the other.
 * A reply whose generation is not the live one is dropped.
 * Discs compile in the disc worker. prepareDiscs posts one batch and returns.
 * It does not wait for a tile. drawDisc paints the newest tile held for a key,
 * or returns false so the caller keeps its flat disc. A tile can arrive a later frame.
 */
import { afterTask, blitImage, now, startSurfaceWorker } from '../platform/browser.ts';
import { SheetCache } from './cache.ts';
import type {
    DiscBatchRequest,
    DiscContext,
    DrawingOptions,
    EnhancedPaintInputs,
    EnhancedSea,
    MapRequest,
    SurfaceMode,
    SurfaceReply,
    SurfaceWorkerMessage,
    SurfaceWorkerReply,
    VanillaPaintInputs,
} from './contracts.ts';
import { SURFACE_MESSAGE_VERSION } from './contracts.ts';
import {
    VANILLA_MASTER_SEED,
    diamondMapSpec,
    surfaceCacheKey,
} from './identity.ts';
import { createEnhancedMap, seaPlan } from './enhanced/map.ts';
import { createChunkedMap } from './map_chunks.ts';
import { openDiscLink, type DiscLink } from './disc_link.ts';
import { clearDiscs, discHeld, retainDiscs } from './disc_hold.ts';
import { discShadeRequest } from './disc_shade.ts';
import type { ShadeRequest } from './vanilla/gl_shade.ts';
import { discDest } from './vanilla/gl_plan.ts';
import { MAP_HEIGHT, MAP_WIDTH } from './vanilla/map.ts';

const MAP_ALGORITHM = 'vanilla-diamond-1';
const MAP_PALETTE = 'vanilla-legacy-1';
const ENHANCED_ALGORITHM = 'enhanced-seas-1';
const ENHANCED_PALETTE = 'enhanced-liquids-1';
const MAP_REVISION = 'surface-map-1';
const TASK_BUDGET_MS = 50;

export type MapSheet = {
    readonly status: 'sheet';
    readonly mode: SurfaceMode;
    readonly requestId: string;
    readonly generation: number;
    readonly key: string;
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8ClampedArray;
    readonly fromCache: boolean;
    /** Milliseconds from worker construction until its ready message. Null on a cache hit or the page path. */
    readonly workerStartMs: number | null;
    /** Milliseconds from the request until the pixels were ready. */
    readonly sheetMs: number;
    readonly chunkTasks: number;
    readonly longestChunkMs: number;
};

export type MapTicket = {
    readonly status: 'pending' | 'sheet' | 'unavailable';
    readonly mode: SurfaceMode;
    readonly requestId: string;
    readonly generation: number;
    readonly fromCache: boolean;
    readonly done: Promise<MapSheet | null>;
    readonly pixels?: Uint8ClampedArray;
};

type WorkerLike = {
    postMessage(message: SurfaceWorkerMessage): void;
    addEventListener(type: 'message', listener: (event: { data: SurfaceWorkerReply }) => void): void;
    terminate(): void;
};

type Live = {
    requestId: string;
    generation: number;
    mode: SurfaceMode;
    key: string;
    inputs: VanillaPaintInputs;
    /** The enhanced sheet's inputs; null for a vanilla request. */
    enhanced: EnhancedPaintInputs | null;
    started: number;
    resolve: (sheet: MapSheet | null) => void;
    cancelTimer: (() => void) | null;
    chunkTasks: number;
    longestChunkMs: number;
};

let sequence = 0;
let generation = 0;
let live: Live | null = null;
let worker: WorkerLike | null = null;
let workerFailed = false;
let workerStartBegan = 0;
let workerStartMs: number | null = null;
let workerStartPending = false;

const cache = new SheetCache();

let spawnOverride: 'default' | null | (() => WorkerLike) = 'default';
let scheduleOverride: ((fn: () => void) => () => void) | null = null;
let budgetOverride: number | null = null;

function schedule(fn: () => void): () => void {
    if (scheduleOverride) return scheduleOverride(fn);
    return afterTask(fn);
}

function budget(): number {
    return budgetOverride ?? TASK_BUDGET_MS;
}

/** Tests inject a fake worker or force the page path. Passing null means no worker. */
export function configureSurfaceRuntime(options: {
    spawn?: (() => WorkerLike) | null;
    schedule?: (fn: () => void) => () => void;
    taskBudgetMs?: number;
}): void {
    if (options.spawn !== undefined) spawnOverride = options.spawn;
    if (options.schedule) scheduleOverride = options.schedule;
    if (options.taskBudgetMs !== undefined) budgetOverride = options.taskBudgetMs;
    disposeSurfaces();
}

function drawingOptionsKey(options: DrawingOptions): string {
    // The enhanced flags do not change this sheet. Only the two legacy sliders do.
    return String(options.continentalDefinition) + ',' + String(options.coastlineComplexity);
}

function cacheKey(request: MapRequest, sea: EnhancedSea | null): string {
    return surfaceCacheKey({
        hexKey: request.hexKey,
        dossierKey: request.dossierKey,
        revision: MAP_REVISION,
        mode: request.mode,
        algorithm: sea ? ENHANCED_ALGORITHM : MAP_ALGORITHM,
        palette: sea ? ENHANCED_PALETTE : MAP_PALETTE,
        // The enhanced sheet is also a picture of the sea it was told to draw.
        options: drawingOptionsKey(request.options) + (sea ? ';' + JSON.stringify(sea) : ''),
        resolution: MAP_WIDTH + 'x' + MAP_HEIGHT,
    });
}

function adaptWorker(port: Worker): WorkerLike {
    return {
        postMessage(message) { port.postMessage(message); },
        addEventListener(_type, listener) {
            port.addEventListener('message', (event) => {
                listener({ data: event.data as SurfaceWorkerReply });
            });
        },
        terminate() { port.terminate(); },
    };
}

function openWorker(): WorkerLike | null {
    if (worker) return worker;
    if (workerFailed || spawnOverride === null) return null;
    workerStartBegan = now();
    workerStartMs = null;
    workerStartPending = true;
    try {
        const created = spawnOverride === 'default' ? adaptWorker(startSurfaceWorker()) : spawnOverride();
        created.addEventListener('message', onWorkerMessage);
        worker = created;
        return created;
    } catch {
        workerFailed = true;
        worker = null;
        workerStartPending = false;
        return null;
    }
}

function post(message: SurfaceWorkerMessage): void {
    worker?.postMessage(message);
}

function finish(sheet: MapSheet | null): void {
    const job = live;
    if (!job) return;
    if (job.cancelTimer) job.cancelTimer();
    live = null;
    job.resolve(sheet);
}

function dropLive(): void {
    if (!live) return;
    const job = live;
    if (job.cancelTimer) job.cancelTimer();
    live = null;
    post({
        version: SURFACE_MESSAGE_VERSION,
        requestId: job.requestId,
        op: 'cancel',
        mode: job.mode,
        generation: job.generation,
    });
    job.resolve(null);
}

function sheetFrom(job: Live, pixels: Uint8ClampedArray, fromCache: boolean): MapSheet {
    return {
        status: 'sheet',
        mode: job.mode,
        requestId: job.requestId,
        generation: job.generation,
        key: job.key,
        width: pixels.length === MAP_WIDTH * MAP_HEIGHT * 4 ? MAP_WIDTH : 0,
        height: pixels.length === MAP_WIDTH * MAP_HEIGHT * 4 ? MAP_HEIGHT : 0,
        pixels,
        fromCache,
        workerStartMs: workerStartPending ? null : workerStartMs,
        sheetMs: now() - job.started,
        chunkTasks: job.chunkTasks,
        longestChunkMs: job.longestChunkMs,
    };
}

function onWorkerMessage(event: { data: SurfaceWorkerReply }): void {
    const message = event.data;
    if (!message || message.version !== SURFACE_MESSAGE_VERSION) return;
    if (message.op === 'ready') {
        workerStartMs = now() - workerStartBegan;
        workerStartPending = false;
        return;
    }
    if (!live || message.generation !== live.generation || message.requestId !== live.requestId) return;
    if (message.op === 'dropped' || !message.pixels) {
        finish(null);
        return;
    }
    cache.set(live.key, message.pixels);
    const width = message.width ?? MAP_WIDTH;
    const height = message.height ?? MAP_HEIGHT;
    const painted = sheetFrom(live, message.pixels, false);
    finish({ ...painted, width, height, workerStartMs });
}

function paintOnPage(job: Live): void {
    const chunk = job.enhanced
        ? createEnhancedMap(job.enhanced, now, budget())
        : createChunkedMap(job.inputs, now, budget());
    const run = (): void => {
        if (live !== job) return;
        const done = chunk.step();
        job.chunkTasks = chunk.tasks;
        job.longestChunkMs = chunk.longestMs;
        if (!done) {
            job.cancelTimer = schedule(run);
            return;
        }
        cache.set(job.key, chunk.pixels);
        finish(sheetFrom(job, chunk.pixels, false));
    };
    job.cancelTimer = schedule(run);
}

function unavailable(mode: SurfaceMode): MapTicket {
    const requestId = String(++sequence);
    return {
        status: 'unavailable',
        mode,
        requestId,
        generation: 0,
        fromCache: false,
        done: Promise.resolve(null),
    };
}

/** One sheet. `sea` is the enhanced sheet's sea; null asks for the vanilla sheet. */
function requestSheet(request: MapRequest, sea: EnhancedSea | null): MapTicket {
    dropLive();
    const spec = diamondMapSpec(request.body, request.hexKey);
    if (!spec) return unavailable(request.mode);
    const key = cacheKey(request, sea);
    const requestId = String(++sequence);
    const ticketGeneration = ++generation;
    const hit = cache.get(key);
    if (hit) {
        const started = now();
        const sheet: MapSheet = {
            status: 'sheet',
            mode: request.mode,
            requestId,
            generation: ticketGeneration,
            key,
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            pixels: hit,
            fromCache: true,
            workerStartMs: null,
            sheetMs: now() - started,
            chunkTasks: 0,
            longestChunkMs: 0,
        };
        return { ...sheet, done: Promise.resolve(sheet) };
    }
    const inputs: VanillaPaintInputs = {
        worldData: spec.worldData,
        imageSeed: spec.seed,
        masterSeed: VANILLA_MASTER_SEED,
        continentalDefinition: request.options.continentalDefinition,
        coastlineComplexity: request.options.coastlineComplexity,
        printMode: false,
    };
    const enhanced: EnhancedPaintInputs | null = sea ? { ...inputs, sea } : null;
    let resolve: (sheet: MapSheet | null) => void = () => {};
    const done = new Promise<MapSheet | null>((settle) => { resolve = settle; });
    const job: Live = {
        requestId,
        generation: ticketGeneration,
        mode: request.mode,
        key,
        inputs,
        enhanced,
        started: now(),
        resolve,
        cancelTimer: null,
        chunkTasks: 0,
        longestChunkMs: 0,
    };
    live = job;
    const port = openWorker();
    if (!port) {
        paintOnPage(job);
    } else {
        port.postMessage({
            version: SURFACE_MESSAGE_VERSION,
            requestId,
            op: 'map',
            mode: request.mode,
            generation: ticketGeneration,
            inputs,
            ...(enhanced ? { enhanced } : {}),
        });
    }
    return {
        status: 'pending',
        mode: request.mode,
        requestId,
        generation: ticketGeneration,
        fromCache: false,
        done,
    };
}

export function requestMap(request: MapRequest): MapTicket {
    switch (request.mode) {
        case 'vanilla':
            return requestSheet(request, null);
        case 'enhanced':
            // The sea is decided here, on the page, from the body; the painter gets plain data.
            return requestSheet(request, seaPlan(request.body).sea);
    }
}

let discLink: DiscLink | null = null;
let discBroken = false;

function openDiscs(): DiscLink | null {
    if (discBroken) return null;
    if (discLink) return discLink;
    try {
        discLink = openDiscLink();
        return discLink;
    } catch {
        if (discLink) discLink.dispose();
        discLink = null;
        discBroken = true;
        return null;
    }
}

export function prepareDiscs(request: DiscBatchRequest): SurfaceReply {
    const requestId = String(++sequence);
    if (request.discs.length === 0) return { status: 'unavailable', mode: request.mode, requestId };
    const shades: ShadeRequest[] = [];
    for (const disc of request.discs) {
        const shade = discShadeRequest(request.timeSeconds, disc);
        if (shade) shades.push(shade);
    }
    if (shades.length === 0) {
        retainDiscs(new Set(request.discs.map((disc) => disc.key)));
        return { status: 'ready', mode: request.mode, requestId };
    }
    const link = openDiscs();
    if (!link || link.failed()) return { status: 'unavailable', mode: request.mode, requestId };
    if (link.lost()) return { status: 'unavailable', mode: request.mode, requestId };
    link.submit(shades);
    retainDiscs(new Set(request.discs.map((disc) => disc.key)));
    if (!link.ready()) return { status: 'pending', mode: request.mode, requestId };
    return { status: 'ready', mode: request.mode, requestId };
}

/**
 * Paint the newest tile held for key, centred on (cx, cy).
 * radiusPx may differ from the radius the tile was rendered for; the tile is scaled.
 * False when no tile is held. A lost context does not hide a tile already held.
 */
export function drawDisc(ctx: DiscContext, key: string, cx: number, cy: number, radiusPx: number): boolean {
    const held = discHeld(key);
    if (!held) return false;
    const dest = discDest(held.size, held.radiusPx, cx, cy, radiusPx);
    blitImage(ctx, held.image, dest.x, dest.y, dest.w, dest.h);
    return true;
}

export function cancelSurface(requestId: string): void {
    if (live && live.requestId === requestId) dropLive();
}

export function surfaceAvailable(mode: SurfaceMode): boolean {
    switch (mode) {
        case 'vanilla':
            return true;
        case 'enhanced':
            // The enhanced map sheet (enhanced/map.ts). Discs paint when a tile is held.
            return true;
    }
}

export function disposeSurfaces(): void {
    if (live) {
        const job = live;
        if (job.cancelTimer) job.cancelTimer();
        live = null;
        job.resolve(null);
    }
    if (discLink) discLink.dispose();
    discLink = null;
    discBroken = false;
    clearDiscs();
    if (worker) worker.terminate();
    worker = null;
    workerStartMs = null;
    workerStartPending = false;
    workerFailed = false;
    cache.clear();
}

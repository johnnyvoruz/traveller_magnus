/**
 * Map requests. Vanilla paints in the surface worker. Enhanced paints that same
 * vanilla sheet until an enhanced painter exists: the mode switch must not leave
 * a visitor with a blank planet. The cache key still carries the requested mode.
 * A reply whose generation is not the live one is dropped.
 * Discs stay unavailable.
 */
import { afterTask, now, startSurfaceWorker } from '../platform/browser.ts';
import { SheetCache } from './cache.ts';
import type {
    DiscBatchRequest,
    DiscRequest,
    DrawingOptions,
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
import { createChunkedMap } from './map_chunks.ts';
import { MAP_HEIGHT, MAP_WIDTH } from './vanilla/map.ts';

const MAP_ALGORITHM = 'vanilla-diamond-1';
const MAP_PALETTE = 'vanilla-legacy-1';
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

function cacheKey(request: MapRequest): string {
    return surfaceCacheKey({
        hexKey: request.hexKey,
        dossierKey: request.dossierKey,
        revision: MAP_REVISION,
        mode: request.mode,
        algorithm: MAP_ALGORITHM,
        palette: MAP_PALETTE,
        options: drawingOptionsKey(request.options),
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
    const chunk = createChunkedMap(job.inputs, now, budget());
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

function requestVanillaSheet(request: MapRequest): MapTicket {
    dropLive();
    const spec = diamondMapSpec(request.body, request.hexKey);
    if (!spec) return unavailable(request.mode);
    const key = cacheKey(request);
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
    let resolve: (sheet: MapSheet | null) => void = () => {};
    const done = new Promise<MapSheet | null>((settle) => { resolve = settle; });
    const job: Live = {
        requestId,
        generation: ticketGeneration,
        mode: request.mode,
        key,
        inputs,
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
    // Enhanced terrain is not painted yet. Fall back to the vanilla sheet so the
    // mode switch never leaves a visitor with a blank planet. The cache key still
    // carries the requested mode, and a late result from an older generation is dropped.
    return requestVanillaSheet(request);
}

export function prepareDiscs(request: DiscBatchRequest): SurfaceReply {
    const requestId = String(++sequence);
    return { status: 'unavailable', mode: request.mode, requestId };
}

export function drawDisc(request: DiscRequest): SurfaceReply {
    const requestId = String(++sequence);
    return { status: 'unavailable', mode: request.mode, requestId };
}

export function cancelSurface(requestId: string): void {
    if (live && live.requestId === requestId) dropLive();
}

export function surfaceAvailable(mode: SurfaceMode): boolean {
    switch (mode) {
        case 'vanilla':
            return true;
        case 'enhanced':
            // The sheet is the vanilla fallback, so the switch still has a picture.
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
    if (worker) worker.terminate();
    worker = null;
    workerStartMs = null;
    workerStartPending = false;
    workerFailed = false;
    cache.clear();
}

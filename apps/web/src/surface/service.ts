/**
 * Map requests. Both sheets paint in the surface worker: 'vanilla' the legacy painter
 * (vanilla/map.ts), 'enhanced' the hybrid surface map (surface/hybrid: the icosahedral hex
 * map with climate, ice, terrain and people). The two are told apart here and nowhere in
 * vanilla. The cache key carries the mode, the painter, the hybrid surface version and a
 * digest of the world's data, so one mode's sheet is never handed to the other and a world
 * whose data changed is painted again. The enhanced-seas painter (enhanced/map.ts) still
 * answers a request that carries a sea; requestMap no longer sends one.
 * A reply whose generation is not the live one is dropped.
 * Discs compile in the disc worker. prepareDiscs posts the batch with its mode,
 * renderer version and generation, and returns.
 * It does not wait for a tile. drawDisc paints the newest tile held for a key,
 * or returns false so the caller keeps its flat disc. A tile can arrive a later frame.
 */
import { afterTask, blitImage, devicePixelRatio, now, startSurfaceWorker } from '../platform/browser.ts';
import { SheetCache } from './cache.ts';
import type {
    DiscBatchRequest,
    DiscContext,
    DiscRequest,
    DrawingOptions,
    EnhancedPaintInputs,
    EnhancedSea,
    HybridPaintInputs,
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
import { enhancedWorldData } from './enhanced/climate.ts';
import { createEnhancedMap, seaPlan } from './enhanced/map.ts';
import { createChunkedMap } from './map_chunks.ts';
import { HYBRID_SURFACE_VERSION, hybridWorld, worldDigest } from './hybrid/inputs.ts';
import { LARGE_SHEET, SHEET_LAYOUT, type SheetLayout } from './hybrid/field.ts';
import { cachedHybridModel, hybridModelWith, rememberHybridModel } from './hybrid/index.ts';
import { editsDigest } from './paint_edits.ts';
import { createHybridPaint } from './hybrid/paint.ts';
import { modelPreparation, startHybridBuild } from './hybrid/model.ts';
import { openDiscLink, type DiscLink } from './disc_link.ts';
import { clearDiscs, discHeld, retainDiscs } from './disc_hold.ts';
import { discShadeRequest, type DiscPaint } from './disc_shade.ts';
import { editsHeld, surfaceEdits } from './edits.ts';
import { LOCKED_NIGHT_CENTRED_LON } from './hybrid/model.ts';
import { discPaintTexture, resetDiscPaint, type PaintTexture } from './paint_disc.ts';
import { COASTLINE_COMPLEXITY, CONTINENTAL_DEFINITION } from './identity.ts';
import { disposeSoftDiscs, prepareSoftDiscs } from './soft/link.ts';
import { webglState } from './webgl_notice.ts';
import { discRendererVersion } from './enhanced/bake.ts';
import { cityLook } from './enhanced/city_look.ts';
import type { DiscEnvelope } from './enhanced/delivery.ts';
import type { ShadeRequest } from './vanilla/gl_shade.ts';
import { cubeSizeFor } from './vanilla/gl_bake.ts';
import { discDest } from './vanilla/gl_plan.ts';
import { MAP_HEIGHT, MAP_WIDTH } from './vanilla/map.ts';

const MAP_ALGORITHM = 'vanilla-diamond-1';
const MAP_PALETTE = 'vanilla-legacy-1';
const ENHANCED_ALGORITHM = 'enhanced-seas-1';
const ENHANCED_PALETTE = 'enhanced-liquids-1';
const HYBRID_PALETTE = 'hybrid-terrain-1';
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
    /** The enhanced-seas sheet's inputs; null otherwise. */
    enhanced: EnhancedPaintInputs | null;
    /** The hybrid sheet's inputs; null for a vanilla request. */
    hybrid: HybridPaintInputs | null;
    /** Sheet the job paints. Vanilla and the enhanced-seas sheet stay on the 800 × 400 layout. */
    layout: SheetLayout;
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
let clockOverride: (() => number) | null = null;

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
    /**
     * Clock for the page-path chunk timer. The default is wall time. A test
     * passes CPU time so a stalled machine does not count as a long chunk.
     */
    clock?: (() => number) | null;
}): void {
    if (options.spawn !== undefined) spawnOverride = options.spawn;
    if (options.schedule) scheduleOverride = options.schedule;
    if (options.taskBudgetMs !== undefined) budgetOverride = options.taskBudgetMs;
    clockOverride = 'clock' in options ? (options.clock ?? null) : null;
    disposeSurfaces();
}

function drawingOptionsKey(options: DrawingOptions): string {
    // The enhanced flags do not change this sheet. Only the two legacy sliders do.
    return String(options.continentalDefinition) + ',' + String(options.coastlineComplexity);
}

/** Two hybrid sizes: the column sheet, and the large view. Anything else stays on the column sheet. */
function hybridLayout(request: MapRequest, hybrid: HybridPaintInputs | null): SheetLayout {
    if (!hybrid) return SHEET_LAYOUT;
    const { width, height } = request.resolution;
    if (width === LARGE_SHEET.width && height === LARGE_SHEET.height) return LARGE_SHEET;
    return SHEET_LAYOUT;
}

function cacheKey(request: MapRequest, sea: EnhancedSea | null, hybrid: HybridPaintInputs | null, layout: SheetLayout): string {
    return surfaceCacheKey({
        hexKey: request.hexKey,
        dossierKey: request.dossierKey,
        revision: MAP_REVISION,
        mode: request.mode,
        algorithm: hybrid ? HYBRID_SURFACE_VERSION : sea ? ENHANCED_ALGORITHM : MAP_ALGORITHM,
        palette: hybrid ? HYBRID_PALETTE : sea ? ENHANCED_PALETTE : MAP_PALETTE,
        // The enhanced sheet is also a picture of the sea it was told to draw; the hybrid
        // one of the world's data, by digest, and of the painted hexes when there are any (DW2).
        options: drawingOptionsKey(request.options)
            + (hybrid ? ';' + worldDigest(hybrid.world) + (hybrid.edits && hybrid.edits.edits.length ? ';edits=' + editsDigest(hybrid.edits) : '') : sea ? ';' + JSON.stringify(sea) : ''),
        resolution: layout.width + 'x' + layout.height,
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
        width: job.layout.width,
        height: job.layout.height,
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
    const hybrid = job.hybrid;
    const clock = clockOverride ?? now;
    const cached = hybrid ? cachedHybridModel(hybrid.world) : null;
    const modelBuild = hybrid && !cached ? startHybridBuild(hybrid.world) : null;
    const chunk = hybrid
        ? createHybridPaint(
            () => {
                const base = cached ?? (modelBuild as NonNullable<typeof modelBuild>).model();
                if (!cached) rememberHybridModel(hybrid.world, base);
                return hybridModelWith(base, hybrid.edits ?? null);
            },
            job.layout, clock, budget(), modelPreparation(hybrid.world), modelBuild)
        : job.enhanced
            ? createEnhancedMap(job.enhanced, clock, budget())
            : createChunkedMap(job.inputs, clock, budget());
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

/**
 * One sheet. `hybrid` asks for the hybrid sheet, `sea` for the enhanced-seas sheet; both
 * null asks for the vanilla sheet.
 */
function requestSheet(request: MapRequest, sea: EnhancedSea | null, hybrid: HybridPaintInputs | null = null): MapTicket {
    dropLive();
    const spec = diamondMapSpec(request.body, request.hexKey);
    if (!spec) return unavailable(request.mode);
    const layout = hybridLayout(request, hybrid);
    const key = cacheKey(request, sea, hybrid, layout);
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
            width: layout.width,
            height: layout.height,
            pixels: hit,
            fromCache: true,
            workerStartMs: null,
            sheetMs: now() - started,
            chunkTasks: 0,
            longestChunkMs: 0,
        };
        return { ...sheet, done: Promise.resolve(sheet) };
    }
    const worldData = request.mode === 'enhanced' ? enhancedWorldData(request.body, spec.worldData) : spec.worldData;
    const inputs: VanillaPaintInputs = {
        worldData,
        imageSeed: spec.seed,
        masterSeed: VANILLA_MASTER_SEED,
        continentalDefinition: request.options.continentalDefinition,
        coastlineComplexity: request.options.coastlineComplexity,
        printMode: false,
    };
    const enhanced: EnhancedPaintInputs | null = sea && !hybrid ? { ...inputs, sea } : null;
    let resolve: (sheet: MapSheet | null) => void = () => {};
    const done = new Promise<MapSheet | null>((settle) => { resolve = settle; });
    const job: Live = {
        requestId,
        generation: ticketGeneration,
        mode: request.mode,
        key,
        inputs,
        enhanced,
        hybrid,
        layout,
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
            ...(hybrid ? { hybrid, sheet: { width: layout.width, height: layout.height, side: layout.side } } : {}),
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
        case 'enhanced': {
            // The world is read here, on the page, from the body; the painter gets plain data.
            const world = hybridInputsFor(request);
            if (!world) return unavailable(request.mode);
            return requestSheet(request, null, request.edits && request.edits.edits.length ? { world, edits: request.edits } : { world });
        }
    }
}

/** The hybrid map's inputs for a request (the stage reads the same to draw its overlays). */
export function hybridInputsFor(request: Pick<MapRequest, 'hexKey' | 'dossierKey' | 'body' | 'options'>): ReturnType<typeof hybridWorld> {
    return hybridWorld(request.hexKey, request.dossierKey, request.body, {
        continental: request.options.continentalDefinition,
        coastline: request.options.coastlineComplexity,
    });
}

/** The enhanced-seas sheet (enhanced/map.ts), by request. Kept for comparison and tests. */
export function requestSeasMap(request: MapRequest): MapTicket {
    return requestSheet(request, seaPlan(request.body).sea);
}

let discLink: DiscLink | null = null;
let discBroken = false;
let discMode: SurfaceMode | null = null;
let discGeneration = 0;
let discEpoch = '';

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

/**
 * Generation changes when the mode or the cube size of a disc changes.
 * A spin resubmit keeps the generation so the tile already held stays up.
 * The worker drops an in-flight bitmap only when a later watch changes the envelope.
 */
function discEpochOf(request: DiscBatchRequest, paints: ReadonlyMap<string, DiscPaint>): string {
    // The painted hexes are part of a disc's picture (DW2c): a kept map is a new generation, so the tile repaints.
    const rows = request.discs.map((disc) => disc.key + ':' + String(cubeSizeFor(disc.radiusPx)) + (paints.has(disc.key) ? ':' + (paints.get(disc.key) as DiscPaint).key : ''));
    rows.sort();
    return request.mode + '|' + (request.mode === 'enhanced' ? cityLook().id + '|' : '') + rows.join(',');
}

/**
 * A body's painted hexes for the WebGL disc (DW2c): read once per body (as the soft disc does), the
 * texture built on the page when the edits are held, null until then and for a body with none. The
 * hybrid sheet puts a locked world's star side at LOCKED_NIGHT_CENTRED_LON; the disc keeps planet +x
 * toward the star, so the texture is turned to match (soft/link.ts says the same).
 */
export function discPaintFor(disc: Pick<DiscRequest, 'hexKey' | 'dossierKey' | 'body'>): (DiscPaint & { texture: PaintTexture }) | null {
    const edits = editsHeld(disc.hexKey, disc.dossierKey);
    if (edits === undefined) {
        surfaceEdits(disc.hexKey, disc.dossierKey);
        return null;
    }
    if (!edits || !edits.edits.length) return null;
    const world = hybridWorld(disc.hexKey, disc.dossierKey, disc.body, { continental: CONTINENTAL_DEFINITION, coastline: COASTLINE_COMPLEXITY });
    if (!world) return null;
    const texture = discPaintTexture(world, edits);
    if (!texture) return null;
    return { key: texture.key, lon: world.locked ? LOCKED_NIGHT_CENTRED_LON * Math.PI / 180 : 0, texture };
}

function advanceDiscs(request: DiscBatchRequest, paints: ReadonlyMap<string, DiscPaint>): DiscEnvelope {
    const epoch = discEpochOf(request, paints);
    const modeChanged = discMode !== null && discMode !== request.mode;
    if (discMode === null || modeChanged || epoch !== discEpoch) {
        discGeneration += 1;
        discEpoch = epoch;
    }
    if (modeChanged) clearDiscs();
    discMode = request.mode;
    return { mode: request.mode, version: discRendererVersion(request.mode), generation: discGeneration };
}

export function prepareDiscs(request: DiscBatchRequest): SurfaceReply {
    const requestId = String(++sequence);
    if (request.discs.length === 0) return { status: 'unavailable', mode: request.mode, requestId };
    const shades: ShadeRequest[] = [];
    const paints = new Map<string, DiscPaint & { texture: PaintTexture }>();
    for (const disc of request.discs) {
        const paint = request.mode === 'enhanced' ? discPaintFor(disc) : null;
        if (paint) paints.set(disc.key, paint);
        const shade = discShadeRequest(request.timeSeconds, disc, request.mode, devicePixelRatio(), paint);
        if (shade) shades.push(shade);
    }
    const envelope = advanceDiscs(request, paints);
    const frameKeys = new Set(request.discs.map((disc) => disc.key));
    if (shades.length === 0) {
        discLink?.note(envelope, frameKeys);
        retainDiscs(frameKeys);
        return { status: 'ready', mode: request.mode, requestId };
    }
    // The probe has not answered yet (a few frames): no disc path is started; the painter keeps its flat discs.
    const gl = webglState();
    if (gl === 'unknown') {
        retainDiscs(frameKeys);
        return { status: 'pending', mode: request.mode, requestId };
    }
    // No WebGL in this browser: the discs are painted in software from the globes (soft/).
    if (gl === 'missing') {
        retainDiscs(frameKeys);
        return { status: prepareSoftDiscs(request, shades, envelope.generation, frameKeys), mode: request.mode, requestId };
    }
    const link = openDiscs();
    if (link) link.note(envelope, frameKeys);
    if (!link || link.failed()) return { status: 'unavailable', mode: request.mode, requestId };
    if (link.lost()) return { status: 'unavailable', mode: request.mode, requestId };
    // The textures go before the watch that names them, once per key per worker.
    for (const paint of paints.values()) link.paint(paint.key, paint.texture);
    link.submit(shades);
    retainDiscs(frameKeys);
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
    if (held.mode && discMode && held.mode !== discMode) return false;
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
    resetDiscPaint();
    disposeSoftDiscs();
    discMode = null;
    discGeneration = 0;
    discEpoch = '';
    clearDiscs();
    if (worker) worker.terminate();
    worker = null;
    workerStartMs = null;
    workerStartPending = false;
    workerFailed = false;
    cache.clear();
}

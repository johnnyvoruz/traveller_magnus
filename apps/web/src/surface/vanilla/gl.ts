/**
 * Vanilla orbit-disc session. Availability, bake, shade, disposal.
 * js/planet_gl.js:718-744 (program link), 745-785, 997-1142.
 * uTime is stored and is not read from a clock.
 * beginProgram compiles and links. Status reads wait for COMPLETION_STATUS_KHR
 * when that extension exists. linkDiscProgram is the blocking helper.
 */
import { copyCanvasRect, createCanvas, now, webgl2Context } from '../../platform/browser.ts';
import {
    atlasBytes,
    attachBaker,
    BAKE_BUDGET,
    cubeBytes,
    cubeSizeFor,
    evictIds,
    reserve,
    type BakeProfile,
    type BakeStats,
    type CubeFaces,
    type GpuCube,
    type GpuInfo,
    type GpuSpan,
    type LinkedProgram,
} from './gl_bake.ts';
import { axisBasis as axisOf, bestCubeSize, FRAME_BAKE_MS, HALO, packAtlas, planFrame, tileSide } from './gl_plan.ts';
import { attachShade, DRAW_FRAG, shadePort, type ShadeDraw, type ShadeRequest } from './gl_shade.ts';
import { BAKE_FRAG, STATS_FRAG, VERT } from './gl_shaders.ts';
import { gasStats, STATS_BATCH, thresholdsFromStats, type DecodedThresholds } from './gl_stats.ts';

export type { BakeProfile, CubeFaces, GpuInfo, GpuSpan, LinkedProgram, ShadeRequest };

export type PublicThresholds = {
    sea: number;
    cloudEdge: number;
    urbanEdge?: number;
    port?: [number, number, number];
};

type WorldStats = BakeStats | (DecodedThresholds & BakeStats);

type World = {
    profile: BakeProfile;
    stats: WorldStats;
    statsBytes: Uint8Array | null;
    cubes: Map<number, GpuCube>;
    job: { cube: GpuCube; face: number } | null;
    lastFrame: number;
    near: number;
    want: number;
    lodCapped: boolean;
};

export type DiscCapture = {
    kind: string;
    timeUsed: number;
    stats: Uint8Array | null;
    thresholds: PublicThresholds | null;
    cube32: CubeFaces;
    cube128: CubeFaces;
    cube512: CubeFaces | null;
    mip128: CubeFaces;
    gpu: GpuInfo;
};

export type DiscTile = {
    sx: number;
    sy: number;
    size: number;
    scale: number;
    rings: { inner: number; outer: number } | null;
};

export type DiscBaker = {
    available: () => boolean;
    openMs: () => number;
    clear: () => void;
    dispose: () => void;
    step: (profile: BakeProfile, radiusPx: number, uTime: number) => number;
    renderBatch: (requests: ShadeRequest[]) => Map<string, DiscTile>;
    tile: (key: string) => DiscTile | null;
    /** A 2D copy of the atlas rectangle for key. Top-left matches the atlas ty. */
    copyTile: (key: string) => HTMLCanvasElement | null;
    readTile: (key: string) => Uint8Array | null;
    prepare: (profile: BakeProfile, uTime: number) => number;
    bakeSize: (profile: BakeProfile, size: number, uTime: number) => { ms: number; maxFaceMs: number };
    dropCubes: (id: string) => void;
    jobPending: (id: string) => boolean;
    hasCube: (id: string, size: number) => boolean;
    capture: (id: string) => DiscCapture;
    sync: () => number;
    takeSpans: () => GpuSpan[];
    longestSliceMs: () => number;
    memory: () => number;
    ready: () => boolean;
    pump: () => void;
    lost: () => boolean;
    costs: () => { label: string; ms: number }[];
    loseForTest: () => boolean;
    restoreForTest: () => boolean;
    stallProbe: (profile: BakeProfile, size: number, skipCheck: boolean) => GpuSpan[];
    /** One 1x1 bake so the driver's first wait happens before a real face. */
    warmup: (profile: BakeProfile) => GpuSpan[];
    failed: () => boolean;
    /** The context the disc worker uses to link a draw program. Null before setup. */
    gl: () => WebGL2RenderingContext | null;
    /**
     * Install a draw program linked by the caller. The previous draw program
     * is deleted. Bake programs and cubes are left as they are.
     */
    bindDraw: (program: LinkedProgram) => void;
};

function publishThresholds(stats: WorldStats): PublicThresholds | null {
    if (!stats) return null;
    const out: PublicThresholds = { sea: stats.sea, cloudEdge: stats.cloudEdge };
    if ('urbanEdge' in stats && stats.urbanEdge !== undefined) out.urbanEdge = stats.urbanEdge;
    if ('port' in stats && stats.port) out.port = [stats.port[0], stats.port[1], stats.port[2]];
    return out;
}

function must<T>(value: T | null, what: string): T {
    if (!value) throw new Error(what);
    return value;
}

/**
 * js/planet_gl.js:718-744. The only place that compiles, links or reads
 * program status. Nothing else may call compileShader, linkProgram,
 * getShaderParameter or getProgramParameter.
 * COMPLETION_STATUS_KHR is the only query allowed before a program is done.
 */
type ParallelCompile = { COMPLETION_STATUS_KHR: number };

type OpenProgram = { label: string; prog: WebGLProgram; shaders: WebGLShader[] };

const PROGRAMS: { label: string; source: string }[] = [
    { label: 'stats', source: STATS_FRAG },
    { label: 'bake', source: BAKE_FRAG },
    { label: 'draw', source: DRAW_FRAG },
];

function beginProgram(gl: WebGL2RenderingContext, fragment: string, label: string): OpenProgram {
    const compile = (type: number, source: string): WebGLShader => {
        const shader = must(gl.createShader(type), 'shader');
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    };
    const prog = must(gl.createProgram(), 'program');
    const shaders = [compile(gl.VERTEX_SHADER, VERT), compile(gl.FRAGMENT_SHADER, fragment)];
    gl.attachShader(prog, shaders[0]!);
    gl.attachShader(prog, shaders[1]!);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    return { label, prog, shaders };
}

function finishProgram(
    gl: WebGL2RenderingContext,
    open: OpenProgram,
    note?: (name: string, ms: number) => void,
): LinkedProgram {
    const timed = <T>(name: string, read: () => T): T => {
        const started = now();
        const value = read();
        note?.(name, now() - started);
        return value;
    };
    for (const shader of open.shaders) {
        if (!timed('getShaderParameter COMPILE_STATUS ' + open.label, () => gl.getShaderParameter(shader, gl.COMPILE_STATUS))) {
            const log = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(log || 'shader compile failed');
        }
    }
    if (!timed('getProgramParameter LINK_STATUS ' + open.label, () => gl.getProgramParameter(open.prog, gl.LINK_STATUS))) {
        throw new Error(gl.getProgramInfoLog(open.prog) || 'link failed');
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const count = timed('getProgramParameter ACTIVE_UNIFORMS ' + open.label, () => gl.getProgramParameter(open.prog, gl.ACTIVE_UNIFORMS) as number);
    for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(open.prog, i);
        if (!info) continue;
        const name = info.name.replace(/\[0\]$/, '');
        uniforms[name] = timed('getUniformLocation ' + open.label, () => gl.getUniformLocation(open.prog, info.name));
    }
    return { prog: open.prog, uniforms };
}

/** Blocking link. Used one program per task when the parallel extension is absent. */
export function linkDiscProgram(gl: WebGL2RenderingContext, fragment: string): LinkedProgram {
    return finishProgram(gl, beginProgram(gl, fragment, 'program'));
}

export type DiscBakerHooks = {
    onLost?: () => void;
    onRestored?: () => void;
};

/**
 * Page callers omit the canvas and get an HTMLCanvasElement.
 * The disc worker passes its OffscreenCanvas. The page does not build one.
 */
export function createDiscBaker(
    surface?: HTMLCanvasElement | OffscreenCanvas,
    hooks?: DiscBakerHooks,
): DiscBaker {
    let canvas: HTMLCanvasElement | OffscreenCanvas | null = surface ?? null;
    let gl: WebGL2RenderingContext | null = null;
    let ops: ReturnType<typeof attachBaker> | null = null;
    let shade: ReturnType<typeof attachShade> | null = null;
    let broken = false;
    let lost = false;
    let disposed = false;
    let loseExt: { loseContext: () => void; restoreContext: () => void } | null = null;
    let frame = 0;
    let timeUsed = 0;
    const worlds = new Map<string, World>();
    let tiles = new Map<string, DiscTile>();
    let programState: 'idle' | 'pending' | 'ready' = 'idle';
    let parallel: ParallelCompile | null = null;
    let opened: OpenProgram[] = [];
    let blockingAt = 0;
    const blockingBuilt: LinkedProgram[] = [];
    const linkCosts: { label: string; ms: number }[] = [];

    function onLost(event: Event): void {
        event.preventDefault();
        lost = true;
        worlds.clear();
        tiles = new Map();
        opened = [];
        blockingBuilt.length = 0;
        blockingAt = 0;
        programState = 'idle';
        shade = null;
        hooks?.onLost?.();
    }

    function mountPrograms(linked: LinkedProgram[]): void {
        if (!gl || !ops) return;
        const stats = linked[0];
        const bake = linked[1];
        const draw = linked[2];
        if (!stats || !bake || !draw) throw new Error('link failed');
        ops.build(stats, bake);
        if (!shade) shade = attachShade(gl, draw, () => ops?.bindQuad());
        else shade.use(draw);
        opened = [];
        programState = 'ready';
    }

    function startCompile(): void {
        if (!gl || programState !== 'idle') return;
        parallel = gl.getExtension('KHR_parallel_shader_compile') as ParallelCompile | null;
        if (parallel) {
            opened = [];
            for (const spec of PROGRAMS) {
                const started = now();
                opened.push(beginProgram(gl as WebGL2RenderingContext, spec.source, spec.label));
                ops?.mark('beginProgram ' + spec.label, now() - started);
            }
        } else {
            blockingAt = 0;
            blockingBuilt.length = 0;
        }
        programState = 'pending';
    }

    function compilationDone(open: OpenProgram): boolean {
        if (!gl || !parallel) return false;
        if (!gl.getProgramParameter(open.prog, parallel.COMPLETION_STATUS_KHR)) return false;
        for (const shader of open.shaders) {
            if (!gl.getShaderParameter(shader, parallel.COMPLETION_STATUS_KHR)) return false;
        }
        return true;
    }

    function pollCompile(): void {
        if (!gl || !ops || programState !== 'pending') return;
        const bakerOps = ops;
        if (parallel) {
            const pollStarted = now();
            const done = opened.every(compilationDone);
            bakerOps.mark('COMPLETION_STATUS_KHR', now() - pollStarted);
            if (!done) return;
            const note = (name: string, ms: number): void => bakerOps.mark(name, ms);
            const finishStarted = now();
            const linked = opened.map((open) => finishProgram(gl as WebGL2RenderingContext, open, note));
            bakerOps.mark('finishProgram', now() - finishStarted);
            mountPrograms(linked);
            return;
        }
        const spec = PROGRAMS[blockingAt];
        if (!spec) return;
        const started = now();
        const linked = linkDiscProgram(gl, spec.source);
        const ms = now() - started;
        bakerOps.mark('link ' + spec.label, ms);
        linkCosts.push({ label: spec.label, ms });
        blockingBuilt.push(linked);
        blockingAt += 1;
        if (blockingAt >= PROGRAMS.length) mountPrograms(blockingBuilt);
    }

    function onRestored(): void {
        if (disposed) return;
        lost = false;
        worlds.clear();
        tiles = new Map();
        opened = [];
        blockingBuilt.length = 0;
        blockingAt = 0;
        programState = 'idle';
        shade = null;
        try {
            startCompile();
        } catch (err) {
            console.warn('[PlanetGL] Falling back to the canvas renderer:', err instanceof Error ? err.message : err);
            broken = true;
        }
        hooks?.onRestored?.();
    }

    function setup(): void {
        if (!canvas) canvas = createCanvas(1024, 1024);
        const contextStarted = now();
        gl = webgl2Context(canvas);
        const contextMs = now() - contextStarted;
        if (!gl) {
            broken = true;
            return;
        }
        const target: EventTarget = canvas;
        target.addEventListener('webglcontextlost', onLost);
        target.addEventListener('webglcontextrestored', onRestored);
        loseExt = gl.getExtension('WEBGL_lose_context');
        try {
            ops = attachBaker(gl);
            ops.mark('getContext', contextMs);
            startCompile();
        } catch (err) {
            console.warn('[PlanetGL] Falling back to the canvas renderer:', err instanceof Error ? err.message : err);
            broken = true;
        }
    }

    function pump(): void {
        if (disposed || broken || lost) return;
        if (!gl) setup();
        if (programState === 'idle') startCompile();
        if (programState === 'pending') pollCompile();
    }

    function ready(): boolean {
        return !disposed && !broken && !lost && programState === 'ready' && !!shade;
    }

    function bindDraw(program: LinkedProgram): void {
        if (!gl || !ops) return;
        if (!shade) shade = attachShade(gl, program, () => ops?.bindQuad());
        else shade.use(program);
    }

    function available(): boolean {
        if (!ready()) pump();
        return ready();
    }

    function requireOps(): ReturnType<typeof attachBaker> {
        if (!available() || !ops || !shade || !canvas || !gl) throw new Error('WebGL2 is not available');
        return ops;
    }

    function adopt(profile: BakeProfile): World {
        let world = worlds.get(profile.id);
        if (!world) {
            world = {
                profile,
                stats: null,
                statsBytes: null,
                cubes: new Map(),
                job: null,
                lastFrame: frame,
                near: 0,
                want: 32,
                lodCapped: false,
            };
            worlds.set(profile.id, world);
        }
        world.lastFrame = frame;
        if (profile.kind === 'gas' && !world.stats) world.stats = gasStats();
        return world;
    }

    function measureFresh(list: World[]): void {
        const gpu = requireOps();
        const fresh = list.filter((world) => !world.stats && world.profile.kind !== 'gas');
        for (let i = 0; i < fresh.length; i += STATS_BATCH) {
            const batch = fresh.slice(i, i + STATS_BATCH);
            const pixels = gpu.measure(batch.map((item) => item.profile));
            batch.forEach((item, index) => {
                const bytes = pixels[index];
                if (!bytes) return;
                item.statsBytes = bytes;
                item.stats = thresholdsFromStats(item.profile, bytes);
            });
        }
    }

    function ledger() {
        return [...worlds.entries()].map(([id, world]) => ({
            id,
            lastFrame: world.lastFrame,
            bytes: [...world.cubes.values()].reduce((sum, cube) => sum + cube.bytes, 0),
            jobBytes: world.job ? world.job.cube.bytes : 0,
        }));
    }

    function dropWorld(id: string): void {
        const world = worlds.get(id);
        const gpu = ops;
        if (!world) return;
        if (gpu && !lost && !broken) {
            for (const cube of world.cubes.values()) gpu.dropCube(cube);
            if (world.job) gpu.dropCube(world.job.cube);
        }
        worlds.delete(id);
    }

    function allocate(size: number): GpuCube | null {
        const gpu = requireOps();
        const target = canvas;
        const used = gpu.memory() + (target ? atlasBytes(target.width, target.height) : 0);
        const decision = reserve(used, cubeBytes(size), frame, ledger());
        for (const id of decision.evict) dropWorld(id);
        if (!decision.ok) return null;
        return gpu.makeCube(size);
    }

    function paint32(world: World): void {
        const gpu = requireOps();
        const cube = allocate(32);
        if (!cube) {
            world.lodCapped = true;
            return;
        }
        for (let face = 0; face < 6; face++) gpu.bakeFace(world.profile, world.stats, cube, face);
        gpu.finishCube(cube);
        world.cubes.set(32, cube);
    }

    function bakeBodies(entries: { world: World; want: number }[]): void {
        const gpu = requireOps();
        const started = now();
        let coarseId: string | null = null;
        let texels = 0;
        for (let guard = 0; guard < 16; guard++) {
            const decision = planFrame(entries.map((entry) => ({
                id: entry.world.profile.id,
                near: entry.world.near,
                hasStats: !!entry.world.stats,
                has32: entry.world.cubes.has(32),
                want: entry.want,
                finished: [...entry.world.cubes.keys()],
                job: entry.world.job ? { size: entry.world.job.cube.size, face: entry.world.job.face } : null,
            })), now() - started, coarseId, FRAME_BAKE_MS);
            coarseId = decision.coarseId;
            const action = decision.action;
            if (action.kind === 'stop') break;
            const entry = entries.find((item) => item.world.profile.id === action.id);
            if (!entry) break;
            const world = entry.world;
            if (action.kind === 'stats') {
                measureFresh([world]);
                continue;
            }
            if (action.kind === 'cube32') {
                paint32(world);
                continue;
            }
            if (action.kind === 'start') {
                if (world.job) {
                    gpu.dropCube(world.job.cube);
                    world.job = null;
                }
                const cube = allocate(action.size);
                if (!cube) {
                    world.lodCapped = true;
                    break;
                }
                world.job = { cube, face: 0 };
                continue;
            }
            const job = world.job;
            if (!job || texels >= BAKE_BUDGET) break;
            gpu.bakeFace(world.profile, world.stats, job.cube, job.face++);
            texels += job.cube.size * job.cube.size;
            if (job.face >= 6) {
                gpu.finishCube(job.cube);
                world.cubes.set(job.cube.size, job.cube);
                world.job = null;
            }
        }
    }

    function evict(): void {
        const gpu = requireOps();
        const target = canvas;
        const used = gpu.memory() + (target ? atlasBytes(target.width, target.height) : 0);
        const rows = ledger();
        for (const id of evictIds(used, frame, rows)) {
            const world = worlds.get(id);
            if (!world) continue;
            for (const cube of world.cubes.values()) gpu.dropCube(cube);
            if (world.job) gpu.dropCube(world.job.cube);
            worlds.delete(id);
        }
    }

    function clear(): void {
        if (!ops || broken) return;
        for (const world of worlds.values()) {
            for (const cube of world.cubes.values()) ops.dropCube(cube);
            if (world.job) ops.dropCube(world.job.cube);
        }
        worlds.clear();
        tiles = new Map();
    }

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        if (gl && ops && !lost && !broken) {
            clear();
            shade?.dispose();
            ops.disposeGpu();
        }
        worlds.clear();
        tiles = new Map();
        loseExt?.loseContext();
        if (canvas) {
            const target: EventTarget = canvas;
            target.removeEventListener('webglcontextlost', onLost);
            target.removeEventListener('webglcontextrestored', onRestored);
        }
        gl = null;
        ops = null;
        shade = null;
        canvas = null;
    }

    /** Bake only. Does not shade, so a timed step is the bake path. */
    function step(profile: BakeProfile, radiusPx: number, uTime: number): number {
        const started = now();
        pump();
        if (!ready()) return now() - started;
        timeUsed = uTime;
        frame += 1;
        const world = adopt(profile);
        world.near = 0;
        world.want = cubeSizeFor(radiusPx);
        bakeBodies([{ world, want: world.want }]);
        evict();
        const dt = now() - started;
        requireOps().note(dt);
        return dt;
    }

    function renderBatch(requests: ShadeRequest[]): Map<string, DiscTile> {
        tiles = new Map();
        pump();
        if (!ready() || !requests.length || !canvas || !shade) return tiles;
        const started = now();
        frame += 1;
        const adopted: { req: ShadeRequest; world: World }[] = [];
        requests.forEach((req, index) => {
            timeUsed = req.uTime;
            const world = adopt(req.profile);
            world.near = req.near ?? index;
            world.want = cubeSizeFor(req.radius);
            adopted.push({ req, world });
        });
        bakeBodies(adopted.map((item) => ({ world: item.world, want: item.world.want })));
        evict();
        const sized = adopted.map((item) => ({
            ...item,
            tileSize: tileSide(item.req.radius, item.req.ring ? item.req.ring.outer : null),
        }));
        const packed = packAtlas(sized, canvas.width, canvas.height);
        if (packed.width > canvas.width || packed.height > canvas.height) {
            canvas.width = packed.width;
            canvas.height = packed.height;
        }
        const drawable: ShadeDraw[] = [];
        for (const place of packed.placed) {
            const item = sized[place.index];
            if (!item) continue;
            const want = cubeSizeFor(item.req.radius);
            const size = bestCubeSize([...item.world.cubes.keys()], want);
            const cube = size == null ? undefined : item.world.cubes.get(size);
            if (!cube) continue;
            const ring = item.req.ring;
            tiles.set(item.req.key, {
                sx: place.tx,
                sy: place.ty,
                size: place.tileSize,
                scale: item.req.scale || 1,
                rings: ring ? { inner: ring.inner, outer: ring.outer } : null,
            });
            drawable.push({
                tx: place.tx,
                ty: place.ty,
                tileSize: place.tileSize,
                radius: item.req.radius,
                spin: item.req.spin,
                cloudSpin: item.req.cloudSpin,
                sweep: item.req.sweep,
                samples: item.req.samples,
                ring,
                tilt: item.req.tilt,
                light: item.req.light,
                sun: item.req.sun,
                casters: item.req.casters,
                lightMode: item.req.lightMode,
                uTime: item.req.uTime,
                profile: item.req.profile,
                port: shadePort(item.world.stats),
                cube,
            });
        }
        const gpu = requireOps();
        const drawer = shade;
        const target = canvas;
        if (drawer && target) gpu.time('shade draw', () => drawer.draw(drawable, target.width, target.height, HALO));
        const dt = now() - started;
        requireOps().note(dt);
        return tiles;
    }

    function readTile(key: string): Uint8Array | null {
        const placed = tiles.get(key);
        const gpu = requireOps();
        const context = gl;
        const target = canvas;
        if (!placed || !context || !target) return null;
        const glY = target.height - placed.sy - placed.size;
        const pixels = new Uint8Array(placed.size * placed.size * 4);
        const pack = context.getParameter(context.PACK_ALIGNMENT) as number;
        context.pixelStorei(context.PACK_ALIGNMENT, 1);
        gpu.time('finish', () => context.finish());
        gpu.time('readPixels tile ' + placed.size, () => {
            context.readPixels(placed.sx, glY, placed.size, placed.size, context.RGBA, context.UNSIGNED_BYTE, pixels);
        });
        context.pixelStorei(context.PACK_ALIGNMENT, pack);
        return pixels;
    }

    /**
     * Snapshot one atlas tile. sy is the top of the tile: the shade viewport is
     * flipped so that row lines up with drawImage's top-left origin.
     */
    function copyTile(key: string): HTMLCanvasElement | null {
        const placed = tiles.get(key);
        const target = canvas;
        if (!placed || !target || placed.size <= 0) return null;
        return copyCanvasRect(target, placed.sx, placed.sy, placed.size, placed.size);
    }

    function prepare(profile: BakeProfile, uTime: number): number {
        const started = now();
        timeUsed = uTime;
        const world = adopt(profile);
        measureFresh([world]);
        return now() - started;
    }

    /** Six faces of one size, timed with a GPU drain after each face. Not the progressive schedule. */
    function bakeSize(profile: BakeProfile, size: number, uTime: number): { ms: number; maxFaceMs: number } {
        timeUsed = uTime;
        const world = worlds.get(profile.id);
        if (!world?.stats) throw new Error('statistics were not measured');
        const gpu = requireOps();
        const cube = gpu.makeCube(size);
        let maxFaceMs = 0;
        const started = now();
        for (let face = 0; face < 6; face++) {
            const faceStarted = now();
            gpu.bakeFace(world.profile, world.stats, cube, face);
            gpu.sync();
            maxFaceMs = Math.max(maxFaceMs, now() - faceStarted);
        }
        gpu.finishCube(cube);
        gpu.sync();
        const ms = now() - started;
        world.cubes.set(size, cube);
        return { ms, maxFaceMs };
    }

    function dropCubes(id: string): void {
        const world = worlds.get(id);
        const gpu = ops;
        if (!world || !gpu) return;
        for (const cube of world.cubes.values()) gpu.dropCube(cube);
        world.cubes.clear();
        if (world.job) {
            gpu.dropCube(world.job.cube);
            world.job = null;
        }
    }

    function capture(id: string): DiscCapture {
        const world = worlds.get(id);
        const gpu = requireOps();
        if (!world) throw new Error('missing world ' + id);
        const cube32 = world.cubes.get(32);
        const cube128 = world.cubes.get(128);
        if (!cube32 || !cube128) throw new Error('cube maps 32 and 128 were not finished');
        const cube512 = world.cubes.get(512) ?? null;
        return {
            kind: world.profile.kind,
            timeUsed,
            stats: world.statsBytes,
            thresholds: publishThresholds(world.stats),
            cube32: gpu.readCube(cube32, 0),
            cube128: gpu.readCube(cube128, 0),
            cube512: cube512 ? gpu.readCube(cube512, 0) : null,
            mip128: gpu.readCube(cube128, 1),
            gpu: gpu.gpu(),
        };
    }

    return {
        available,
        openMs: () => {
            const started = now();
            pump();
            if (broken || lost) throw new Error('WebGL2 is not available');
            const dt = now() - started;
            ops?.note(dt);
            return dt;
        },
        clear,
        dispose,
        step,
        renderBatch,
        tile: (key) => tiles.get(key) ?? null,
        copyTile,
        readTile,
        prepare,
        bakeSize,
        dropCubes,
        jobPending: (id) => {
            if (lost || broken) return false;
            if (programState !== 'ready') return true;
            const world = worlds.get(id);
            if (!world) return false;
            if (world.job) return true;
            return !world.lodCapped && world.want > 32 && !world.cubes.has(world.want);
        },
        hasCube: (id, size) => !!worlds.get(id)?.cubes.has(size),
        capture,
        sync: () => requireOps().sync(),
        takeSpans: () => ops?.takeSpans() ?? [],
        longestSliceMs: () => ops?.longestSliceMs() ?? 0,
        memory: () => {
            const target = canvas;
            return (ops?.memory() ?? 0) + (target ? atlasBytes(target.width, target.height) : 0);
        },
        ready,
        pump,
        lost: () => lost,
        costs: () => linkCosts.slice(),
        stallProbe: (profile, size, skipCheck) => {
            pump();
            if (!ready()) throw new Error('programs are not ready');
            const world = adopt(profile);
            if (!world.stats) measureFresh([world]);
            const stats = world.stats;
            if (!stats) throw new Error('statistics were not measured');
            requireOps().takeSpans();
            requireOps().probeDraw(world.profile, stats, size, skipCheck);
            return requireOps().takeSpans();
        },
        warmup: (profile) => {
            pump();
            if (!ready()) return [];
            requireOps().takeSpans();
            const world = adopt(profile);
            if (!world.stats) measureFresh([world]);
            const stats = world.stats;
            if (!stats) return requireOps().takeSpans();
            requireOps().warmupPipeline(world.profile, stats);
            return requireOps().takeSpans();
        },
        failed: () => broken || disposed,
        gl: () => gl,
        bindDraw,
        loseForTest: () => {
            if (!loseExt) return false;
            loseExt.loseContext();
            return true;
        },
        restoreForTest: () => {
            if (!loseExt) return false;
            loseExt.restoreContext();
            return true;
        },
    };
}

/** Same basis the shade pass uploads. profile.axisAzimuth, tilt in degrees. */
export function axisBasis(profile: { axisAzimuth: number }, tiltDeg: number) {
    return axisOf(profile, tiltDeg);
}

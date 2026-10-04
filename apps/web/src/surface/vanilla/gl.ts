/**
 * Vanilla orbit-disc bake session. Availability, context and disposal.
 * The shade pass is not part of this session. js/planet_gl.js:745-785 and 997-1033,
 * the bake half of render only. uTime is stored and is not read from a clock.
 */
import { createCanvas, now, webgl2Context } from '../../platform/browser.ts';
import {
    attachBaker,
    BAKE_BUDGET,
    cubeSizeFor,
    evictIds,
    type BakeProfile,
    type BakeStats,
    type CubeFaces,
    type GpuCube,
    type GpuInfo,
} from './gl_bake.ts';
import { gasStats, STATS_BATCH, thresholdsFromStats, type DecodedThresholds } from './gl_stats.ts';

export type { BakeProfile, CubeFaces, GpuInfo };

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

export type DiscBaker = {
    available: () => boolean;
    openMs: () => number;
    clear: () => void;
    dispose: () => void;
    step: (profile: BakeProfile, radiusPx: number, uTime: number) => number;
    prepare: (profile: BakeProfile, uTime: number) => number;
    bakeSize: (profile: BakeProfile, size: number, uTime: number) => { ms: number; maxFaceMs: number };
    dropCubes: (id: string) => void;
    jobPending: (id: string) => boolean;
    hasCube: (id: string, size: number) => boolean;
    capture: (id: string) => DiscCapture;
    sync: () => number;
    longestSliceMs: () => number;
    memory: () => number;
};

function publishThresholds(stats: WorldStats): PublicThresholds | null {
    if (!stats) return null;
    const out: PublicThresholds = { sea: stats.sea, cloudEdge: stats.cloudEdge };
    if ('urbanEdge' in stats && stats.urbanEdge !== undefined) out.urbanEdge = stats.urbanEdge;
    if ('port' in stats && stats.port) out.port = [stats.port[0], stats.port[1], stats.port[2]];
    return out;
}

export function createDiscBaker(): DiscBaker {
    let canvas: HTMLCanvasElement | null = null;
    let gl: WebGL2RenderingContext | null = null;
    let ops: ReturnType<typeof attachBaker> | null = null;
    let broken = false;
    let lost = false;
    let disposed = false;
    let frame = 0;
    let timeUsed = 0;
    const worlds = new Map<string, World>();

    function onLost(event: Event): void {
        event.preventDefault();
        lost = true;
    }

    function onRestored(): void {
        if (disposed) return;
        lost = false;
        worlds.clear();
        try {
            ops?.build();
        } catch (err) {
            console.warn('[PlanetGL] Falling back to the canvas renderer:', err instanceof Error ? err.message : err);
            broken = true;
        }
    }

    function setup(): void {
        canvas = createCanvas(1024, 1024);
        gl = webgl2Context(canvas);
        if (!gl) {
            broken = true;
            return;
        }
        canvas.addEventListener('webglcontextlost', onLost);
        canvas.addEventListener('webglcontextrestored', onRestored);
        try {
            ops = attachBaker(gl);
            ops.build();
        } catch (err) {
            console.warn('[PlanetGL] Falling back to the canvas renderer:', err instanceof Error ? err.message : err);
            broken = true;
        }
    }

    function available(): boolean {
        if (disposed || broken) return false;
        if (!gl) setup();
        return !!gl && !broken && !lost && !!ops;
    }

    function requireOps(): ReturnType<typeof attachBaker> {
        if (!available() || !ops) throw new Error('WebGL2 is not available');
        return ops;
    }

    function ensure(profile: BakeProfile): World {
        const gpu = requireOps();
        let world = worlds.get(profile.id);
        if (!world) {
            world = { profile, stats: null, statsBytes: null, cubes: new Map(), job: null, lastFrame: frame };
            worlds.set(profile.id, world);
        }
        const fresh: World[] = [];
        if (!world.stats && profile.kind !== 'gas') fresh.push(world);
        if (profile.kind === 'gas' && !world.stats) world.stats = gasStats();
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
        return world;
    }

    function advance(budget: number): void {
        const gpu = requireOps();
        let spent = 0;
        for (const world of worlds.values()) {
            const job = world.job;
            if (!job) continue;
            while (job.face < 6 && spent < budget) {
                gpu.bakeFace(world.profile, world.stats, job.cube, job.face++);
                spent += job.cube.size * job.cube.size;
            }
            if (job.face >= 6) {
                gpu.finishCube(job.cube);
                world.cubes.set(job.cube.size, job.cube);
                world.job = null;
            }
            if (spent >= budget) break;
        }
    }

    function evict(): void {
        const gpu = requireOps();
        const rows = [...worlds.entries()].map(([id, world]) => ({
            id,
            lastFrame: world.lastFrame,
            bytes: [...world.cubes.values()].reduce((sum, cube) => sum + cube.bytes, 0),
            jobBytes: world.job ? world.job.cube.bytes : 0,
        }));
        for (const id of evictIds(gpu.memory(), frame, rows)) {
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
    }

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        if (gl && ops && !lost && !broken) {
            clear();
            ops.disposeGpu();
        }
        worlds.clear();
        if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
        if (canvas) {
            canvas.removeEventListener('webglcontextlost', onLost);
            canvas.removeEventListener('webglcontextrestored', onRestored);
        }
        gl = null;
        ops = null;
        canvas = null;
    }

    function step(profile: BakeProfile, radiusPx: number, uTime: number): number {
        const started = now();
        timeUsed = uTime;
        frame += 1;
        const world = ensure(profile);
        world.lastFrame = frame;
        const gpu = requireOps();
        const want = cubeSizeFor(radiusPx);
        if (!world.cubes.size) {
            const first = gpu.makeCube(32);
            for (let face = 0; face < 6; face++) gpu.bakeFace(world.profile, world.stats, first, face);
            gpu.finishCube(first);
            world.cubes.set(32, first);
        }
        if (!world.cubes.has(want) && (!world.job || world.job.cube.size !== want)) {
            if (!world.job || world.job.face === 0 || want > world.job.cube.size) {
                if (world.job) gpu.dropCube(world.job.cube);
                world.job = { cube: gpu.makeCube(want), face: 0 };
            }
        }
        advance(BAKE_BUDGET);
        evict();
        const dt = now() - started;
        gpu.note(dt);
        return dt;
    }

    function prepare(profile: BakeProfile, uTime: number): number {
        const started = now();
        timeUsed = uTime;
        ensure(profile);
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
            if (!available()) throw new Error('WebGL2 is not available');
            const dt = now() - started;
            ops?.note(dt);
            return dt;
        },
        clear,
        dispose,
        step,
        prepare,
        bakeSize,
        dropCubes,
        jobPending: (id) => !!worlds.get(id)?.job,
        hasCube: (id, size) => !!worlds.get(id)?.cubes.has(size),
        capture,
        sync: () => requireOps().sync(),
        longestSliceMs: () => ops?.longestSliceMs() ?? 0,
        memory: () => ops?.memory() ?? 0,
    };
}

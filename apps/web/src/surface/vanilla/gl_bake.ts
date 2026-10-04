/**
 * Cube bake for the vanilla orbit disc. Faces, attachments, mipmaps and the
 * two RGBA8 cubes. js/planet_gl.js:789-936 and 974-976. No shade pass.
 */
import { now } from '../../platform/browser.ts';
import { BAKE_FRAG, STATS_FRAG, VERT } from './gl_shaders.ts';
import { STATS_BATCH, STATS_H, STATS_W, type StatsFields } from './gl_stats.ts';

/** js/planet_gl.js:18 */
export const MEMORY_BUDGET = 320 * 1024 * 1024;

/** js/planet_gl.js:21 */
export const SIZES = [32, 64, 128, 256, 512, 1024] as const;

/** js/planet_gl.js:1032. Texels of cube faces painted in one frame. */
export const BAKE_BUDGET = 1 << 19;

export type LedgerWorld = { id: string; lastFrame: number; bytes: number; jobBytes: number };

/** js/planet_gl.js:974-976. The first listed size that covers radius * 1.25, else 1024. */
export function cubeSizeFor(radiusPx: number): number {
    return SIZES.find((size) => size >= radiusPx * 1.25) || 1024;
}

/** js/planet_gl.js:907. Byte estimate for both RGBA8 cubes, mip chain included (the 4/3). */
export function cubeBytes(size: number): number {
    return size * size * 6 * 4 * 2 * 4 / 3;
}

/**
 * js/planet_gl.js:961-970. Oldest worlds first. A world seen this frame stays.
 * Returns the ids to drop. The caller subtracts their bytes.
 */
export function evictIds(memory: number, frame: number, worlds: LedgerWorld[], budget = MEMORY_BUDGET): string[] {
    if (memory <= budget) return [];
    const order = [...worlds].sort((a, b) => a.lastFrame - b.lastFrame);
    const removed: string[] = [];
    let used = memory;
    for (const world of order) {
        if (used <= budget) break;
        if (world.lastFrame === frame) continue;
        used -= world.bytes + world.jobBytes;
        removed.push(world.id);
    }
    return removed;
}

export type BakeProfile = StatsFields & {
    id: string;
    offsets: number[];
    vortices: number[][];
    geology: { mountains: number; craters: number; volcanism: number };
    rock: { low: number[]; high: number[] };
    climate: { meanC: number; spread: number; locked: boolean };
    life: { cover: number; maturity: number; canopy: number[]; scrub: number[] };
    gas: { zone: number[]; belt: number[]; pole: number[]; storm: number[]; bands: number } | null;
};

export type BakeStats = { sea: number; cloudEdge: number; urbanEdge?: number } | null;

export type GpuCube = {
    size: number;
    a: WebGLTexture;
    b: WebGLTexture;
    fbo: WebGLFramebuffer | null;
    bytes: number;
};

export type CubeFaces = { a: Uint8Array[]; b: Uint8Array[] };

export type GpuInfo = {
    vendor: string;
    renderer: string;
    version: string;
    unmaskedVendor: string;
    unmaskedRenderer: string;
};

type Prog = { prog: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };

type Aniso = { TEXTURE_MAX_ANISOTROPY_EXT: number; max: number };

function must<T>(value: T | null, what: string): T {
    if (!value) throw new Error(what);
    return value;
}

const norm3 = (c: number[]): [number, number, number] => [(c[0] ?? 0) / 255, (c[1] ?? 0) / 255, (c[2] ?? 0) / 255];

/** Compiles the statistics and bake programs and owns the cube textures. */
export function attachBaker(gl: WebGL2RenderingContext): {
    build: () => void;
    memory: () => number;
    measure: (profiles: BakeProfile[]) => Uint8Array[];
    makeCube: (size: number) => GpuCube;
    dropCube: (cube: GpuCube) => void;
    bakeFace: (profile: BakeProfile, stats: BakeStats, cube: GpuCube, face: number) => void;
    finishCube: (cube: GpuCube) => void;
    readCube: (cube: GpuCube, level: number) => CubeFaces;
    sync: () => number;
    note: (ms: number) => void;
    longestSliceMs: () => number;
    gpu: () => GpuInfo;
    disposeGpu: () => void;
} {
    let memory = 0;
    let longest = 0;
    let programs: { stats: Prog; bake: Prog } | null = null;
    let anisotropy: Aniso | null = null;
    let statsTarget: { texture: WebGLTexture; fbo: WebGLFramebuffer } | null = null;
    let quad: WebGLBuffer | null = null;
    let gpuInfo: GpuInfo | null = null;

    function note(ms: number): void {
        if (ms > longest) longest = ms;
    }

    function span(fn: () => void): number {
        const started = now();
        fn();
        const dt = now() - started;
        note(dt);
        return dt;
    }

    function compile(type: number, source: string): WebGLShader {
        const shader = must(gl.createShader(type), 'shader');
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(log || 'shader compile failed');
        }
        return shader;
    }

    function program(fragment: string): Prog {
        const prog = must(gl.createProgram(), 'program');
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
        gl.bindAttribLocation(prog, 0, 'aPos');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
        const uniforms: Record<string, WebGLUniformLocation | null> = {};
        const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
        for (let i = 0; i < count; i++) {
            const info = gl.getActiveUniform(prog, i);
            if (!info) continue;
            const name = info.name.replace(/\[0\]$/, '');
            uniforms[name] = gl.getUniformLocation(prog, info.name);
        }
        return { prog, uniforms };
    }

    function drawQuad(): void {
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function setFields(u: Record<string, WebGLUniformLocation | null>, profile: BakeProfile): void {
        gl.uniform3fv(u.uOffset ?? null, profile.offsets);
        gl.uniform4fv(u.uVort ?? null, profile.vortices.flat());
        gl.uniform1f(u.uMountains ?? null, profile.geology.mountains);
        gl.uniform1f(u.uCraters ?? null, profile.geology.craters);
    }

    /** js/planet_gl.js:795-831 */
    function setBake(u: Record<string, WebGLUniformLocation | null>, profile: BakeProfile, stats: BakeStats, size: number, face: number): void {
        setFields(u, profile);
        gl.uniform1i(u.uFace ?? null, face);
        gl.uniform1f(u.uSize ?? null, size);
        gl.uniform1f(u.uSea ?? null, stats?.sea ?? 0.5);
        gl.uniform1f(u.uCloudEdge ?? null, stats?.cloudEdge ?? 0.6);
        gl.uniform1f(u.uUrbanEdge ?? null, stats?.urbanEdge ?? 2);
        gl.uniform1f(u.uCloudCover ?? null, profile.clouds.cover);
        gl.uniform1f(u.uGas ?? null, profile.kind === 'gas' ? 1 : 0);
        gl.uniform3fv(u.uRockLow ?? null, norm3(profile.rock.low));
        gl.uniform3fv(u.uRockHigh ?? null, norm3(profile.rock.high));
        gl.uniform1f(u.uHasLiquid ?? null, profile.liquid ? 1 : 0);
        gl.uniform1f(u.uFrozen ?? null, profile.liquid?.frozen ? 1 : 0);
        gl.uniform3fv(u.uLiqShallow ?? null, norm3(profile.liquid?.shallow || [0, 0, 0]));
        gl.uniform3fv(u.uLiqDeep ?? null, norm3(profile.liquid?.deep || [0, 0, 0]));
        gl.uniform1f(u.uWater ?? null, profile.water);
        gl.uniform1f(u.uMeanC ?? null, profile.climate.meanC);
        gl.uniform1f(u.uSpread ?? null, profile.climate.spread);
        gl.uniform1f(u.uLocked ?? null, profile.climate.locked ? 1 : 0);
        gl.uniform1f(u.uLife ?? null, profile.life.cover);
        gl.uniform1f(u.uMaturity ?? null, profile.life.maturity);
        gl.uniform3fv(u.uCanopy ?? null, norm3(profile.life.canopy));
        gl.uniform3fv(u.uScrub ?? null, norm3(profile.life.scrub));
        gl.uniform1f(u.uPop ?? null, profile.lights.pop);
        gl.uniform1f(u.uVolcanism ?? null, profile.geology.volcanism);
        gl.uniform1f(u.uHot ?? null, profile.kind === 'hot' ? 1 : 0);
        gl.uniform1f(u.uIce ?? null, profile.kind === 'ice' ? 1 : 0);
        const g = profile.gas || { zone: [0, 0, 0], belt: [0, 0, 0], pole: [0, 0, 0], storm: [0, 0, 0], bands: 10 };
        gl.uniform3fv(u.uGasZone ?? null, norm3(g.zone));
        gl.uniform3fv(u.uGasBelt ?? null, norm3(g.belt));
        gl.uniform3fv(u.uGasPole ?? null, norm3(g.pole));
        gl.uniform3fv(u.uGasStorm ?? null, norm3(g.storm));
        gl.uniform1f(u.uBands ?? null, g.bands);
        const v = profile.vortices[0];
        if (!v) throw new Error('missing vortex');
        gl.uniform4f(u.uStorm ?? null, v[0] ?? 0, v[1] ?? 0, (v[2] ?? 0) * 0.6, 0.16);
    }

    function build(): void {
        memory = 0;
        programs = { stats: program(STATS_FRAG), bake: program(BAKE_FRAG) };
        const ext = gl.getExtension('EXT_texture_filter_anisotropic');
        anisotropy = ext
            ? {
                TEXTURE_MAX_ANISOTROPY_EXT: ext.TEXTURE_MAX_ANISOTROPY_EXT,
                max: Math.min(8, Number(gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT))),
            }
            : null;
        quad = must(gl.createBuffer(), 'quad');
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const texture = must(gl.createTexture(), 'stats texture');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, STATS_W, STATS_H * STATS_BATCH);
        const fbo = must(gl.createFramebuffer(), 'stats framebuffer');
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        statsTarget = { texture, fbo };
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.BLEND);
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        gpuInfo = {
            vendor: String(gl.getParameter(gl.VENDOR) || ''),
            renderer: String(gl.getParameter(gl.RENDERER) || ''),
            version: String(gl.getParameter(gl.VERSION) || ''),
            unmaskedVendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || '') : '',
            unmaskedRenderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '') : '',
        };
    }

    function measure(profiles: BakeProfile[]): Uint8Array[] {
        if (!programs || !statsTarget) throw new Error('baker is not built');
        const { prog, uniforms: u } = programs.stats;
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, statsTarget.fbo);
        for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            if (!profile) continue;
            gl.viewport(0, i * STATS_H, STATS_W, STATS_H);
            setFields(u, profile);
            gl.uniform1f(u.uRow ?? null, i * STATS_H);
            drawQuad();
        }
        const pixels = new Uint8Array(STATS_W * STATS_H * profiles.length * 4);
        span(() => {
            gl.readPixels(0, 0, STATS_W, STATS_H * profiles.length, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const per = STATS_W * STATS_H * 4;
        const out: Uint8Array[] = [];
        for (let i = 0; i < profiles.length; i++) out.push(pixels.slice(i * per, (i + 1) * per));
        return out;
    }

    /** js/planet_gl.js:893-910 */
    function makeCube(size: number): GpuCube {
        const levels = Math.log2(size) + 1;
        const make = (): WebGLTexture => {
            const texture = must(gl.createTexture(), 'cube texture');
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
            gl.texStorage2D(gl.TEXTURE_CUBE_MAP, levels, gl.RGBA8, size, size);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            if (anisotropy) gl.texParameterf(gl.TEXTURE_CUBE_MAP, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy.max);
            return texture;
        };
        const bytes = cubeBytes(size);
        memory += bytes;
        return { size, a: make(), b: make(), fbo: must(gl.createFramebuffer(), 'cube framebuffer'), bytes };
    }

    function dropCube(cube: GpuCube): void {
        gl.deleteTexture(cube.a);
        gl.deleteTexture(cube.b);
        if (cube.fbo) gl.deleteFramebuffer(cube.fbo);
        memory -= cube.bytes;
    }

    /** js/planet_gl.js:916-926. Attachment 0 is cube A, attachment 1 is cube B. */
    function bakeFace(profile: BakeProfile, stats: BakeStats, cube: GpuCube, face: number): void {
        if (!programs) throw new Error('baker is not built');
        const { prog, uniforms: u } = programs.bake;
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, cube.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, cube.a, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, cube.b, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('bake framebuffer ' + status);
        gl.viewport(0, 0, cube.size, cube.size);
        setBake(u, profile, stats, cube.size, face);
        span(() => drawQuad());
    }

    /** js/planet_gl.js:927-936 */
    function finishCube(cube: GpuCube): void {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        for (const texture of [cube.a, cube.b]) {
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
            gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        }
        if (cube.fbo) gl.deleteFramebuffer(cube.fbo);
        cube.fbo = null;
    }

    function readCube(cube: GpuCube, level: number): CubeFaces {
        const size = cube.size >> level;
        const fbo = must(gl.createFramebuffer(), 'read framebuffer');
        const pack = gl.getParameter(gl.PACK_ALIGNMENT) as number;
        const out: CubeFaces = { a: [], b: [] };
        try {
            gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            for (const layer of ['a', 'b'] as const) {
                for (let face = 0; face < 6; face++) {
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, cube[layer], level);
                    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
                    gl.readBuffer(gl.COLOR_ATTACHMENT0);
                    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
                    if (status !== gl.FRAMEBUFFER_COMPLETE) {
                        throw new Error('read framebuffer ' + cube.size + ' ' + level + ' ' + layer + ' ' + face + ' ' + status);
                    }
                    const facePx = new Uint8Array(size * size * 4);
                    span(() => gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, facePx));
                    out[layer].push(facePx);
                }
            }
            return out;
        } finally {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.deleteFramebuffer(fbo);
            gl.pixelStorei(gl.PACK_ALIGNMENT, pack);
        }
    }

    function disposeGpu(): void {
        if (statsTarget) {
            gl.deleteTexture(statsTarget.texture);
            gl.deleteFramebuffer(statsTarget.fbo);
            statsTarget = null;
        }
        if (quad) gl.deleteBuffer(quad);
        quad = null;
        if (programs) {
            gl.deleteProgram(programs.stats.prog);
            gl.deleteProgram(programs.bake.prog);
            programs = null;
        }
    }

    return {
        build,
        memory: () => memory,
        measure,
        makeCube,
        dropCube,
        bakeFace,
        finishCube,
        readCube,
        sync: () => span(() => gl.finish()),
        note,
        longestSliceMs: () => longest,
        gpu: () => gpuInfo ?? { vendor: '', renderer: '', version: '', unmaskedVendor: '', unmaskedRenderer: '' },
        disposeGpu,
    };
}

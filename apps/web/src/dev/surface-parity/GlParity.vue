<script setup lang="ts">
import { ref } from 'vue';
import { createCanvas, nextFrame, now, observeLongTasks, publishAutomationResult } from '../../platform/browser.ts';
import { legacyDiscId } from '../../surface/identity.ts';
import { surfaceKind, surfaceProfile } from '../../surface/profile.ts';
import { cubeSizeFor, SIZES, type BakeProfile, type GpuSpan } from '../../surface/vanilla/gl_bake.ts';
import { createDiscBaker, type DiscBaker, type DiscCapture, type PublicThresholds, type ShadeRequest } from '../../surface/vanilla/gl.ts';
import { moonBasePx, worldBasePx } from '../../orbit/maths.ts';
import { anyByte, backendOf, compareBytes, copyBytes, hasAlpha, rgbaVaried, uniformZero, type ChannelCompare } from './gl_bytes.ts';
import { FROZEN_TIME, GL_CASES, GL_RING, NEGATIVE_CASE, STATS_BYTES, type GlCase, type GlRequest } from './gl_worlds.ts';

const REALM = '/dev/surface-parity/gl/realm.html';
const RESULT_KEY = '__surfaceGlParity';
const RADIUS_512 = 400;

type GpuInfo = {
    vendor: string;
    renderer: string;
    version: string;
    unmaskedVendor: string;
    unmaskedRenderer: string;
};

type CubeShot = { a: ArrayLike<number>[]; b: ArrayLike<number>[] };

type Thresholds = PublicThresholds;

type GlShot = {
    error?: string;
    profileJson: string;
    kind: string;
    timeUsed: number;
    stats: ArrayLike<number> | null;
    thresholds: Thresholds | null;
    cube32: CubeShot;
    cube128: CubeShot;
    cube512: CubeShot | null;
    mip128: CubeShot;
    gpu: GpuInfo;
};

type RealmBegin = { error?: string; profileJson: string; kind: string };

type RealmWindow = {
    beginGl?: (body: GlCase['body'], id: string, request: GlCase['request']) => RealmBegin;
    stepGl?: (radius: number) => { pending: boolean };
    readGl?: () => GlShot;
    renderGl?: (request: GlRequest) => { pending: boolean; tileSize: number };
    readTileGl?: () => { pixels: ArrayLike<number>; size: number };
};

type CubeCopy = { a: Uint8Array[]; b: Uint8Array[] };

type PublicCompare = {
    mismatches: number;
    maxChannelError: number;
    meanChannelError: number;
    length: number;
};

type FaceReport = PublicCompare & { layer: 'a' | 'b'; face: number };

type BufferReport = PublicCompare & { faces?: FaceReport[] };

type WorldReport = {
    id: string;
    kind: string;
    expectedKind: string;
    profileEqual: boolean;
    timeUsed: number;
    problems: string[];
    stats: { absent: true } | BufferReport;
    thresholds: Thresholds | null;
    portThresholds: Thresholds | null;
    cube32: BufferReport;
    cube128: BufferReport;
    cube512?: BufferReport;
    mip128: BufferReport;
    tile: TileReport;
    sha256: { stats: string | null; cube32: string; cube128: string };
    differenceImage?: string;
    againstOceanCube32Mismatches?: number;
    legacyStats: number[] | null;
    legacyProfile: string;
    legacyThresholds: Thresholds | null;
};

type SourceManifest = {
    planetGlSha256: string;
    planetProfileSha256: string;
    insertions: { id: string; count: number }[];
};

type TileReport = { compared: false } | {
    compared: true;
    mismatches: number;
    maxChannelError: number;
    meanChannelError: number;
    length: number;
    size: number;
    varied: boolean;
    alpha: boolean;
};

type ShadeReport = {
    id: string;
    mismatches: number;
    maxChannelError: number;
    meanChannelError: number;
    length: number;
    size: number;
    varied: boolean;
    alpha: boolean;
    problems: string[];
    differenceImage?: string;
};

type SlowTurn = { name: string; ms: number; spans: GpuSpan[]; unspannedMs: number };

type ColdReport = {
    progressiveFirstStepMs: number;
    progressiveFirstStepDrainMs: number;
    compileMs: number;
    statsMs: number;
    sizes: { size: number; ms: number; maxFaceMs: number }[];
    longestSliceMs: number;
    parityLongTasksMs: number[];
    shadeLongTasksMs: number[];
    sweepLongTasksMs: number[];
    longestLongTaskMs: number;
    parityTurns: SlowTurn[];
    shadeTurns: SlowTurn[];
};

type ReginaReport = {
    bodies: number;
    wallMs: number;
    drainMs: number;
    longTasksMs: number[];
    radiusModel: string;
    error?: string;
};

type GlReport = {
    status: 'running' | 'done' | 'error';
    ok: boolean;
    message?: string;
    frozenTime: number;
    shadeCompared: boolean;
    frozen: { animationSeconds: number; sweep: number; samples: number; casters: number; lightMode: boolean };
    readback: { statistics: boolean; cubeFaces: boolean; tile: boolean; gasStatistics: boolean; inspect: false; cube512: boolean; mip128: boolean };
    shades?: ShadeReport[];
    regina?: ReginaReport;
    source?: SourceManifest;
    gpu?: GpuInfo & { backend: string; userAgent: string };
    worlds: WorldReport[];
    negativeControl?: WorldReport;
    cold?: ColdReport;
};

const legacyFrame = ref<HTMLIFrameElement | null>(null);
const legacyFrameB = ref<HTMLIFrameElement | null>(null);
const report = ref<GlReport>({
    status: 'running',
    ok: false,
    frozenTime: FROZEN_TIME,
    shadeCompared: false,
    frozen: { animationSeconds: FROZEN_TIME, sweep: 0, samples: 1, casters: 0, lightMode: false },
    readback: { statistics: true, cubeFaces: true, tile: true, gasStatistics: false, inspect: false, cube512: true, mip128: true },
    worlds: [],
});

let started = false;

function publish(value: GlReport): void {
    report.value = value;
    publishAutomationResult(RESULT_KEY, value);
}

function frame(): Promise<void> {
    return new Promise((resolve) => {
        nextFrame(() => resolve());
    });
}

function pub(cmp: ChannelCompare): PublicCompare {
    return {
        mismatches: cmp.mismatches,
        maxChannelError: cmp.maxChannelError,
        meanChannelError: cmp.meanChannelError,
        length: cmp.length,
    };
}

function copyCube(cube: CubeShot): CubeCopy {
    return {
        a: cube.a.map((face) => copyBytes(face) ?? new Uint8Array()),
        b: cube.b.map((face) => copyBytes(face) ?? new Uint8Array()),
    };
}

function compareCube(left: CubeCopy, right: CubeCopy, note: (left: Uint8Array, right: Uint8Array, cmp: ChannelCompare) => void): BufferReport {
    const faces: FaceReport[] = [];
    let mismatches = 0;
    let maxChannelError = 0;
    let sum = 0;
    let length = 0;
    for (const layer of ['a', 'b'] as const) {
        for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            const a = left[layer][faceIndex] ?? new Uint8Array();
            const b = right[layer][faceIndex] ?? new Uint8Array();
            const cmp = compareBytes(a, b);
            note(a, b, cmp);
            faces.push({ layer, face: faceIndex, ...pub(cmp) });
            mismatches += cmp.mismatches;
            if (cmp.maxChannelError > maxChannelError) maxChannelError = cmp.maxChannelError;
            sum += cmp.sum;
            length += cmp.length;
        }
    }
    return { mismatches, maxChannelError, meanChannelError: length === 0 ? 0 : sum / length, length, faces };
}

function errorPng(left: ArrayLike<number>, right: ArrayLike<number>, width: number, height: number): string | null {
    if (left.length !== width * height * 4 || right.length !== left.length) return null;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const diff = new Uint8ClampedArray(left.length);
    for (let i = 0; i < left.length; i++) {
        const delta = Math.abs((left[i] ?? 0) - (right[i] ?? 0));
        diff[i] = i % 4 === 3 ? 255 : delta;
    }
    ctx.putImageData(new ImageData(diff, width, height), 0, 0);
    return canvas.toDataURL('image/png');
}

async function digest(parts: ArrayLike<number>[]): Promise<string> {
    let length = 0;
    for (const part of parts) length += part.length;
    const copy = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        for (let i = 0; i < part.length; i++) copy[offset + i] = part[i] ?? 0;
        offset += part.length;
    }
    const hashed = await crypto.subtle.digest('SHA-256', copy);
    return [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cubeParts(cube: CubeCopy): Uint8Array[] {
    return [...cube.a, ...cube.b];
}

function cubeMismatches(left: CubeCopy, right: CubeCopy): number {
    let mismatches = 0;
    for (const layer of ['a', 'b'] as const) {
        for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            mismatches += compareBytes(left[layer][faceIndex] ?? null, right[layer][faceIndex] ?? null).mismatches;
        }
    }
    return mismatches;
}

function asNumbers(bytes: ArrayLike<number> | null): number[] | null {
    if (bytes == null) return null;
    const out: number[] = [];
    for (let i = 0; i < bytes.length; i++) out.push(bytes[i] ?? 0);
    return out;
}

function discId(item: GlCase): string {
    const kind = surfaceKind(item.body);
    if (!kind) throw new Error('no surface kind');
    const id = legacyDiscId(item.body.hexId, item.body as never, kind);
    if (item.surfaceId !== id && item.surfaceId !== id + '|alt') {
        throw new Error('disc id ' + id + ' != ' + item.surfaceId);
    }
    return item.surfaceId;
}

function profileFor(item: GlCase, id: string): BakeProfile {
    return surfaceProfile(item.body as never, id) as BakeProfile;
}

function realmOf(): RealmWindow {
    const realm = legacyFrame.value?.contentWindow as RealmWindow | null;
    if (!realm?.beginGl || !realm.stepGl || !realm.readGl || !realm.renderGl || !realm.readTileGl) {
        throw new Error('GL realm is not loaded.');
    }
    return realm;
}

function recordTurn(into: SlowTurn[], name: string, ms: number, spans: GpuSpan[]): void {
    const traceAll = new URLSearchParams(globalThis.location.search).has('probe');
    if (!traceAll && ms < 50) return;
    let sum = 0;
    for (const span of spans) sum += span.ms;
    into.push({
        name,
        ms,
        spans: spans.filter((span) => span.ms >= 15),
        unspannedMs: ms - sum,
    });
}

function toShade(item: GlCase, request: GlRequest): ShadeRequest {
    return {
        key: request.key,
        profile: profileFor(item, discId(item)) as ShadeRequest['profile'],
        radius: request.radius,
        spin: request.spin,
        cloudSpin: request.cloudSpin,
        sweep: request.sweep,
        samples: request.samples,
        ring: request.ring,
        tilt: request.tilt,
        light: request.light,
        sun: request.sun,
        casters: request.casters,
        lightMode: request.lightMode,
        scale: request.scale,
        uTime: request.frozenTime,
    };
}

function portShot(captured: DiscCapture, profileJson: string): GlShot {
    return {
        profileJson,
        kind: captured.kind,
        timeUsed: captured.timeUsed,
        stats: captured.stats,
        thresholds: captured.thresholds,
        cube32: captured.cube32,
        cube128: captured.cube128,
        cube512: captured.cube512,
        mip128: captured.mip128,
        gpu: captured.gpu,
    };
}

async function waitReady(baker: DiscBaker): Promise<void> {
    let guard = 0;
    while (!baker.ready()) {
        baker.pump();
        if (baker.lost()) throw new Error('WebGL context lost');
        guard += 1;
        if (guard > 600) throw new Error('programs were not ready');
        await frame();
    }
}

async function renderPort(
    baker: DiscBaker,
    item: GlCase,
    cold: { firstStepMs: number | null; drainMs: number | null },
    turns: SlowTurn[],
): Promise<GlShot> {
    const id = discId(item);
    const profile = profileFor(item, id);
    await waitReady(baker);
    baker.clear();
    const radii = item.id === 'Ocean' ? [item.request.radius, RADIUS_512] : [item.request.radius];
    for (const radius of radii) {
        let guard = 0;
        for (;;) {
            baker.takeSpans();
            const ms = baker.step(profile, radius, item.request.frozenTime);
            const spans = baker.takeSpans();
            if (cold.firstStepMs == null) {
                cold.firstStepMs = ms;
                cold.drainMs = baker.sync();
                baker.takeSpans();
            }
            recordTurn(turns, 'step ' + item.id + ' r' + radius, ms, spans);
            guard += 1;
            if (!baker.jobPending(profile.id)) break;
            if (guard >= 12) throw new Error('port bake did not finish');
            await frame();
        }
    }
    if (!baker.hasCube(id, 32) || !baker.hasCube(id, 128)) throw new Error('port cubes 32 and 128 were not finished');
    if (item.id === 'Ocean' && !baker.hasCube(id, 512)) throw new Error('port cube 512 was not finished');
    baker.takeSpans();
    const started = now();
    const shot = baker.capture(id);
    recordTurn(turns, 'capture ' + item.id, now() - started, baker.takeSpans());
    return portShot(shot, JSON.stringify(profile));
}

async function renderLegacy(item: GlCase, turns: SlowTurn[], realm: RealmWindow = realmOf()): Promise<GlShot> {
    const id = discId(item);
    const beginStarted = now();
    const begun = realm.beginGl!(item.body, id, item.request);
    recordTurn(turns, 'legacy beginGl ' + item.id, now() - beginStarted, []);
    if (begun.error) throw new Error(begun.error);
    const radii = item.id === 'Ocean' ? [item.request.radius, RADIUS_512] : [item.request.radius];
    for (const radius of radii) {
        let guard = 0;
        for (;;) {
            const started = now();
            const pending = realm.stepGl!(radius).pending;
            recordTurn(turns, 'legacy step ' + item.id + ' r' + radius, now() - started, []);
            guard += 1;
            if (!pending) break;
            if (guard >= 12) throw new Error('legacy bake did not finish');
            await frame();
        }
    }
    const started = now();
    const shot = realm.readGl!();
    recordTurn(turns, 'legacy read ' + item.id, now() - started, []);
    if (shot.error) throw new Error(shot.error);
    return shot;
}

function sameGpu(left: GpuInfo, right: GpuInfo): boolean {
    return left.renderer === right.renderer && left.unmaskedRenderer === right.unmaskedRenderer;
}

function zeros(cube: CubeCopy | null, problems: string[], label: string): void {
    if (!cube) return;
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        if (!uniformZero(cube.b[faceIndex] ?? null)) problems.push(label + ' cube B ' + faceIndex);
    }
}

async function describe(item: GlCase, port: GlShot, legacy: GlShot, oceanCube: CubeCopy | null): Promise<{ report: WorldReport; cube32: CubeCopy }> {
    const problems: string[] = [];
    const gas = item.expectedKind === 'gas';
    if (port.kind !== item.expectedKind || legacy.kind !== item.expectedKind) problems.push('kind ' + port.kind + '/' + legacy.kind);
    const profileEqual = port.profileJson === legacy.profileJson;
    if (!profileEqual) problems.push('profile');
    if (port.timeUsed !== FROZEN_TIME || legacy.timeUsed !== FROZEN_TIME) problems.push('time');
    if (!sameGpu(port.gpu, legacy.gpu)) problems.push('gpu');
    if (JSON.stringify(port.thresholds) !== JSON.stringify(legacy.thresholds)) problems.push('thresholds');

    const statsA = copyBytes(port.stats);
    const statsB = copyBytes(legacy.stats);
    const cube32A = copyCube(port.cube32);
    const cube32B = copyCube(legacy.cube32);
    const cube128A = copyCube(port.cube128);
    const cube128B = copyCube(legacy.cube128);
    const mipA = copyCube(port.mip128);
    const mipB = copyCube(legacy.mip128);

    let differenceImage: string | undefined;
    const note = (width: number, height: number) => (a: ArrayLike<number>, b: ArrayLike<number>, cmp: ChannelCompare) => {
        if (differenceImage || cmp.mismatches === 0) return;
        differenceImage = errorPng(a, b, width, height) ?? undefined;
    };

    let stats: WorldReport['stats'];
    if (gas) {
        if (statsA || statsB) problems.push('gas stats present');
        const stub = JSON.stringify({ sea: 0, cloudEdge: 1 });
        if (JSON.stringify(port.thresholds) !== stub || JSON.stringify(legacy.thresholds) !== stub) problems.push('gas thresholds');
        stats = { absent: true };
    } else {
        const cmp = compareBytes(statsA, statsB);
        if (!statsA || statsA.length !== STATS_BYTES || !statsB || statsB.length !== STATS_BYTES) problems.push('stats missing');
        else note(128, 64)(statsA, statsB, cmp);
        if (cmp.mismatches !== 0) problems.push('stats');
        if (!rgbaVaried(statsA)) problems.push('stats blank');
        if (port.thresholds?.urbanEdge === undefined || !port.thresholds.port) problems.push('thresholds missing');
        stats = pub(cmp);
    }

    const cube32 = compareCube(cube32A, cube32B, note(32, 32));
    const cube128 = compareCube(cube128A, cube128B, note(128, 128));
    const mip128 = compareCube(mipA, mipB, note(64, 64));
    if (cube32.mismatches !== 0) problems.push('cube32');
    if (cube128.mismatches !== 0) problems.push('cube128');
    if (mip128.mismatches !== 0) problems.push('mip1');
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        if (!rgbaVaried(cube32A.a[faceIndex] ?? null) || !rgbaVaried(cube128A.a[faceIndex] ?? null)) problems.push('cube A blank ' + faceIndex);
    }
    if (gas) {
        zeros(cube32A, problems, 'port32');
        zeros(cube32B, problems, 'legacy32');
        zeros(cube128A, problems, 'port128');
        zeros(cube128B, problems, 'legacy128');
        zeros(mipA, problems, 'port mip');
        zeros(mipB, problems, 'legacy mip');
    } else {
        if (!cube32A.b.some((face) => anyByte(face))) problems.push('cube32 B blank');
        if (!cube128A.b.some((face) => anyByte(face))) problems.push('cube128 B blank');
    }

    let cube512: BufferReport | undefined;
    if (item.id === 'Ocean') {
        if (!port.cube512 || !legacy.cube512) problems.push('cube512 missing');
        else {
            const highA = copyCube(port.cube512);
            const highB = copyCube(legacy.cube512);
            cube512 = compareCube(highA, highB, note(512, 512));
            if (cube512.mismatches !== 0) problems.push('cube512');
            if (!rgbaVaried(highA.a[0] ?? null)) problems.push('cube512 A blank');
        }
    }

    const sha = {
        stats: statsB ? await digest([statsB]) : null,
        cube32: await digest(cubeParts(cube32A)),
        cube128: await digest(cubeParts(cube128A)),
    };
    const world: WorldReport = {
        id: item.id,
        kind: port.kind,
        expectedKind: item.expectedKind,
        profileEqual,
        timeUsed: port.timeUsed,
        problems,
        stats,
        thresholds: legacy.thresholds,
        portThresholds: port.thresholds,
        cube32,
        cube128,
        mip128,
        tile: { compared: false },
        sha256: sha,
        legacyStats: asNumbers(legacy.stats),
        legacyProfile: legacy.profileJson,
        legacyThresholds: legacy.thresholds,
    };
    if (cube512) world.cube512 = cube512;
    if (differenceImage) world.differenceImage = differenceImage;
    if (oceanCube) world.againstOceanCube32Mismatches = cubeMismatches(oceanCube, cube32A);
    return { report: world, cube32: cube32A };
}

const RADIUS_MODEL = 'zoom 1, dpr 1, worldBasePx and moonBasePx, skip r below 2.5, ring outer omits the moon-orbit limit, sun 1 0.96 0.9, casters empty';

function shadeRow(id: string, port: Uint8Array, legacy: Uint8Array, size: number): ShadeReport {
    const cmp = compareBytes(port, legacy);
    const problems: string[] = [];
    const varied = rgbaVaried(port);
    const alpha = hasAlpha(port);
    if (cmp.mismatches !== 0) problems.push('tile');
    if (!varied) problems.push('tile blank');
    if (!alpha) problems.push('tile alpha');
    const row: ShadeReport = {
        id,
        mismatches: cmp.mismatches,
        maxChannelError: cmp.maxChannelError,
        meanChannelError: cmp.meanChannelError,
        length: cmp.length,
        size,
        varied,
        alpha,
        problems,
    };
    if (cmp.mismatches !== 0) {
        const image = errorPng(port, legacy, size, size);
        if (image) row.differenceImage = image;
    }
    return row;
}

function asTile(row: ShadeReport): TileReport {
    return {
        compared: true,
        mismatches: row.mismatches,
        maxChannelError: row.maxChannelError,
        meanChannelError: row.meanChannelError,
        length: row.length,
        size: row.size,
        varied: row.varied,
        alpha: row.alpha,
    };
}

async function settleShade(
    baker: DiscBaker,
    item: GlCase,
    request: GlRequest,
    turns: SlowTurn[],
): Promise<{ port: Uint8Array; legacy: Uint8Array; size: number }> {
    const realm = realmOf();
    const id = discId(item);
    await waitReady(baker);
    let guard = 0;
    for (;;) {
        baker.takeSpans();
        const started = now();
        baker.renderBatch([toShade(item, request)]);
        const batchMs = now() - started;
        recordTurn(turns, 'renderBatch ' + item.id + ' r' + request.radius, batchMs, baker.takeSpans());
        const pendingPort = baker.jobPending(id);
        const legacyStarted = now();
        const legacyPending = realm.renderGl!(request).pending;
        recordTurn(turns, 'legacy renderGl ' + item.id + ' r' + request.radius, now() - legacyStarted, []);
        guard += 1;
        if (!pendingPort && !legacyPending) {
            const readStarted = now();
            const port = baker.readTile(request.key);
            recordTurn(turns, 'readTile ' + item.id + ' ' + (baker.tile(request.key)?.size ?? 0), now() - readStarted, baker.takeSpans());
            const legacyReadStarted = now();
            const legacyShot = realm.readTileGl!();
            recordTurn(turns, 'legacy readTileGl ' + item.id, now() - legacyReadStarted, []);
            const legacyPx = copyBytes(legacyShot.pixels);
            const placed = baker.tile(request.key);
            if (!port || !legacyPx || !placed) throw new Error('tile missing ' + item.id);
            if (placed.size !== legacyShot.size) throw new Error('tile size ' + placed.size + ' != ' + legacyShot.size);
            return { port, legacy: legacyPx, size: placed.size };
        }
        if (guard >= 12) throw new Error('shade bake did not finish ' + item.id);
        await frame();
    }
}

async function measureSizes(profile: BakeProfile): Promise<{ compileMs: number; statsMs: number; sizes: ColdReport['sizes']; longestSliceMs: number }> {
    const baker = createDiscBaker();
    try {
        await waitReady(baker);
        const compileMs = baker.openMs();
        const statsMs = baker.prepare(profile, FROZEN_TIME);
        const sizes: ColdReport['sizes'] = [];
        for (const size of SIZES) {
            await frame();
            const timed = baker.bakeSize(profile, size, FROZEN_TIME);
            sizes.push({ size, ms: timed.ms, maxFaceMs: timed.maxFaceMs });
            baker.dropCubes(profile.id);
        }
        return { compileMs, statsMs, sizes, longestSliceMs: baker.longestSliceMs() };
    } finally {
        baker.dispose();
    }
}

async function compareShade(baker: DiscBaker, item: GlCase, request: GlRequest, id: string, turns: SlowTurn[]): Promise<ShadeReport> {
    const shot = await settleShade(baker, item, request, turns);
    return shadeRow(id, shot.port, shot.legacy, shot.size);
}

async function timeRegina(longTasks: number[]): Promise<ReginaReport> {
    const mark = longTasks.length;
    const response = await fetch('/dev/surface-parity/gl/regina.json');
    if (!response.ok) {
        return { bodies: 0, wallMs: 0, drainMs: 0, longTasksMs: [], radiusModel: RADIUS_MODEL, error: 'regina shade file was not served' };
    }
    const payload = await response.json() as { hexId: string; system: { worlds?: Record<string, unknown>[] } };
    const requests: ShadeRequest[] = [];
    const hexId = payload.hexId || '1910';
    const consider = (body: Record<string, unknown>, basePx: number): void => {
        if (body.type === 'Empty') return;
        const kind = surfaceKind(body);
        if (!kind || kind === 'star' || kind === 'belt' || kind === 'ring') return;
        const r = basePx;
        if (r < 2.5) return;
        const profile = surfaceProfile(body, legacyDiscId(hexId, body, kind)) as ShadeRequest['profile'] & {
            rotation: { tilt: number; locked: boolean };
        };
        const moons = (body.moons as { size?: string; type?: string }[] | undefined) || [];
        const ringCount = ((body.rings as unknown[]) || []).length + moons.filter((moon) => moon.size === 'R').length;
        let ring: ShadeRequest['ring'] = null;
        if (ringCount > 0) {
            const outer = Math.max(1.4, Math.min(2.05, 1.6 + 0.2 * Math.min(ringCount, 4)));
            ring = { inner: 1.22, outer, fill: Math.min(1, 0.55 + ringCount * 0.15), phase: 0, detail: 1 };
        }
        const full = r;
        const reachFactor = Math.max(1.16, ring ? ring.outer * 1.01 : 0);
        const scale = Math.min(1, 1100 / full, 2000 / (full * reachFactor));
        const locked = !!profile.rotation?.locked;
        requests.push({
            key: profile.id,
            profile,
            radius: full * scale,
            spin: 0,
            cloudSpin: 0,
            sweep: 0,
            samples: 1,
            ring,
            tilt: locked ? 0 : profile.rotation.tilt,
            light: [1, 0],
            sun: [1, 0.96, 0.9],
            casters: [],
            lightMode: false,
            scale,
            uTime: FROZEN_TIME,
        });
    };
    for (const world of payload.system.worlds || []) {
        consider(world, worldBasePx(world as never));
        const moons = (world.moons as Record<string, unknown>[] | undefined) || [];
        for (const moon of moons) consider(moon, moonBasePx(moon as never));
    }
    const fresh = createDiscBaker();
    try {
        await waitReady(fresh);
        fresh.openMs();
        fresh.takeSpans();
        const started = now();
        fresh.renderBatch(requests);
        const wallMs = now() - started;
        const drainMs = fresh.sync();
        return { bodies: requests.length, wallMs, drainMs, longTasksMs: longTasks.slice(mark), radiusModel: RADIUS_MODEL };
    } finally {
        fresh.dispose();
    }
}

async function run(): Promise<void> {
    const longTasks: number[] = [];
    const stopTasks = observeLongTasks((duration) => longTasks.push(duration));
    const baker = createDiscBaker();
    const coldMark = { firstStepMs: null as number | null, drainMs: null as number | null };
    const worlds: WorldReport[] = [];
    const shades: ShadeReport[] = [];
    const parityTurns: SlowTurn[] = [];
    const shadeTurns: SlowTurn[] = [];
    let negativeReport: WorldReport | undefined;
    let source: SourceManifest | undefined;
    let gpu: GpuInfo | null = null;
    try {
        if (cubeSizeFor(RADIUS_512) !== 512) throw new Error('radius 400 does not select cube 512');
        const response = await fetch('/dev/surface-parity/gl/manifest.json');
        if (!response.ok) throw new Error('GL source manifest was not served.');
        source = await response.json() as SourceManifest;
        await frame();
        let oceanCube: CubeCopy | null = null;
        const parityTasks: number[] = [];
        const shadeTasks: number[] = [];
        for (const item of GL_CASES) {
            const before = longTasks.length;
            const port = await renderPort(baker, item, coldMark, parityTurns);
            await frame();
            const legacy = await renderLegacy(item, parityTurns);
            parityTasks.push(...longTasks.slice(before));
            if (!gpu) gpu = port.gpu;
            const described = await describe(item, port, legacy, null);
            worlds.push(described.report);
            if (item.id === 'Ocean') oceanCube = described.cube32;
            const shadeFrom = longTasks.length;
            const frozen = await compareShade(baker, item, item.request, item.id + ' frozen', shadeTurns);
            described.report.tile = asTile(frozen);
            for (const problem of frozen.problems) described.report.problems.push(problem);
            if (frozen.differenceImage) described.report.differenceImage = frozen.differenceImage;
            if (item.id === 'Ocean') {
                const variants: { id: string; request: GlRequest }[] = [
                    { id: 'Ocean tilt 0', request: { ...item.request, tilt: 0 } },
                    { id: 'Ocean tilt 90', request: { ...item.request, tilt: 90 } },
                    { id: 'Ocean tilt 120', request: { ...item.request, tilt: 120 } },
                    { id: 'Ocean sweep 0', request: { ...item.request, sweep: 0, samples: 1 } },
                    { id: 'Ocean sweep 0.5', request: { ...item.request, sweep: 0.5, samples: 16 } },
                    { id: 'Ocean eclipse', request: { ...item.request, casters: [[1.8, 2.4, 1.2]] } },
                    { id: 'Ocean light', request: { ...item.request, lightMode: true } },
                    { id: 'Ocean radius 2.5', request: { ...item.request, radius: 2.5 } },
                    { id: 'Ocean radius 1100', request: { ...item.request, radius: 1100 } },
                ];
                for (const variant of variants) shades.push(await compareShade(baker, item, variant.request, variant.id, shadeTurns));
            }
            if (item.id === 'Ringed') {
                shades.push(await compareShade(baker, item, { ...item.request, ring: { ...GL_RING, phase: 0.75 } }, 'Ringed phase 0.75', shadeTurns));
                shades.push(await compareShade(baker, item, { ...item.request, ring: { ...GL_RING, phase: 0 } }, 'Ringed phase 0', shadeTurns));
            }
            shadeTasks.push(...longTasks.slice(shadeFrom));
            await frame();
        }
        const beforeNegative = longTasks.length;
        const altPort = await renderPort(baker, NEGATIVE_CASE, coldMark, parityTurns);
        await frame();
        const altLegacy = await renderLegacy(NEGATIVE_CASE, parityTurns);
        parityTasks.push(...longTasks.slice(beforeNegative));
        const negative = await describe(NEGATIVE_CASE, altPort, altLegacy, oceanCube);
        if (!(negative.report.againstOceanCube32Mismatches && negative.report.againstOceanCube32Mismatches > 0)) {
            negative.report.problems.push('negative matched the ocean cube');
        }
        negativeReport = negative.report;
        await frame();
        const beforeSweep = longTasks.length;
        const measured = await measureSizes(profileFor(GL_CASES[0]!, discId(GL_CASES[0]!)));
        await frame();
        const sweepLongTasksMs = longTasks.slice(beforeSweep);
        const regina = await timeRegina(longTasks);
        const renderer = gpu ? (gpu.unmaskedRenderer || gpu.renderer) : '';
        const gpuReport = gpu ? { ...gpu, backend: backendOf(renderer), userAgent: navigator.userAgent } : undefined;
        const worldsOk = worlds.every((item) => item.problems.length === 0);
        const shadesOk = shades.every((item) => item.problems.length === 0);
        const negativeOk = negative.report.problems.length === 0;
        const reginaOk = !regina.error && regina.bodies > 0;
        const ok = worldsOk && shadesOk && negativeOk && reginaOk && renderer.trim() !== '';
        const cold: ColdReport = {
            progressiveFirstStepMs: coldMark.firstStepMs ?? 0,
            progressiveFirstStepDrainMs: coldMark.drainMs ?? 0,
            compileMs: measured.compileMs,
            statsMs: measured.statsMs,
            sizes: measured.sizes,
            longestSliceMs: Math.max(baker.longestSliceMs(), measured.longestSliceMs),
            parityLongTasksMs: parityTasks,
            shadeLongTasksMs: shadeTasks,
            sweepLongTasksMs,
            longestLongTaskMs: longTasks.reduce((max, duration) => Math.max(max, duration), 0),
            parityTurns,
            shadeTurns,
        };
        publish({
            status: 'done',
            ok,
            message: ok ? '' : 'GL candidate and legacy did not agree.',
            frozenTime: FROZEN_TIME,
            shadeCompared: true,
            frozen: { animationSeconds: FROZEN_TIME, sweep: 0, samples: 1, casters: 0, lightMode: false },
            readback: { statistics: true, cubeFaces: true, tile: true, gasStatistics: false, inspect: false, cube512: true, mip128: true },
            source,
            gpu: gpuReport,
            worlds,
            shades,
            negativeControl: negative.report,
            cold,
            regina,
        });
    } catch (err) {
        publish({
            status: 'error',
            ok: false,
            message: err instanceof Error ? err.message : String(err),
            frozenTime: FROZEN_TIME,
            shadeCompared: false,
            frozen: { animationSeconds: FROZEN_TIME, sweep: 0, samples: 1, casters: 0, lightMode: false },
            readback: { statistics: true, cubeFaces: true, tile: true, gasStatistics: false, inspect: false, cube512: true, mip128: true },
            source,
            worlds,
            shades,
            negativeControl: negativeReport,
            cold: {
                progressiveFirstStepMs: coldMark.firstStepMs ?? 0,
                progressiveFirstStepDrainMs: coldMark.drainMs ?? 0,
                compileMs: 0,
                statsMs: 0,
                sizes: [],
                longestSliceMs: baker.longestSliceMs(),
                parityLongTasksMs: [],
                shadeLongTasksMs: [],
                sweepLongTasksMs: [],
                longestLongTaskMs: 0,
                parityTurns,
                shadeTurns,
            },
        });
    } finally {
        stopTasks();
        baker.dispose();
    }
}

const CHAR_KEY = '__surfaceGlChar';

type CharHit = { x: number; y: number; channel: number; delta: number };

type CharCase = {
    id: string;
    runs: number;
    differed: number;
    maxDelta: number;
    worstMismatches: number;
    example: { run: number; mismatches: number; maxDelta: number; hits: CharHit[] } | null;
};

function charHits(left: ArrayLike<number> | null, right: ArrayLike<number> | null, width: number): { mismatches: number; maxDelta: number; hits: CharHit[] } {
    if (left == null && right == null) return { mismatches: 0, maxDelta: 0, hits: [] };
    const cmp = compareBytes(left, right);
    const hits: CharHit[] = [];
    if (left && right && left.length === right.length) {
        const count = left.length;
        for (let i = 0; i < count && hits.length < 4; i++) {
            const delta = Math.abs((left[i] ?? 0) - (right[i] ?? 0));
            if (delta === 0) continue;
            const pixel = Math.floor(i / 4);
            hits.push({ x: width > 0 ? pixel % width : pixel, y: width > 0 ? Math.floor(pixel / width) : 0, channel: i % 4, delta });
        }
    }
    return { mismatches: cmp.mismatches, maxDelta: cmp.maxChannelError, hits };
}

function charNote(cases: Map<string, CharCase>, id: string, run: number, left: ArrayLike<number> | null, right: ArrayLike<number> | null, width: number): void {
    let row = cases.get(id);
    if (!row) {
        row = { id, runs: 0, differed: 0, maxDelta: 0, worstMismatches: 0, example: null };
        cases.set(id, row);
    }
    row.runs += 1;
    const diff = charHits(left, right, width);
    if (diff.maxDelta > row.maxDelta) row.maxDelta = diff.maxDelta;
    if (diff.mismatches > row.worstMismatches) row.worstMismatches = diff.mismatches;
    if (diff.mismatches !== 0) {
        row.differed += 1;
        if (!row.example) row.example = { run, mismatches: diff.mismatches, maxDelta: diff.maxDelta, hits: diff.hits };
    }
}

function charCube(cases: Map<string, CharCase>, id: string, run: number, left: CubeShot | null, right: CubeShot | null, width: number): void {
    if (!left || !right) {
        charNote(cases, id + ' missing', run, left ? new Uint8Array([1]) : null, right ? new Uint8Array([1]) : null, 1);
        return;
    }
    for (const layer of ['a', 'b'] as const) {
        for (let face = 0; face < 6; face++) {
            charNote(cases, id + ' ' + layer + face, run, left[layer][face] ?? null, right[layer][face] ?? null, width);
        }
    }
}

function shadeVariants(item: GlCase): { id: string; request: GlRequest }[] {
    const rows: { id: string; request: GlRequest }[] = [{ id: item.id + ' frozen', request: item.request }];
    if (item.id === 'Ocean') {
        rows.push(
            { id: 'Ocean tilt 0', request: { ...item.request, tilt: 0 } },
            { id: 'Ocean tilt 90', request: { ...item.request, tilt: 90 } },
            { id: 'Ocean tilt 120', request: { ...item.request, tilt: 120 } },
            { id: 'Ocean sweep 0', request: { ...item.request, sweep: 0, samples: 1 } },
            { id: 'Ocean sweep 0.5', request: { ...item.request, sweep: 0.5, samples: 16 } },
            { id: 'Ocean eclipse', request: { ...item.request, casters: [[1.8, 2.4, 1.2]] } },
            { id: 'Ocean light', request: { ...item.request, lightMode: true } },
            { id: 'Ocean radius 2.5', request: { ...item.request, radius: 2.5 } },
            { id: 'Ocean radius 1100', request: { ...item.request, radius: 1100 } },
        );
    }
    if (item.id === 'Ringed') {
        rows.push(
            { id: 'Ringed phase 0.75', request: { ...item.request, ring: { ...GL_RING, phase: 0.75 } } },
            { id: 'Ringed phase 0', request: { ...item.request, ring: { ...GL_RING, phase: 0 } } },
        );
    }
    return rows;
}

function loadRealm(frame: HTMLIFrameElement, token: string): Promise<RealmWindow> {
    return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => reject(new Error('realm load timed out')), 30000);
        frame.onload = () => {
            globalThis.clearTimeout(timer);
            const realm = frame.contentWindow as RealmWindow | null;
            if (!realm?.beginGl || !realm.stepGl || !realm.readGl || !realm.renderGl || !realm.readTileGl) {
                reject(new Error('GL realm is not loaded.'));
                return;
            }
            resolve(realm);
        };
        frame.src = REALM + '?fresh=' + token;
    });
}

async function shadeBaker(baker: DiscBaker, item: GlCase, request: GlRequest): Promise<{ pixels: Uint8Array; size: number }> {
    const id = discId(item);
    await waitReady(baker);
    let guard = 0;
    for (;;) {
        baker.renderBatch([toShade(item, request)]);
        if (!baker.jobPending(id)) {
            const pixels = baker.readTile(request.key);
            const placed = baker.tile(request.key);
            if (!pixels || !placed) throw new Error('tile missing ' + item.id);
            return { pixels, size: placed.size };
        }
        guard += 1;
        if (guard >= 12) throw new Error('shade bake did not finish ' + item.id);
        await frame();
    }
}

async function shadeRealm(realm: RealmWindow, item: GlCase, request: GlRequest): Promise<{ pixels: Uint8Array; size: number }> {
    let guard = 0;
    for (;;) {
        const pending = realm.renderGl!(request).pending;
        if (!pending) {
            const shot = realm.readTileGl!();
            const pixels = copyBytes(shot.pixels);
            if (!pixels) throw new Error('legacy tile missing ' + item.id);
            return { pixels, size: shot.size };
        }
        guard += 1;
        if (guard >= 12) throw new Error('legacy shade did not finish ' + item.id);
        await frame();
    }
}

function charQuery(): { runs: number; pairs: Array<'port' | 'legacy'> } | null {
    const params = new URLSearchParams(globalThis.location.search);
    if (!params.has('repeat')) return null;
    const runs = Math.max(1, Math.min(30, Number(params.get('repeat')) || 30));
    const pair = params.get('pair');
    if (pair === 'legacy') return { runs, pairs: ['legacy'] };
    if (pair === 'port') return { runs, pairs: ['port'] };
    return { runs, pairs: ['port', 'legacy'] };
}

async function characterise(runs: number, pairs: Array<'port' | 'legacy'>): Promise<void> {
    const startedAt = now();
    const pairReports: { pair: string; cases: CharCase[]; error?: string }[] = [];
    let gpu = '';
    try {
        for (const pair of pairs) {
            const cases = new Map<string, CharCase>();
            for (let run = 1; run <= runs; run++) {
                report.value = {
                    ...report.value,
                    status: 'running',
                    message: pair + ' run ' + run + ' of ' + runs,
                };
                publishAutomationResult(CHAR_KEY, {
                    status: 'running',
                    pair,
                    run,
                    runs,
                    elapsedMs: now() - startedAt,
                    pairs: pairReports,
                    cases: [...cases.values()],
                });
                const frameA = legacyFrame.value;
                const frameB = legacyFrameB.value;
                if (!frameA || (pair === 'legacy' && !frameB)) throw new Error('realm frame missing');
                const realmA = await loadRealm(frameA, pair + '-a-' + run);
                const realmB = pair === 'legacy' && frameB ? await loadRealm(frameB, pair + '-b-' + run) : null;
                const baker = pair === 'port' ? createDiscBaker() : null;
                const turns: SlowTurn[] = [];
                try {
                    for (const item of [...GL_CASES, NEGATIVE_CASE]) {
                        const left = baker ? await renderPort(baker, item, { firstStepMs: null, drainMs: null }, run === 1 ? turns : []) : await renderLegacy(item, [], realmB as RealmWindow);
                        const right = await renderLegacy(item, [], realmA);
                        if (!gpu) gpu = left.gpu.unmaskedRenderer || left.gpu.renderer;
                        charNote(cases, item.id + ' stats', run, left.stats, right.stats, 128);
                        charCube(cases, item.id + ' cube32', run, left.cube32, right.cube32, 32);
                        charCube(cases, item.id + ' cube128', run, left.cube128, right.cube128, 128);
                        charCube(cases, item.id + ' mip128', run, left.mip128, right.mip128, 64);
                        if (item.id === 'Ocean') charCube(cases, item.id + ' cube512', run, left.cube512, right.cube512, 512);
                        for (const variant of shadeVariants(item)) {
                            const shadedLeft = baker ? await shadeBaker(baker, item, variant.request) : await shadeRealm(realmB as RealmWindow, item, variant.request);
                            const shadedRight = await shadeRealm(realmA, item, variant.request);
                            charNote(cases, variant.id + ' tile', run, shadedLeft.pixels, shadedRight.pixels, shadedLeft.size);
                        }
                    }
                    if (run === 1) {
                        publishAutomationResult(CHAR_KEY, {
                            status: 'running',
                            pair,
                            run,
                            runs,
                            firstTurns: turns,
                            elapsedMs: now() - startedAt,
                            cases: [...cases.values()],
                        });
                    }
                } finally {
                    baker?.dispose();
                }
            }
            pairReports.push({ pair, cases: [...cases.values()] });
        }
        const differed = pairReports.some((row) => row.cases.some((item) => item.differed > 0));
        publishAutomationResult(CHAR_KEY, {
            status: 'done',
            ok: !differed,
            gpu,
            runs,
            elapsedMs: now() - startedAt,
            pairs: pairReports,
        });
        report.value = { ...report.value, status: 'done', ok: !differed, message: differed ? 'bytes differed' : 'no byte differed' };
    } catch (err) {
        publishAutomationResult(CHAR_KEY, {
            status: 'error',
            ok: false,
            message: err instanceof Error ? err.message : String(err),
            gpu,
            runs,
            elapsedMs: now() - startedAt,
            pairs: pairReports,
        });
        report.value = { ...report.value, status: 'error', ok: false, message: err instanceof Error ? err.message : String(err) };
    }
}

async function probe(): Promise<void> {
    const tasks: { ms: number; at: string }[] = [];
    let phase = 'setup';
    const stop = observeLongTasks((duration) => tasks.push({ ms: duration, at: phase }));
    const baker = createDiscBaker();
    const ocean = GL_CASES[0];
    const ringed = GL_CASES.find((item) => item.id === 'Ringed');
    try {
        if (!ocean || !ringed) throw new Error('probe cases missing');
        const frameA = legacyFrame.value;
        if (!frameA) throw new Error('realm frame missing');
        phase = 'first step';
        const cold = { firstStepMs: null as number | null, drainMs: null as number | null };
        const turns: SlowTurn[] = [];
        const shot = await renderPort(baker, ocean, cold, turns);
        const firstSpans = turns[0] ?? null;
        phase = 'shade';
        const shadeTurns: SlowTurn[] = [];
        await renderLegacy(ringed, shadeTurns);
        await compareShade(baker, ringed, ringed.request, 'Ringed frozen', shadeTurns);
        await renderLegacy(ocean, shadeTurns);
        await compareShade(baker, ocean, { ...ocean.request, radius: 1100 }, 'Ocean radius 1100', shadeTurns);
        publishAutomationResult('__surfaceGlProbe', {
            status: 'done',
            firstStepMs: cold.firstStepMs,
            drainMs: cold.drainMs,
            firstSpans,
            turns,
            shadeTurns,
            tasks,
            gpu: shot.gpu.unmaskedRenderer || shot.gpu.renderer,
        });
    } catch (err) {
        publishAutomationResult('__surfaceGlProbe', {
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
            tasks,
            phase,
        });
    } finally {
        stop();
        baker.dispose();
    }
}

type ColdTasks = { ms: number; call: string }[];

async function shadeRequests(url: string): Promise<{ hexId: string; requests: ShadeRequest[] }> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(url + ' was not served');
    const payload = await response.json() as { hexId: string; system: { worlds?: Record<string, unknown>[] } };
    const requests: ShadeRequest[] = [];
    const hexId = payload.hexId || '1910';
    const consider = (body: Record<string, unknown>, basePx: number, near: number): void => {
        if (body.type === 'Empty') return;
        const kind = surfaceKind(body);
        if (!kind || kind === 'star' || kind === 'belt' || kind === 'ring') return;
        if (basePx < 2.5) return;
        const profile = surfaceProfile(body, legacyDiscId(hexId, body, kind)) as ShadeRequest['profile'] & {
            rotation: { tilt: number; locked: boolean };
        };
        const moons = (body.moons as { size?: string; type?: string }[] | undefined) || [];
        const ringCount = ((body.rings as unknown[]) || []).length + moons.filter((moon) => moon.size === 'R').length;
        let ring: ShadeRequest['ring'] = null;
        if (ringCount > 0) {
            const outer = Math.max(1.4, Math.min(2.05, 1.6 + 0.2 * Math.min(ringCount, 4)));
            ring = { inner: 1.22, outer, fill: Math.min(1, 0.55 + ringCount * 0.15), phase: 0, detail: 1 };
        }
        const reachFactor = Math.max(1.16, ring ? ring.outer * 1.01 : 0);
        const scale = Math.min(1, 1100 / basePx, 2000 / (basePx * reachFactor));
        const locked = !!profile.rotation?.locked;
        requests.push({
            key: profile.id,
            profile,
            radius: basePx * scale,
            spin: 0,
            cloudSpin: 0,
            sweep: 0,
            samples: 1,
            ring,
            tilt: locked ? 0 : profile.rotation.tilt,
            light: [1, 0],
            sun: [1, 0.96, 0.9],
            casters: [],
            lightMode: false,
            scale,
            near,
            uTime: FROZEN_TIME,
        });
    };
    let near = 0;
    for (const world of payload.system.worlds || []) {
        consider(world, worldBasePx(world as never), near);
        near += 1;
        const moons = (world.moons as Record<string, unknown>[] | undefined) || [];
        for (const moon of moons) {
            consider(moon, moonBasePx(moon as never), near);
            near += 1;
        }
    }
    return { hexId, requests };
}

async function coldOne(url: string): Promise<Record<string, unknown>> {
    const tasks: ColdTasks = [];
    let call = 'setup';
    const stop = observeLongTasks((ms) => {
        if (ms >= 50) tasks.push({ ms, call });
    }, false);
    const baker = createDiscBaker();
    for (const span of baker.takeSpans()) {
        if (span.ms >= 50) tasks.push({ ms: span.ms, call: span.name });
    }
    try {
        const loaded = await shadeRequests(url);
        const requests = loaded.requests;
        const started = now();
        let firstLitMs: number | null = null;
        let fullMs: number | null = null;
        for (let guard = 0; guard < 900; guard++) {
            call = baker.ready() ? 'renderBatch' : 'pump';
            baker.pump();
            for (const span of baker.takeSpans()) {
                if (span.ms >= 50) tasks.push({ ms: span.ms, call: span.name });
            }
            if (baker.ready()) {
                call = 'renderBatch';
                baker.renderBatch(requests);
                for (const span of baker.takeSpans()) {
                    if (span.ms >= 50) tasks.push({ ms: span.ms, call: span.name });
                }
                if (firstLitMs == null && requests.some((item) => baker.tile(item.key))) firstLitMs = now() - started;
                const full = requests.every((item) => baker.hasCube(item.profile.id, cubeSizeFor(item.radius)));
                if (full) {
                    fullMs = now() - started;
                    break;
                }
            }
            await frame();
        }
        call = 'steady renderBatch';
        const clocked = requests.map((item) => ({ ...item, uTime: item.uTime + 1 }));
        baker.takeSpans();
        const steadyStarted = now();
        baker.renderBatch(clocked);
        const steadyMs = now() - steadyStarted;
        for (const span of baker.takeSpans()) {
            if (span.ms >= 50) tasks.push({ ms: span.ms, call: span.name });
        }
        call = 'context loss';
        const lost = baker.loseForTest();
        await frame();
        const unavailable = baker.lost() && !baker.ready();
        const restored = baker.restoreForTest();
        let rebuilt = false;
        for (let guard = 0; guard < 300 && !baker.ready(); guard++) {
            call = 'restore pump';
            baker.pump();
            for (const span of baker.takeSpans()) {
                if (span.ms >= 50) tasks.push({ ms: span.ms, call: span.name });
            }
            await frame();
        }
        rebuilt = baker.ready();
        call = 'restore renderBatch';
        if (rebuilt) {
            for (let guard = 0; guard < 8 && !requests.some((item) => baker.tile(item.key)); guard++) {
                baker.renderBatch(requests);
                for (const span of baker.takeSpans()) {
                    if (span.ms >= 50) tasks.push({ ms: span.ms, call: span.name });
                }
                await frame();
            }
        }
        const drew = rebuilt && requests.some((item) => baker.tile(item.key));
        return {
            hexId: loaded.hexId,
            bodies: requests.length,
            firstLitMs,
            fullMs,
            steadyMs,
            tasks,
            linkCosts: baker.costs(),
            loss: { lost, unavailable, restored, rebuilt, drew },
            gpu: '',
        };
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err), tasks };
    } finally {
        stop();
        baker.dispose();
    }
}

async function stallMeasure(): Promise<void> {
    try {
        const item = GL_CASES[0];
        if (!item) throw new Error('no ocean case');
        const profile = profileFor(item, discId(item));
        const mode = new URLSearchParams(globalThis.location.search).get('stall') || 'both';
        let statsSpans: { name: string; ms: number }[] = [];
        let skipped: { name: string; ms: number }[] = [];
        let warmup: { name: string; ms: number }[] = [];
        let afterWarmup: { name: string; ms: number }[] = [];
        if (mode !== 'warm') {
            const freshSkip = createDiscBaker();
            await waitReady(freshSkip);
            freshSkip.prepare(profile, FROZEN_TIME);
            statsSpans = freshSkip.takeSpans().filter((span) => span.ms >= 1);
            skipped = freshSkip.stallProbe(profile, 32, true);
            freshSkip.dispose();
        }
        if (mode !== 'skip') {
            const freshWarm = createDiscBaker();
            await waitReady(freshWarm);
            freshWarm.prepare(profile, FROZEN_TIME);
            freshWarm.takeSpans();
            warmup = freshWarm.stallProbe(profile, 1, false);
            afterWarmup = freshWarm.stallProbe(profile, 32, false);
            freshWarm.dispose();
        }
        publishAutomationResult('__surfaceGlStall', {
            status: 'done',
            mode,
            userAgent: navigator.userAgent,
            statsSpans,
            skipped,
            warmup,
            afterWarmup,
        });
    } catch (err) {
        publishAutomationResult('__surfaceGlStall', {
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
        });
    }
}

async function coldMeasure(): Promise<void> {
    const regina = await coldOne('/dev/surface-parity/gl/regina.json');
    const zeycude = await coldOne('/dev/surface-parity/gl/zeycude.json');
    publishAutomationResult('__surfaceGlCold', {
        status: regina.error || zeycude.error ? 'error' : 'done',
        regina,
        zeycude,
    });
    report.value = {
        ...report.value,
        status: regina.error || zeycude.error ? 'error' : 'done',
        message: String(regina.error || zeycude.error || 'cold measured'),
    };
}

function onRealmLoad(): void {
    if (started) return;
    started = true;
    const params = new URLSearchParams(globalThis.location.search);
    const query = charQuery();
    if (query) void characterise(query.runs, query.pairs);
    else if (params.has('probe')) void probe();
    else if (params.has('stall')) void stallMeasure();
    else if (params.has('cold')) void coldMeasure();
    else void run();
}

function statLine(world: WorldReport): string {
    if ('absent' in world.stats) return 'stats absent';
    return 'stats mismatches ' + world.stats.mismatches;
}

publish(report.value);
</script>

<template>
  <main class="parity">
    <h1>Surface GL parity</h1>
    <p v-if="report.status === 'running'">Baking the port against the legacy GL realm.</p>
    <p v-else-if="report.status === 'error'">{{ report.message }}</p>
    <p v-else>{{ report.ok ? 'Match' : 'Mismatch' }}</p>
    <p v-if="report.gpu">{{ report.gpu.unmaskedRenderer || report.gpu.renderer }} ({{ report.gpu.backend }}).</p>
    <section v-for="world in report.worlds" :key="world.id">
      <h2>{{ world.id }}</h2>
      <p>{{ world.kind }}. {{ statLine(world) }}. Cube 32 mismatches {{ world.cube32.mismatches }}. Cube 128 mismatches {{ world.cube128.mismatches }}. Mip 1 mismatches {{ world.mip128.mismatches }}. {{ world.cube512 ? 'Cube 512 mismatches ' + world.cube512.mismatches + '.' : '' }} Tile {{ world.tile.compared ? world.tile.mismatches : 'skipped' }}. {{ world.problems.join(', ') }}</p>
    </section>
    <section v-if="report.negativeControl">
      <h2>Negative control</h2>
      <p>Cube 32 against ocean {{ report.negativeControl.againstOceanCube32Mismatches }}. Realm mismatches {{ report.negativeControl.cube32.mismatches }}. {{ report.negativeControl.problems.join(', ') }}</p>
    </section>
    <section v-for="shade in report.shades || []" :key="shade.id">
      <h2>{{ shade.id }}</h2>
      <p>Tile mismatches {{ shade.mismatches }}. Max {{ shade.maxChannelError }}. Mean {{ shade.meanChannelError }}. {{ shade.problems.join(', ') }}</p>
    </section>
    <section v-if="report.regina">
      <h2>Regina batch</h2>
      <p>Bodies {{ report.regina.bodies }}. Wall {{ report.regina.wallMs }}. Drain {{ report.regina.drainMs }}. {{ report.regina.error || report.regina.radiusModel }}</p>
    </section>
    <section v-if="report.cold">
      <h2>Cold bake</h2>
      <p>First step {{ report.cold.progressiveFirstStepMs }} . Drain {{ report.cold.progressiveFirstStepDrainMs }} . Compile {{ report.cold.compileMs }} . Stats {{ report.cold.statsMs }} . Longest task {{ report.cold.longestLongTaskMs }} . Longest slice {{ report.cold.longestSliceMs }} .</p>
      <p v-for="size in report.cold.sizes" :key="size.size">Size {{ size.size }} {{ size.ms }} max face {{ size.maxFaceMs }} .</p>
    </section>
    <div class="realms">
      <iframe ref="legacyFrame" title="Legacy GL realm" :src="REALM" @load="onRealmLoad"></iframe>
      <iframe ref="legacyFrameB" title="Legacy GL realm B"></iframe>
    </div>
  </main>
</template>

<style scoped>
.parity {
  color: var(--text-1);
  background: var(--bg-0);
  padding: 1rem;
}
.parity h1,
.parity h2,
.parity p {
  font: 1rem/1.4 var(--font-ui, sans-serif);
}
.realms {
  position: absolute;
  left: -4000px;
  top: 0;
  width: 1024px;
  height: 1024px;
}
.realms iframe {
  width: 1024px;
  height: 1024px;
  border: 0;
}
</style>

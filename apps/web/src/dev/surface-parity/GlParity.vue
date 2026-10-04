<script setup lang="ts">
import { ref } from 'vue';
import { createCanvas, nextFrame, observeLongTasks, publishAutomationResult } from '../../platform/browser.ts';
import { legacyDiscId } from '../../surface/identity.ts';
import { surfaceKind, surfaceProfile } from '../../surface/profile.ts';
import { cubeSizeFor, SIZES, type BakeProfile } from '../../surface/vanilla/gl_bake.ts';
import { createDiscBaker, type DiscBaker, type DiscCapture, type PublicThresholds } from '../../surface/vanilla/gl.ts';
import { anyByte, backendOf, compareBytes, copyBytes, rgbaVaried, uniformZero, type ChannelCompare } from './gl_bytes.ts';
import { FROZEN_TIME, GL_CASES, NEGATIVE_CASE, STATS_BYTES, type GlCase } from './gl_worlds.ts';

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
    tile: { compared: false };
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

type ColdReport = {
    progressiveFirstStepMs: number;
    progressiveFirstStepDrainMs: number;
    compileMs: number;
    statsMs: number;
    sizes: { size: number; ms: number; maxFaceMs: number }[];
    longestSliceMs: number;
    parityLongTasksMs: number[];
    sweepLongTasksMs: number[];
    longestLongTaskMs: number;
};

type GlReport = {
    status: 'running' | 'done' | 'error';
    ok: boolean;
    message?: string;
    frozenTime: number;
    shadeCompared: false;
    frozen: { animationSeconds: number; sweep: number; samples: number; casters: number; lightMode: boolean };
    readback: { statistics: boolean; cubeFaces: boolean; tile: boolean; gasStatistics: boolean; inspect: false; cube512: boolean; mip128: boolean };
    source?: SourceManifest;
    gpu?: GpuInfo & { backend: string; userAgent: string };
    worlds: WorldReport[];
    negativeControl?: WorldReport;
    cold?: ColdReport;
};

const legacyFrame = ref<HTMLIFrameElement | null>(null);
const report = ref<GlReport>({
    status: 'running',
    ok: false,
    frozenTime: FROZEN_TIME,
    shadeCompared: false,
    frozen: { animationSeconds: FROZEN_TIME, sweep: 0, samples: 1, casters: 0, lightMode: false },
    readback: { statistics: true, cubeFaces: true, tile: false, gasStatistics: false, inspect: false, cube512: true, mip128: true },
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
    if (!realm?.beginGl || !realm.stepGl || !realm.readGl) throw new Error('GL realm is not loaded.');
    return realm;
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

async function renderPort(baker: DiscBaker, item: GlCase, cold: { firstStepMs: number | null; drainMs: number | null }): Promise<GlShot> {
    const id = discId(item);
    const profile = profileFor(item, id);
    baker.clear();
    const radii = item.id === 'Ocean' ? [item.request.radius, RADIUS_512] : [item.request.radius];
    for (const radius of radii) {
        let guard = 0;
        for (;;) {
            const ms = baker.step(profile, radius, item.request.frozenTime);
            if (cold.firstStepMs == null) {
                cold.firstStepMs = ms;
                cold.drainMs = baker.sync();
            }
            guard += 1;
            if (!baker.jobPending(profile.id)) break;
            if (guard >= 12) throw new Error('port bake did not finish');
            await frame();
        }
    }
    if (!baker.hasCube(id, 32) || !baker.hasCube(id, 128)) throw new Error('port cubes 32 and 128 were not finished');
    if (item.id === 'Ocean' && !baker.hasCube(id, 512)) throw new Error('port cube 512 was not finished');
    return portShot(baker.capture(id), JSON.stringify(profile));
}

async function renderLegacy(item: GlCase): Promise<GlShot> {
    const realm = realmOf();
    const id = discId(item);
    const begun = realm.beginGl!(item.body, id, item.request);
    if (begun.error) throw new Error(begun.error);
    const radii = item.id === 'Ocean' ? [item.request.radius, RADIUS_512] : [item.request.radius];
    for (const radius of radii) {
        let guard = 0;
        for (;;) {
            const pending = realm.stepGl!(radius).pending;
            guard += 1;
            if (!pending) break;
            if (guard >= 12) throw new Error('legacy bake did not finish');
            await frame();
        }
    }
    const shot = realm.readGl!();
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

async function measureSizes(profile: BakeProfile): Promise<{ compileMs: number; statsMs: number; sizes: ColdReport['sizes']; longestSliceMs: number }> {
    const baker = createDiscBaker();
    try {
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

async function run(): Promise<void> {
    const longTasks: number[] = [];
    const stopTasks = observeLongTasks((duration) => longTasks.push(duration));
    const baker = createDiscBaker();
    const coldMark = { firstStepMs: null as number | null, drainMs: null as number | null };
    try {
        if (cubeSizeFor(RADIUS_512) !== 512) throw new Error('radius 400 does not select cube 512');
        const response = await fetch('/dev/surface-parity/gl/manifest.json');
        if (!response.ok) throw new Error('GL source manifest was not served.');
        const source = await response.json() as SourceManifest;
        await frame();
        let oceanCube: CubeCopy | null = null;
        let gpu: GpuInfo | null = null;
        const worlds: WorldReport[] = [];
        for (const item of GL_CASES) {
            const port = await renderPort(baker, item, coldMark);
            await frame();
            const legacy = await renderLegacy(item);
            if (!gpu) gpu = port.gpu;
            const described = await describe(item, port, legacy, null);
            worlds.push(described.report);
            if (item.id === 'Ocean') oceanCube = described.cube32;
            await frame();
        }
        const altPort = await renderPort(baker, NEGATIVE_CASE, coldMark);
        await frame();
        const altLegacy = await renderLegacy(NEGATIVE_CASE);
        const negative = await describe(NEGATIVE_CASE, altPort, altLegacy, oceanCube);
        if (!(negative.report.againstOceanCube32Mismatches && negative.report.againstOceanCube32Mismatches > 0)) {
            negative.report.problems.push('negative matched the ocean cube');
        }
        await frame();
        const parityTaskCount = longTasks.length;
        const measured = await measureSizes(profileFor(GL_CASES[0]!, discId(GL_CASES[0]!)));
        await frame();
        const renderer = gpu ? (gpu.unmaskedRenderer || gpu.renderer) : '';
        const gpuReport = gpu ? { ...gpu, backend: backendOf(renderer), userAgent: navigator.userAgent } : undefined;
        const worldsOk = worlds.every((item) => item.problems.length === 0);
        const negativeOk = negative.report.problems.length === 0;
        const ok = worldsOk && negativeOk && renderer.trim() !== '';
        const sweepLongTasksMs = longTasks.slice(parityTaskCount);
        const parityLongTasksMs = longTasks.slice(0, parityTaskCount);
        const longestLongTaskMs = longTasks.reduce((max, duration) => Math.max(max, duration), 0);
        const cold: ColdReport = {
            progressiveFirstStepMs: coldMark.firstStepMs ?? 0,
            progressiveFirstStepDrainMs: coldMark.drainMs ?? 0,
            compileMs: measured.compileMs,
            statsMs: measured.statsMs,
            sizes: measured.sizes,
            longestSliceMs: Math.max(baker.longestSliceMs(), measured.longestSliceMs),
            parityLongTasksMs,
            sweepLongTasksMs,
            longestLongTaskMs,
        };
        publish({
            status: 'done',
            ok,
            message: ok ? '' : 'GL candidate and legacy did not agree.',
            frozenTime: FROZEN_TIME,
            shadeCompared: false,
            frozen: { animationSeconds: FROZEN_TIME, sweep: 0, samples: 1, casters: 0, lightMode: false },
            readback: { statistics: true, cubeFaces: true, tile: false, gasStatistics: false, inspect: false, cube512: true, mip128: true },
            source,
            gpu: gpuReport,
            worlds,
            negativeControl: negative.report,
            cold,
        });
    } catch (err) {
        publish({
            status: 'error',
            ok: false,
            message: err instanceof Error ? err.message : String(err),
            frozenTime: FROZEN_TIME,
            shadeCompared: false,
            frozen: { animationSeconds: FROZEN_TIME, sweep: 0, samples: 1, casters: 0, lightMode: false },
            readback: { statistics: true, cubeFaces: true, tile: false, gasStatistics: false, inspect: false, cube512: true, mip128: true },
            worlds: [],
        });
    } finally {
        stopTasks();
        baker.dispose();
    }
}

function onRealmLoad(): void {
    if (started) return;
    started = true;
    void run();
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
      <p>{{ world.kind }}. {{ statLine(world) }}. Cube 32 mismatches {{ world.cube32.mismatches }}. Cube 128 mismatches {{ world.cube128.mismatches }}. Mip 1 mismatches {{ world.mip128.mismatches }}. {{ world.cube512 ? 'Cube 512 mismatches ' + world.cube512.mismatches + '.' : '' }} {{ world.problems.join(', ') }}</p>
    </section>
    <section v-if="report.negativeControl">
      <h2>Negative control</h2>
      <p>Cube 32 against ocean {{ report.negativeControl.againstOceanCube32Mismatches }}. Realm mismatches {{ report.negativeControl.cube32.mismatches }}. {{ report.negativeControl.problems.join(', ') }}</p>
    </section>
    <section v-if="report.cold">
      <h2>Cold bake</h2>
      <p>First step {{ report.cold.progressiveFirstStepMs }} . Drain {{ report.cold.progressiveFirstStepDrainMs }} . Compile {{ report.cold.compileMs }} . Stats {{ report.cold.statsMs }} . Longest task {{ report.cold.longestLongTaskMs }} . Longest slice {{ report.cold.longestSliceMs }} .</p>
      <p v-for="size in report.cold.sizes" :key="size.size">Size {{ size.size }} {{ size.ms }} max face {{ size.maxFaceMs }} .</p>
    </section>
    <div class="realms">
      <iframe ref="legacyFrame" title="Legacy GL realm" :src="REALM" @load="onRealmLoad"></iframe>
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

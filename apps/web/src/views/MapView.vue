<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { TruthManifest, TruthOverview } from '@voyage/shared';
import { fit, flight, SHORT_HOP, toWorld, zoomAt, type Camera, type Viewport } from '../map/camera.ts';
import { hexAt } from '../map/geometry.ts';
import { attachInput, type InputWhy } from '../map/input.ts';
import { MapRenderer } from '../map/MapRenderer.ts';
import { homeRect, targetFor } from '../map/routes.ts';
import { readMotion, readTheme } from '../map/theme.ts';
import { TruthClient } from '../map/truth_client.ts';
import {
    cancelFrame,
    devicePixelRatio,
    nextFrame,
    now,
    onDevicePixelRatioChange,
    pageOrigin,
    prefersReducedMotion,
} from '../platform/browser.ts';

const route = useRoute();
const router = useRouter();
const canvasEl = ref<HTMLCanvasElement | null>(null);
const status = ref('Loading the chart.');

let cam: Camera = { x: 0, y: 0, ppp: 1 };
let chart: TruthManifest | null = null;
let version = '';
let overviewReady = false;
let renderer: MapRenderer | null = null;
let detachInput: (() => void) | null = null;
let stopDpr: (() => void) | null = null;
let observer: ResizeObserver | null = null;
let raf = 0;
let dirty = false;
let fly: { from: Camera; to: Camera; start: number; dur: number } | null = null;
let queryFrame = 0;
let pendingApply = false;
let sawQuery = false;
let fallbackNote = '';
let keepNote = false;
const pendingIndexes = new Set<string>();

const client = new TruthClient({
    cdnBase: import.meta.env.VITE_CDN_BASE || 'https://cdn.traveller.voyage',
    apiBase: pageOrigin(),
    fetch,
});

function viewport(): Viewport {
    const el = canvasEl.value;
    return { width: el ? el.clientWidth : 0, height: el ? el.clientHeight : 0 };
}

function showStatus(): void {
    if (fallbackNote) status.value = fallbackNote;
    else if (!version) status.value = 'Loading the chart.';
    else if (!overviewReady) status.value = 'Loading the overview.';
    else if (pendingIndexes.size > 0) status.value = 'Loading ' + pendingIndexes.size + ' sector indexes.';
    else status.value = '';
}

function markDirty(): void {
    dirty = true;
    if (!raf) raf = nextFrame(frame);
}

function frame(): void {
    raf = 0;
    if (fly) {
        const t = fly.dur > 0 ? (now() - fly.start) / fly.dur : 1;
        if (t >= 1) {
            cam = fly.to;
            fly = null;
        } else {
            cam = flight(fly.from, fly.to, t);
        }
        dirty = true;
        scheduleQuery();
    }
    if (!dirty) return;
    dirty = false;
    if (renderer) {
        const drawn = renderer.draw(cam);
        if (drawn.tier === 'hex' && version) requestIndexes(drawn.sectorsOnScreen);
    }
    if (fly) {
        dirty = true;
        raf = nextFrame(frame);
    }
}

function requestIndexes(slugs: string[]): void {
    const missing: string[] = [];
    for (const slug of slugs) {
        if (client.index(version, slug)) continue;
        missing.push(slug);
        pendingIndexes.add(slug);
    }
    if (missing.length) client.want(version, missing);
    showStatus();
}

function scheduleQuery(): void {
    const el = canvasEl.value;
    if (!el) return;
    if (queryFrame) cancelFrame(queryFrame);
    const wait = readMotion(el).tBase * 1000;
    const start = now();
    const tick = () => {
        queryFrame = 0;
        if (now() - start < wait) {
            queryFrame = nextFrame(tick);
            return;
        }
        const x = cam.x.toFixed(3);
        const y = cam.y.toFixed(3);
        const z = cam.ppp.toFixed(3);
        if (route.query.x === x && route.query.y === y && route.query.z === z) return;
        void router.replace({ path: route.path, query: { x, y, z } });
    };
    queryFrame = nextFrame(tick);
}

function flyTo(target: Camera): void {
    const el = canvasEl.value;
    if (!el || prefersReducedMotion()) {
        cam = target;
        markDirty();
        scheduleQuery();
        return;
    }
    const dist = Math.hypot(target.x - cam.x, target.y - cam.y);
    const motion = readMotion(el);
    const dur = (dist <= SHORT_HOP ? motion.tSlow : motion.tLong) * 1000;
    fly = { from: { x: cam.x, y: cam.y, ppp: cam.ppp }, to: target, start: now(), dur };
    markDirty();
}

function queryNumber(value: unknown): number | null {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function cameraFromQuery(): Camera | null {
    const x = queryNumber(route.query.x);
    const y = queryNumber(route.query.y);
    const z = queryNumber(route.query.z);
    if (x === null || y === null || z === null) return null;
    const vp = viewport();
    if (!(vp.width > 0) || !(vp.height > 0)) return { x, y, ppp: z };
    return zoomAt({ x, y, ppp: z }, vp, vp.width / 2, vp.height / 2, 1);
}

function applyRoute(): void {
    if (!chart) return;
    const vp = viewport();
    if (!(vp.width > 0) || !(vp.height > 0)) {
        pendingApply = true;
        return;
    }
    pendingApply = false;
    const target = targetFor({ path: route.path }, chart);
    if (target.kind === 'unknown') {
        fallbackNote = target.message;
        showStatus();
        if (route.path !== '/') {
            keepNote = true;
            void router.replace('/');
        }
        return;
    }
    if (keepNote) keepNote = false;
    else fallbackNote = '';
    showStatus();
    if (target.kind === 'account' || target.kind === 'design') return;
    const queried = cameraFromQuery();
    if (queried && !sawQuery) {
        sawQuery = true;
        fly = null;
        cam = queried;
        markDirty();
        return;
    }
    if (target.kind === 'fit') flyTo(fit(target.rect, vp, 0));
    else if (target.kind === 'camera') flyTo(target.camera);
}

function onResize(): void {
    const el = canvasEl.value;
    if (!el || !renderer) return;
    renderer.resize(el.clientWidth, el.clientHeight, devicePixelRatio());
    if (pendingApply) applyRoute();
    markDirty();
}

async function boot(): Promise<void> {
    try {
        version = await client.currentVersion();
        const manifestPromise = client.manifest(version);
        const overviewPromise = client.overview(version);
        const manifest = await manifestPromise;
        chart = manifest;
        const empty: TruthOverview = { truthVersion: version, sectors: [] };
        if (renderer) renderer.setChart(manifest, empty, 'canonical');
        showStatus();
        applyRoute();
        markDirty();
        const overview = await overviewPromise;
        overviewReady = true;
        if (renderer) renderer.setChart(manifest, overview, 'canonical');
        showStatus();
        markDirty();
    } catch (err) {
        status.value = err instanceof Error ? err.message : 'The chart could not be loaded.';
    }
}

onMounted(() => {
    const el = canvasEl.value;
    if (!el) return;
    renderer = new MapRenderer(el, readTheme(el));
    renderer.setIndexSource((slug) => (version ? client.index(version, slug) : null));
    observer = new ResizeObserver(() => onResize());
    observer.observe(el);
    stopDpr = onDevicePixelRatioChange(() => onResize());
    client.onArrive((slug) => {
        pendingIndexes.delete(slug);
        showStatus();
        markDirty();
    });
    detachInput = attachInput(el, {
        getCamera: () => cam,
        getViewport: viewport,
        setCamera: (next: Camera, why: InputWhy) => {
            fly = null;
            cam = next;
            if (why) {
                markDirty();
                scheduleQuery();
            }
        },
        click: (sx, sy) => {
            const world = toWorld(cam, viewport(), sx, sy);
            hexAt(world.x, world.y);
        },
        home: () => {
            const rect = chart ? homeRect(chart) : null;
            const vp = viewport();
            return rect && vp.width > 0 && vp.height > 0 ? fit(rect, vp, 0) : cam;
        },
    });
    el.focus();
    void boot();
});

watch(() => route.path, () => {
    sawQuery = false;
    applyRoute();
});

onBeforeUnmount(() => {
    if (raf) cancelFrame(raf);
    if (queryFrame) cancelFrame(queryFrame);
    if (detachInput) detachInput();
    if (stopDpr) stopDpr();
    if (observer) observer.disconnect();
});
</script>

<template>
  <div class="map">
    <canvas ref="canvasEl" tabindex="0"></canvas>
    <p class="status" aria-live="polite">{{ status }}</p>
  </div>
</template>

<style>
.map {
  position: fixed;
  inset: 0;
  background: var(--bg-0);
}
.map canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
.map canvas:focus {
  outline: 1px solid var(--signal);
  outline-offset: -1px;
}
.map .status {
  position: absolute;
  left: var(--sp-3);
  bottom: var(--sp-3);
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-text);
  font-size: 12px;
  pointer-events: none;
}
</style>

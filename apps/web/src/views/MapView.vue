<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex, SectorIndex, TreeEnvelope, TruthManifest, TruthOverview } from '@voyage/shared';
import { fit, flight, SHORT_HOP, toWorld, zoomAt, type Camera, type Viewport } from '../map/camera.ts';
import { formatHex, fromGlobal, hexAt, parseHex, SECTOR_ROWS } from '../map/geometry.ts';
import { attachInput, type InputWhy } from '../map/input.ts';
import { MapRenderer } from '../map/MapRenderer.ts';
import { dossierRoute, homeRect, targetFor, type DossierRoute } from '../map/routes.ts';
import { readMotion, readTheme } from '../map/theme.ts';
import { tierFor } from '../map/tiers.ts';
import { TruthClient } from '../map/truth_client.ts';
import OmniBox from '../components/OmniBox.vue';
import DossierPanel from '../dossier/DossierPanel.vue';
import { bodyKeys, pickSystem, type AllegianceName } from '../dossier/model.ts';
import { handleKey, registerCommand, systemPanel, type PanelWorld } from '../shell/registry.ts';
import { orbitPath } from '../orbit/bodies.ts';
import { escapeAction } from '../shell/panel_state.ts';
import Rail from '../shell/Rail.vue';
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
const dossierEl = ref<{ remeasure: () => void } | null>(null);
const status = ref('Loading the chart.');
const versionRef = ref('');
const manifestRef = ref<TruthManifest | null>(null);
const omniOpen = ref(false);
const treeRef = ref<TreeEnvelope | null>(null);
const treeError = ref(false);
const pendingSector = ref(false);
const missingHex = ref(false);
const dossierTick = ref(0);

let cam: Camera = { x: 0, y: 0, ppp: 1 };
let chart: TruthManifest | null = null;
let overview: TruthOverview | null = null;
let version = '';
let overviewReady = false;
let selected: { slug: string; hhhh: string } | null = null;
/** Last world opened this session. Survives closing the panel. */
let remembered: PanelWorld | null = null;
let suppressFly = false;
let renderer: MapRenderer | null = null;
let detachInput: (() => void) | null = null;
let unregisterHome: (() => void) | null = null;
let unregisterAccount: (() => void) | null = null;
let unregisterClose: (() => void) | null = null;
let unregisterSystem: (() => void) | null = null;
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
let treeGen = 0;
let loadedHex = '';
let lastPlace = '';
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

function selectionLine(): string {
    if (!selected || !chart || !version) return '';
    const index = client.index(version, selected.slug);
    if (!index) return '';
    const row = index.hexes[selected.hhhh];
    if (!row) return '';
    let sectorName = selected.slug;
    for (const sector of chart.sectors) if (sector.slug === selected.slug) sectorName = sector.name;
    return row.name + ' · ' + sectorName + ' ' + selected.hhhh + ' · ' + row.uwp;
}

function showStatus(): void {
    if (fallbackNote) status.value = fallbackNote;
    else if (!version) status.value = 'Loading the chart.';
    else if (!overviewReady) status.value = 'Loading the overview.';
    else if (pendingIndexes.size > 0) status.value = 'Loading ' + pendingIndexes.size + ' sector indexes.';
    else status.value = selectionLine();
}

const dossier = computed(() => dossierRoute(route.path));

function syncSelection(): void {
    const state = dossier.value;
    if (state.kind === 'overview' || state.kind === 'body') {
        selected = { slug: state.slug, hhhh: state.hex };
        remembered = { slug: state.slug, hex: state.hex };
    } else {
        selected = null;
    }
    if (renderer) renderer.setSelection(selected);
}

function placeKey(state: DossierRoute): string {
    if (state.kind === 'closed') return '';
    return state.slug + '/' + state.hex;
}

function sectorIndex(slug: string): SectorIndex | null {
    if (!version) return null;
    return client.index(version, slug);
}

function subsectorName(index: SectorIndex, hex: string): string {
    const col = Number(hex.slice(0, 2));
    const row = Number(hex.slice(2));
    if (!Number.isFinite(col) || !Number.isFinite(row)) return '';
    const letter = String.fromCharCode(65 + Math.floor((row - 1) / 10) * 4 + Math.floor((col - 1) / 8));
    const names = index.metadata.names;
    const found = names[letter];
    return found ? found : 'Subsector ' + letter;
}

const dossierEntry = computed((): SectorHex | null => {
    void dossierTick.value;
    const state = dossier.value;
    if (state.kind === 'closed') return null;
    const index = sectorIndex(state.slug);
    if (!index) return null;
    return index.hexes[state.hex] ?? null;
});

const dossierSectorName = computed(() => {
    void dossierTick.value;
    const state = dossier.value;
    if (state.kind === 'closed') return '';
    const index = sectorIndex(state.slug);
    if (index) return index.name;
    if (!chart) return state.slug;
    for (const sector of chart.sectors) if (sector.slug === state.slug) return sector.name;
    return state.slug;
});

const dossierSubsector = computed(() => {
    void dossierTick.value;
    const state = dossier.value;
    if (state.kind === 'closed') return '';
    const index = sectorIndex(state.slug);
    return index ? subsectorName(index, state.hex) : '';
});

const dossierAllegiances = computed((): AllegianceName[] => {
    void dossierTick.value;
    const state = dossier.value;
    if (state.kind === 'closed') return [];
    const index = sectorIndex(state.slug);
    if (!index) return [];
    // Truth v2 indexes have no allegiance table; it arrives with v3.
    const table = (index.metadata as { allegiances?: { code: string; name: string }[] }).allegiances ?? [];
    return table.map((row) => ({ code: row.code, name: row.name }));
});

const dossierBody = computed(() => dossier.value.kind === 'body' ? dossier.value.body : null);

function acceptTree(ticket: number, key: string, doc: TreeEnvelope): void {
    if (ticket !== treeGen) return;
    if (placeKey(dossierRoute(route.path)) !== key) return;
    treeRef.value = doc;
    treeError.value = false;
}

function rejectTree(ticket: number): void {
    if (ticket !== treeGen) return;
    treeRef.value = null;
    treeError.value = true;
}

function loadDossier(): void {
    dossierTick.value += 1;
    const state = dossierRoute(route.path);
    if (state.kind === 'closed' || !version) {
        treeGen += 1;
        loadedHex = '';
        treeRef.value = null;
        treeError.value = false;
        pendingSector.value = false;
        missingHex.value = false;
        return;
    }
    const key = placeKey(state);
    const index = sectorIndex(state.slug);
    if (!index) {
        if (loadedHex !== key) {
            treeRef.value = null;
            treeError.value = false;
        }
        pendingSector.value = true;
        missingHex.value = false;
        client.want(version, [state.slug]);
        return;
    }
    pendingSector.value = false;
    const entry = index.hexes[state.hex];
    if (!entry) {
        loadedHex = key;
        treeGen += 1;
        missingHex.value = true;
        treeRef.value = null;
        treeError.value = false;
        return;
    }
    missingHex.value = false;
    if (entry.tree === null) {
        loadedHex = key;
        treeGen += 1;
        treeRef.value = null;
        treeError.value = false;
        return;
    }
    const cached = client.treeNow(entry.tree);
    if (cached) {
        loadedHex = key;
        treeGen += 1;
        treeRef.value = cached;
        treeError.value = false;
        return;
    }
    if (loadedHex !== key) {
        treeRef.value = null;
        treeError.value = false;
    }
    loadedHex = key;
    const hash = entry.tree;
    const ticket = ++treeGen;
    void client.tree(hash).then(
        (doc) => { acceptTree(ticket, key, doc); },
        () => { rejectTree(ticket); },
    );
}

function retryTree(): void {
    const state = dossierRoute(route.path);
    if (state.kind === 'closed' || !version) return;
    const index = sectorIndex(state.slug);
    const entry = index ? index.hexes[state.hex] : null;
    if (!entry || entry.tree === null) return;
    treeError.value = false;
    const key = placeKey(state);
    const hash = entry.tree;
    const ticket = ++treeGen;
    void client.tree(hash).then(
        (doc) => { acceptTree(ticket, key, doc); },
        () => { rejectTree(ticket); },
    );
}

function panelWorld(): PanelWorld | null {
    if (selected) return { slug: selected.slug, hex: selected.hhhh };
    return remembered;
}

function runSystemPanel(): void {
    const action = systemPanel({ panelOpen: dossier.value.kind !== 'closed', world: panelWorld() });
    if (!action.runnable) return;
    if (action.kind === 'close') {
        closePanel();
        return;
    }
    void router.push({
        path: '/s/' + encodeURIComponent(action.slug) + '/' + action.hex,
        query: route.query,
    });
}

function closePanel(): void {
    if (route.path === '/' || route.path === '') return;
    suppressFly = true;
    void router.push({
        path: '/',
        query: { x: cam.x.toFixed(3), y: cam.y.toFixed(3), z: cam.ppp.toFixed(3) },
    });
}

function onEscape(): void {
    const state = dossierRoute(route.path);
    const panelOpen = state.kind !== 'closed';
    let bodyOpen = state.kind === 'body';
    if (state.kind === 'body' && treeRef.value) {
        const system = pickSystem(treeRef.value.body);
        const keys = system ? bodyKeys(system) : [];
        if (!keys.includes(state.body)) bodyOpen = false;
    }
    const action = escapeAction({ omniOpen: omniOpen.value, panelOpen, bodyOpen });
    if (action === 'ignore') return;
    if (action === 'overview' && state.kind === 'body') {
        suppressFly = true;
        void router.push({
            path: '/s/' + encodeURIComponent(state.slug) + '/' + state.hex,
            query: route.query,
        });
        return;
    }
    closePanel();
}

function onPanelWidth(px: number): void {
    const map = canvasEl.value ? canvasEl.value.parentElement : null;
    if (map) map.style.setProperty('--panel-width', px + 'px');
    if (renderer) renderer.setWorkspaceLeft(px);
    markDirty();
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
        // A title fade is in progress: keep drawing until the renderer says it has settled.
        if (drawn.animating) dirty = true;
    }
    if (fly) dirty = true;
    if (dirty) raf = nextFrame(frame);
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
    syncSelection();
    loadDossier();
    const place = placeKey(dossierRoute(route.path));
    const sameHex = place !== '' && place === lastPlace;
    if (place === '') lastPlace = '';
    if (suppressFly) {
        suppressFly = false;
        if (place) lastPlace = place;
        showStatus();
        markDirty();
        return;
    }
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
    if (target.kind === 'camera' && sameHex) {
        lastPlace = place;
        markDirty();
        return;
    }
    if (target.kind === 'camera') lastPlace = place;
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
    if (dossierEl.value) dossierEl.value.remeasure();
    markDirty();
}

async function boot(): Promise<void> {
    try {
        version = await client.currentVersion();
        versionRef.value = version;
        const manifestPromise = client.manifest(version);
        const overviewPromise = client.overview(version);
        const politiesPromise = client.polities(version);
        void politiesPromise.then((doc) => {
            if (renderer) renderer.setPolities(doc);
            markDirty();
        }).catch(() => {
            // A 404 is an empty document inside the client. Any other failure leaves the chart without borders.
        });
        const manifest = await manifestPromise;
        chart = manifest;
        manifestRef.value = manifest;
        const empty: TruthOverview = { truthVersion: version, sectors: [] };
        if (renderer) renderer.setChart(manifest, empty, 'canonical');
        showStatus();
        applyRoute();
        markDirty();
        overview = await overviewPromise;
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
        const state = dossierRoute(route.path);
        if (state.kind !== 'closed' && state.slug === slug) loadDossier();
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
            const hit = hexAt(world.x, world.y);
            const place = fromGlobal(hit.q, hit.r);
            const hhhh = formatHex(place.col, place.row);
            if (holdsWorld(place.sx, place.sy, hhhh)) {
                const sector = chart ? chart.sectors.find((item) => item.x === place.sx && item.y === place.sy && item.canonical) : null;
                if (!sector) return;
                const path = '/s/' + encodeURIComponent(sector.slug) + '/' + hhhh;
                if (route.path !== path) {
                    suppressFly = true;
                    void router.push({ path, query: route.query });
                }
                return;
            }
            if (route.path !== '/' && route.path !== '') {
                suppressFly = true;
                void router.push({
                    path: '/',
                    query: { x: cam.x.toFixed(3), y: cam.y.toFixed(3), z: cam.ppp.toFixed(3) },
                });
            }
        },
        // Legacy js/canvas_input.js:361-373: a double click on a system with orbit data enters its orbit view.
        doubleClick: (sx, sy) => {
            const world = toWorld(cam, viewport(), sx, sy);
            const hit = hexAt(world.x, world.y);
            const place = fromGlobal(hit.q, hit.r);
            const hhhh = formatHex(place.col, place.row);
            const sector = chart ? chart.sectors.find((item) => item.x === place.sx && item.y === place.sy && item.canonical) : null;
            if (!sector || !version) return;
            const index = client.index(version, sector.slug);
            const entry = index ? index.hexes[hhhh] : null;
            // No generated system (an incomplete survey, or the index is not in yet): stay on the map.
            if (!entry || entry.tree === null) return;
            void router.push(orbitPath(sector.slug, hhhh));
        },
    });
    unregisterHome = registerCommand({
        id: 'home',
        name: 'Home view',
        keys: ['Home'],
        run: () => { goHome(); },
    });
    unregisterAccount = registerCommand({
        id: 'account',
        name: 'Account',
        run: () => { void router.push('/account'); },
    });
    unregisterClose = registerCommand({
        id: 'close-panel',
        name: 'Close panel',
        keys: ['Escape'],
        run: () => { onEscape(); },
    });
    unregisterSystem = registerCommand({
        id: 'system-panel',
        name: 'System panel',
        runnable: () => systemPanel({ panelOpen: dossier.value.kind !== 'closed', world: panelWorld() }).runnable,
        run: () => { runSystemPanel(); },
    });
    el.focus();
    void boot();
});

function holdsWorld(sx: number, sy: number, hhhh: string): boolean {
    if (!chart) return false;
    const sector = chart.sectors.find((item) => item.x === sx && item.y === sy && item.canonical);
    if (!sector) return false;
    if (tierFor(cam.ppp) === 'hex' && version) {
        const index = client.index(version, sector.slug);
        if (index) return Object.prototype.hasOwnProperty.call(index.hexes, hhhh);
    }
    if (!overview) return false;
    const cells = overview.sectors.find((item) => item.slug === sector.slug);
    const local = parseHex(hhhh);
    if (!cells || !local) return false;
    return cells.cells.charAt((local.col - 1) * SECTOR_ROWS + (local.row - 1)) !== '.';
}

function goHome(): void {
    const rect = chart ? homeRect(chart) : null;
    const vp = viewport();
    if (rect && vp.width > 0 && vp.height > 0) flyTo(fit(rect, vp, 0));
    if (route.path !== '/' && route.path !== '') {
        suppressFly = true;
        void router.push({ path: '/' });
    }
}

function onMapKey(event: KeyboardEvent): void {
    handleKey(event);
}

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
    if (unregisterHome) unregisterHome();
    if (unregisterAccount) unregisterAccount();
    if (unregisterClose) unregisterClose();
    if (unregisterSystem) unregisterSystem();
});
</script>

<template>
  <div class="map" @keydown="onMapKey">
    <canvas ref="canvasEl" tabindex="0"></canvas>
    <Rail :panel-open="dossier.kind !== 'closed'" :search-open="omniOpen" />
    <OmniBox :version="versionRef" :manifest="manifestRef" @open="omniOpen = $event" />
    <DossierPanel
      ref="dossierEl"
      :open="dossier.kind !== 'closed'"
      :slug="dossier.kind === 'closed' ? '' : dossier.slug"
      :hex="dossier.kind === 'closed' ? '' : dossier.hex"
      :sector-name="dossierSectorName"
      :subsector-name="dossierSubsector"
      :entry="dossierEntry"
      :tree="treeRef"
      :body-key="dossierBody"
      :error="treeError"
      :pending="pendingSector"
      :missing="missingHex"
      :allegiances="dossierAllegiances"
      @close="closePanel"
      @retry="retryTree"
      @width="onPanelWidth"
    />
    <p class="status ui-status" aria-live="polite">{{ status }}</p>
  </div>
</template>

<style>
.map {
  position: fixed;
  inset: 0;
  background: var(--bg-0);
}
/* An expanded rail pushes the chart, the omnibox, the panel and the status pill; it covers nothing. */
.map:has(.rail.is-expanded) {
  --rail-width: var(--rail-width-open);
}
/* The chart begins at the rail's edge, so the camera centres on what is visible. Only the
   chart: the dossier draws canvases of its own inside this view. */
.map > canvas {
  position: absolute;
  top: 0;
  left: var(--rail-width);
  width: calc(100% - var(--rail-width));
  height: 100%;
  display: block;
  touch-action: none;
}
.map > canvas:focus {
  outline: 1px solid var(--signal);
  outline-offset: -1px;
}
.map .status {
  position: absolute;
  left: calc(var(--rail-width) + max(var(--chrome-inset), var(--panel-width, 0px)));
  bottom: var(--chrome-inset);
  max-width: calc(100% - var(--rail-width) - 2 * var(--chrome-inset));
  pointer-events: none;
  transition: left var(--t-rail) ease;
}
@media (prefers-reduced-motion: reduce) {
  .map .status {
    transition: none;
  }
}
</style>

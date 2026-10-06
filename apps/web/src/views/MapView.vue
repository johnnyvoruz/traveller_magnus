<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex, SectorIndex, TreeEnvelope, TruthManifest, TruthOverview } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import { fit, flight, SHORT_HOP, toWorld, zoomAt, type Camera, type Viewport } from '../map/camera.ts';
import { standInSnapshot, type CampaignSnapshot } from '../map/campaign_layer.ts';
import { campaignDays, partyMarker } from '../workspace/party_where.ts';
import { formatHex, fromGlobal, hexAt, parseHex, SECTOR_ROWS } from '../map/geometry.ts';
import { attachInput, type InputWhy } from '../map/input.ts';
import { MapRenderer } from '../map/MapRenderer.ts';
import { dossierRoute, homeRect, targetFor, type DossierRoute } from '../map/routes.ts';
import { readMotion, readTheme } from '../map/theme.ts';
import { tierFor } from '../map/tiers.ts';
import { TruthClient } from '../map/truth_client.ts';
import OmniBox from '../components/OmniBox.vue';
import { bodyKeys, overviewModel, pickSystem, type AllegianceName, type TreeRow } from '../dossier/model.ts';
import { askPaneEscape, setFrame } from '../shell/frame.ts';
import { addressPane, atPane, withQuery } from '../shell/pane.ts';
import { handleKey, registerCommand, systemPanel, type PanelWorld } from '../shell/registry.ts';
import { orbitPath } from '../orbit/bodies.ts';
import Rail from '../shell/Rail.vue';
import { dismissToast, showToast, toasts } from '../shell/toast.ts';
import ToastStrip from '../shell/ToastStrip.vue';
import AccountMenu from '../workspace/AccountMenu.vue';
import { editDateNext } from '../workspace/list_state.ts';
import StardateChip from '../workspace/StardateChip.vue';
import { locateOriginY, locating, stopLocate } from '../workspace/locate.ts';
import { ensureCampaign } from '../workspace/opening.ts';
import { cancelPick, offerSystem, picking } from '../workspace/pick.ts';
import { setPlaceSource, type SystemInfo } from '../workspace/place_source.ts';
import { parseHexKey } from '../workspace/places.ts';
import { loadSession, session } from '../account/session.ts';
import {
    cancelFrame,
    devicePixelRatio,
    storageGet,
    storageSet,
    nextFrame,
    now,
    onDevicePixelRatioChange,
    pageOrigin,
    prefersReducedMotion,
} from '../platform/browser.ts';

const route = useRoute();
const router = useRouter();
const canvasEl = ref<HTMLCanvasElement | null>(null);
const railEl = ref<{ focusAccount: () => void; focusCampaign: () => void; focusSystem: () => void } | null>(null);
/** The account pop-up at the rail's foot. */
const accountOpen = ref(false);
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
let unregisterCampaign: (() => void) | null = null;
/** The camera has been put somewhere: a route with no place of its own leaves it there. */
let placed = false;
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
/** The open panel's measured width, gutters included: the chart is clear to the right of it. */
let panelPx = 0;
/** When the camera reached the hex being located; null while it is on the way. */
let locateArrived: number | null = null;

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
/** The pane the address names. A panel query wins over a legacy /campaign path. */
const shownPane = computed(() => addressPane(route.path, route.query).pane);
/** The Campaign panel is the campaign list, a record, or the party. */
const campaignOpen = computed(() => shownPane.value.kind === 'campaign' || shownPane.value.kind === 'party');
/** The dossier is open only when the pane is the dossier, not merely because the path names a hex. */
const dossierShown = computed(() => shownPane.value.kind === 'dossier');

/** Set on this device once the Campaign panel has opened itself for a first sign-in (design J12). */
const GREETED_KEY = 'voyage_campaign_greeted';

/** A first sign-in lands on the home view: the Campaign panel opens once, and never again unasked. */
function greet(): void {
    if (!session.user || route.path !== '/') return;
    if (storageGet(GREETED_KEY) === '1') return;
    storageSet(GREETED_KEY, '1');
    if (storageGet(GREETED_KEY) !== '1') return;
    if (campaignOpen.value) return;
    suppressFly = true;
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: null }));
}

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

function cameraQuery(): { x: string; y: string; z: string } {
    return { x: cam.x.toFixed(3), y: cam.y.toFixed(3), z: cam.ppp.toFixed(3) };
}

function runSystemPanel(): void {
    const action = systemPanel({ panelOpen: dossierShown.value, world: panelWorld() });
    if (!action.runnable) return;
    if (action.kind === 'close') {
        closePanel();
        return;
    }
    suppressFly = true;
    void router.push({
        path: '/s/' + encodeURIComponent(action.slug) + '/' + action.hex,
        query: withQuery(route.query, { panel: null, record: null }),
    });
}

/** Closing writes panel=closed and leaves the path and the camera. */
function closePanel(): void {
    if (shownPane.value.kind === 'shut') return;
    suppressFly = true;
    void router.push(atPane(route.path, route.query, { kind: 'shut' }));
}

/** The Campaign panel over the view where it stands; pressed again, it closes. */
function toggleCampaign(): void {
    accountOpen.value = false;
    suppressFly = true;
    const next = campaignOpen.value ? { kind: 'shut' as const } : { kind: 'campaign' as const, record: null };
    void router.push(atPane(route.path, route.query, next));
}

function closeAccount(): void {
    if (!accountOpen.value) return;
    accountOpen.value = false;
    if (railEl.value) railEl.value.focusAccount();
}

function openCampaignFromMenu(): void {
    accountOpen.value = false;
    if (!campaignOpen.value) toggleCampaign();
}

/** The date beside the search bar: the Campaign panel, on its list, with the date's field open. */
function openDateEditor(): void {
    editDateNext.value = true;
    accountOpen.value = false;
    const pane = shownPane.value;
    if (pane.kind === 'campaign' && !pane.record) return;
    suppressFly = true;
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: null }));
}

function onEscape(): void {
    if (accountOpen.value) {
        closeAccount();
        return;
    }
    // Esc dismisses the newest toast before it closes anything.
    if (toasts.length) {
        dismissToast(toasts[toasts.length - 1].id);
        return;
    }
    // Then a place being picked, then a locate, each before the panel they belong to.
    if (picking.value) {
        cancelPick();
        return;
    }
    if (locating.recordId) {
        stopLocate();
        return;
    }
    if (omniOpen.value && (campaignOpen.value || dossierShown.value)) return;
    const state = dossierRoute(route.path);
    let bodyOpen = state.kind === 'body';
    if (state.kind === 'body' && treeRef.value) {
        const system = pickSystem(treeRef.value.body);
        const keys = system ? bodyKeys(system) : [];
        if (!keys.includes(state.body)) bodyOpen = false;
    }
    if (dossierShown.value && state.kind === 'body' && !bodyOpen) {
        closePanel();
        return;
    }
    suppressFly = true;
    if (askPaneEscape()) return;
    suppressFly = false;
    if (dossierShown.value) closePanel();
}

/** A toast needs this much of the chart beside the panel; with less it goes to the search row. */
const TOAST_ROOM = 400;

/** The host reports the open pane's width. The chart clears it; a toast moves when the chart is narrow. */
function setWidth(px: number): void {
    const map = canvasEl.value ? canvasEl.value.parentElement : null;
    if (map) {
        const el = canvasEl.value;
        const chart = el ? el.clientWidth - px : 0;
        map.dataset.toasts = px > 0 && chart < TOAST_ROOM ? 'top' : 'side';
    }
    panelPx = px;
    if (locating.recordId) applyCampaign();
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
            arriveAtLocate();
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
        void router.replace({ path: route.path, query: withQuery(route.query, { x, y, z }) });
    };
    queryFrame = nextFrame(tick);
}

function flyTo(target: Camera): void {
    const el = canvasEl.value;
    placed = true;
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
    const legacyCampaign = route.path === '/campaign' || route.path.startsWith('/campaign/');
    const home = route.path === '/' || route.path === '';
    if (legacyCampaign || (campaignOpen.value && home)) {
        // No hex on this path: the camera stays, or takes the link's, or the home view.
        showStatus();
        const linked = cameraFromQuery();
        if (linked && !sawQuery) {
            sawQuery = true;
            fly = null;
            cam = linked;
            placed = true;
        } else if (!placed) {
            const home = homeRect(chart);
            if (home) {
                cam = fit(home, vp, 0);
                placed = true;
            }
        }
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
        placed = true;
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
            arriveAtLocate();
            if (why) {
                markDirty();
                scheduleQuery();
            }
        },
        click: (sx, sy) => {
            if (renderer && renderer.partyAt(sx, sy)) {
                openParty();
                return;
            }
            const world = toWorld(cam, viewport(), sx, sy);
            const hit = hexAt(world.x, world.y);
            const place = fromGlobal(hit.q, hit.r);
            const hhhh = formatHex(place.col, place.row);
            const onWorld = holdsWorld(place.sx, place.sy, hhhh);
            // A record's place is being picked: a system clicked goes to it, and nothing else happens.
            if (picking.value) {
                const sector = onWorld && chart ? chart.sectors.find((item) => item.x === place.sx && item.y === place.sy && item.canonical) : null;
                if (!sector) return;
                const index = version ? client.index(version, sector.slug) : null;
                const entry = index ? index.hexes[hhhh] : null;
                offerSystem({ slug: sector.slug, hex: hhhh, name: entry ? entry.name : '' });
                return;
            }
            // A click on the chart ends a locate; on empty space that is all it does.
            if (locating.recordId) {
                stopLocate();
                if (!onWorld) return;
            }
            if (onWorld) {
                const sector = chart ? chart.sectors.find((item) => item.x === place.sx && item.y === place.sy && item.canonical) : null;
                if (!sector) return;
                const path = '/s/' + encodeURIComponent(sector.slug) + '/' + hhhh;
                if (route.path !== path) {
                    suppressFly = true;
                    void router.push({ path, query: withQuery(route.query, {}) });
                }
                return;
            }
            if (route.path !== '/' && route.path !== '') {
                suppressFly = true;
                void router.push({ path: '/', query: withQuery(route.query, cameraQuery()) });
            }
        },
        // Legacy js/canvas_input.js:361-373: a double click on a system with orbit data enters its orbit view.
        doubleClick: (sx, sy) => {
            if (renderer && renderer.partyAt(sx, sy)) return;
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
            void router.push({ path: orbitPath(sector.slug, hhhh), query: withQuery(route.query, {}) });
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
        run: () => { accountOpen.value = !accountOpen.value; },
    });
    unregisterCampaign = registerCommand({
        id: 'campaign',
        name: 'Campaign',
        run: () => { toggleCampaign(); },
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
        runnable: () => systemPanel({ panelOpen: dossierShown.value, world: panelWorld() }).runnable,
        run: () => { runSystemPanel(); },
    });
    el.focus();
    setPlaceSource({ current: currentSystem, system: systemInfo, bodies: systemBodies });
    applyCampaign();
    void boot();
    nextFrame(() => { void loadSession(); });
});

watch(
    () => [campaign.status, campaign.seq, campaign.clock ? campaign.clock.days : null, route.query.campaignStandIn] as const,
    () => { applyCampaign(); },
);

function applyCampaign(): void {
    if (!renderer) return;
    const standIn = devStandIn();
    renderer.setCampaign(standIn ? standIn : snapshotFromStore());
    markDirty();
}

function devStandIn(): CampaignSnapshot | null {
    if (!import.meta.env.DEV) return null;
    const raw = route.query.campaignStandIn;
    const text = Array.isArray(raw) ? raw[0] : raw;
    const count = Number(text);
    if (!Number.isFinite(count) || count <= 0) return null;
    return standInSnapshot(count, now());
}

function snapshotFromStore(): CampaignSnapshot | null {
    if (campaign.status !== 'ready' || !campaign.settings) return null;
    // The party stands where its ship's track puts it at the campaign date (party_where.ts).
    const mark = partyMarker(campaign.settings.party, campaign.records, campaignDays(campaign.clock));
    return {
        party: mark ? { name: mark.name, hexKey: mark.hexKey, focused: false } : null,
        locate: locateLine(),
        reducedMotion: prefersReducedMotion(),
    };
}

/** One inset: the panel's measured box is its card plus this gutter each side. */
const PANEL_GUTTER = 10;

/**
 * The locator's line for the map's campaign layer: from the panel's edge, level with the
 * control that asked, to the record's hex. The layer draws it; this only says where.
 */
function locateLine(): CampaignSnapshot['locate'] {
    if (!locating.recordId || !locating.hexKey) return null;
    const vp = viewport();
    const y = Math.min(Math.max(locateOriginY(), 0), vp.height);
    return { hexKey: locating.hexKey, fromX: Math.max(0, panelPx - PANEL_GUTTER), fromY: y, arrivedAt: locateArrived };
}

/** The camera has come to rest on the hex being located (or the visitor took it over): the ring's beat starts. */
function arriveAtLocate(): void {
    if (!locating.recordId || locateArrived !== null) return;
    locateArrived = now();
    applyCampaign();
}

/**
 * A locate has started, ended or been asked for again: fly to the record's hex, centred in
 * the chart the panel leaves clear, and hand the layer the line.
 */
function applyLocate(): void {
    locateArrived = null;
    if (!locating.recordId) {
        applyCampaign();
        return;
    }
    const place = parseHexKey(locating.hexKey);
    const target = place && chart ? targetFor({ path: '/s/' + encodeURIComponent(place.slug) + '/' + place.hex }, chart) : null;
    if (!target || target.kind !== 'camera') {
        stopLocate();
        showToast('That place is not on this chart.');
        return;
    }
    const to = target.camera;
    flyTo({ x: to.x - panelPx / (2 * to.ppp), y: to.y, ppp: to.ppp });
    if (!fly) locateArrived = now();
    applyCampaign();
}

// ---- What the record screens ask of the released map (workspace/place_source.ts) ----

const INDEX_WAIT_MS = 15000;

/** A sector's index, fetched when it is not held. Null when the sector is not on this chart or does not arrive. */
function indexWhenReady(slug: string): Promise<SectorIndex | null> {
    if (!version || !chart || !chart.sectors.some((item) => item.slug === slug)) return Promise.resolve(null);
    const held = client.index(version, slug);
    if (held) return Promise.resolve(held);
    return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const stop = client.onArrive((arrived) => {
            if (arrived !== slug) return;
            stop();
            if (timer !== null) clearTimeout(timer);
            resolve(client.index(version, slug));
        });
        timer = setTimeout(() => {
            stop();
            resolve(client.index(version, slug));
        }, INDEX_WAIT_MS);
        client.want(version, [slug]);
    });
}

async function systemInfo(slug: string, hex: string): Promise<SystemInfo | null> {
    const index = await indexWhenReady(slug);
    const entry = index ? index.hexes[hex] : null;
    if (!index || !entry) return null;
    return { slug, hex, name: entry.name || hex, sectorName: index.name };
}

async function systemBodies(slug: string, hex: string): Promise<TreeRow[] | null> {
    const index = await indexWhenReady(slug);
    const entry = index ? index.hexes[hex] : null;
    if (!index || !entry || entry.tree === null) return null;
    try {
        const tree = client.treeNow(entry.tree) ?? await client.tree(entry.tree);
        const model = overviewModel({ sectorName: index.name, subsectorName: subsectorName(index, hex), hex, entry, tree });
        return model.tree ? model.tree.rows : null;
    } catch {
        return null;
    }
}

/** The system selected on the map, or the last one opened this visit. */
function currentSystem(): SystemInfo | null {
    const world = panelWorld();
    if (!world || !chart) return null;
    const index = version ? client.index(version, world.slug) : null;
    const entry = index ? index.hexes[world.hex] : null;
    let sectorName = world.slug.replace(/_/g, ' ');
    for (const sector of chart.sectors) if (sector.slug === world.slug) sectorName = sector.name;
    return { slug: world.slug, hex: world.hex, name: entry ? entry.name : '', sectorName };
}

/** The party's marker was pressed: the Party tab. */
function openParty(): void {
    if (shownPane.value.kind === 'party') return;
    accountOpen.value = false;
    suppressFly = true;
    void router.push(atPane(route.path, route.query, { kind: 'party' }));
}

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
        void router.push({ path: '/', query: withQuery(route.query, {}) });
    }
}

function onMapKey(event: KeyboardEvent): void {
    handleKey(event);
}

/** The host paints the panes. This view only says what the dossier is showing. */
function publishFrame(): void {
    const state = dossier.value;
    const placed = state.kind === 'closed' ? null : state;
    setFrame({
        kind: 'map',
        panelTop: null,
        truthVersion: versionRef.value,
        setWidth,
        retry: retryTree,
        focusCampaign: () => { if (railEl.value) railEl.value.focusCampaign(); },
        focusSystem: () => { if (railEl.value) railEl.value.focusSystem(); },
        key: onMapKey,
        dossier: {
            slug: placed ? placed.slug : '',
            hex: placed ? placed.hex : '',
            sectorName: dossierSectorName.value,
            subsectorName: dossierSubsector.value,
            entry: dossierEntry.value,
            tree: treeRef.value,
            bodyKey: dossierBody.value,
            error: treeError.value,
            pending: pendingSector.value,
            missing: missingHex.value,
            allegiances: dossierAllegiances.value,
            orbit: false,
        },
    });
}

watch(
    () => [
        dossier.value,
        dossierEntry.value,
        dossierSectorName.value,
        dossierSubsector.value,
        dossierAllegiances.value,
        dossierBody.value,
        treeRef.value,
        treeError.value,
        pendingSector.value,
        missingHex.value,
        versionRef.value,
    ] as const,
    () => { publishFrame(); },
    { immediate: true },
);

watch(() => route.path, () => {
    sawQuery = false;
    // A locate belongs to the page it was asked from.
    if (locating.recordId) stopLocate();
    applyRoute();
});

watch(() => session.user, () => { greet(); });

// Signed in, the campaign is asked for once the chart's version is known: the dossier's
// "your records here" and the party's marker do not wait for the Campaign panel.
watch(() => [session.user, versionRef.value] as const, () => { void ensureCampaign(versionRef.value); });

watch(() => [locating.recordId, locating.hexKey, locating.turn] as const, () => { applyLocate(); });

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
    if (unregisterCampaign) unregisterCampaign();
    setPlaceSource(null);
    setFrame(null);
    if (locating.recordId) stopLocate();
});
</script>

<template>
  <div class="map" @keydown="onMapKey">
    <canvas ref="canvasEl" tabindex="0"></canvas>
    <Rail
      ref="railEl"
      :panel-open="dossierShown"
      :search-open="omniOpen"
      :campaign-open="campaignOpen"
      :account-open="accountOpen"
    />
    <OmniBox :version="versionRef" :manifest="manifestRef" @open="omniOpen = $event" />
    <StardateChip @open="openDateEditor" />
    <AccountMenu :open="accountOpen" @close="closeAccount" @campaign="openCampaignFromMenu" />
    <ToastStrip />
    <p class="status ui-status" aria-live="polite">{{ status }}</p>
  </div>
</template>

<style>
.map {
  position: fixed;
  inset: 0;
  background: var(--bg-0);
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
/* A toast sits on the chart beside the panel, above the status line: it covers no control. */
.map {
  --toast-left: calc(var(--rail-width) + max(var(--chrome-inset), var(--panel-width, 0px)));
  --toast-bottom: calc(var(--chrome-inset) + 44px);
  --toast-max: min(460px, calc(100% - var(--rail-width) - max(var(--chrome-inset), var(--panel-width, 0px)) - var(--chrome-inset)));
}
/* The panel covers the chart: the toast goes to the search row, right of the search field. */
.map[data-toasts="top"] {
  --toast-top: var(--chrome-top);
  --toast-right: var(--chrome-inset);
  --toast-bottom: auto;
  --toast-left: calc(var(--rail-width) + var(--chrome-inset) + 452px + 220px);
  --toast-flow: row-reverse;
  --toast-align: flex-start;
  --toast-max: none;
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

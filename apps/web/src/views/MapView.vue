<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex, SectorIndex, TreeEnvelope, TruthManifest, TruthOverview } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import { fit, flight, SHORT_HOP, toWorld, zoomAt, type Camera, type Viewport } from '../map/camera.ts';
import { standInSnapshot, type CampaignSnapshot } from '../map/campaign_layer.ts';
import { vesselsOnMap } from '../map/vessel_marks.ts';
import { campaignDays, partyMarker } from '../workspace/party_where.ts';
import { formatHex, fromGlobal, hexAt, parseHex, SECTOR_ROWS, stepGlobal, toGlobal, type HexStep } from '../map/geometry.ts';
import { attachInput, type InputWhy } from '../map/input.ts';
import { MapRenderer } from '../map/MapRenderer.ts';
import { dossierRoute, homeRect, targetFor, type DossierRoute } from '../map/routes.ts';
import { bindBuilder } from '../builder/bind.ts';
import { subsectorHexes, subsectorLetter, subsectorPath } from '../builder/address.ts';
import { readMotion, readTheme } from '../map/theme.ts';
import { tierFor } from '../map/tiers.ts';
import { TruthClient } from '../map/truth_client.ts';
import OmniBox from '../components/OmniBox.vue';
import { bodyKeys, overviewModel, pickSystem, type AllegianceName, type TreeRow } from '../dossier/model.ts';
import { askPaneEscape, setFrame } from '../shell/frame.ts';
import { addressPane, atPane, hostsCampaign, withQuery } from '../shell/pane.ts';
import { handleKey, registerCommand, systemPanel, type PanelWorld } from '../shell/registry.ts';
import { orbitPath } from '../orbit/bodies.ts';
import Rail from '../shell/Rail.vue';
import { dismissToast, showToast, toasts } from '../shell/toast.ts';
import ToastStrip from '../shell/ToastStrip.vue';
import AccountMenu from '../workspace/AccountMenu.vue';
import { editDateNext } from '../workspace/list_state.ts';
import StardateChip from '../workspace/StardateChip.vue';
import { locateOriginY, locating, startLocate, stopLocate, systemSubject } from '../workspace/locate.ts';
import { ensureCampaign } from '../workspace/opening.ts';
import { cancelPick, offerSystem, picking } from '../workspace/pick.ts';
import { setPlaceSource, type SystemInfo } from '../workspace/place_source.ts';
import { parseHexKey } from '../workspace/places.ts';
import { loadSession, session } from '../account/session.ts';
import { buildReady, discardPreview, setBuildMap } from '../workspace/build/acts.ts';
import { BUILD_COMMANDS, canBuild, menuFor, runBuild, type BuildCommandId } from '../workspace/build/commands.ts';
import { keyAt, keysInBox, type SectorPlace } from '../workspace/build/marks.ts';
import { scopeKeys } from '../workspace/build/scope.ts';
import { buildStore } from '../workspace/build/seam.ts';
import { addKeys, build, layOver, plural, SELECTION_CAP, setBuildOn, toggleKey } from '../workspace/build/state.ts';
import type { Rect as PopRect } from '../workspace/pop_place.ts';
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

function universeNow() {
    const row = campaign.status === 'ready' && campaign.universeId
        ? campaign.universes.find((item) => item.id === campaign.universeId)
        : null;
    if (!row) return null;
    const manifest = manifestRef.value;
    return {
        id: row.id,
        name: row.name,
        truthVersion: row.truthVersion,
        seed: manifest ? manifest.seed : null,
        settings: manifest ? manifest.settings : null,
    };
}

const bound = bindBuilder(universeNow);

function addressedScope(): { slug: string; letter: string | null } | null {
    const view = addressPane(route.path, route.query).view;
    if (view.kind === 'sector') return { slug: view.sector, letter: null };
    if (view.kind === 'subsector') return { slug: view.sector, letter: view.letter };
    return null;
}
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
let unregisterLocate: (() => void) | null = null;
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

// ---- Build (findings/builder_system_design.md): the marks, the strip and the menu load only when it is on ----
const BuildMarks = defineAsyncComponent(() => import('../workspace/build/BuildMarks.vue'));
const BuildStrip = defineAsyncComponent(() => import('../workspace/build/BuildStrip.vue'));
const BuildMenu = defineAsyncComponent(() => import('../workspace/build/BuildMenu.vue'));
const mapEl = ref<HTMLElement | null>(null);
const marksEl = ref<{ place: (cam: Camera, vp: Viewport) => void } | null>(null);
/** The box being dragged, in canvas pixels. */
const boxRef = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
/** The right-click menu: where it opened and the hexes it acts on. */
const menuRef = ref<{ anchor: PopRect; keys: string[] } | null>(null);
/** The sectors the chart drew last, for the removed hexes among them. */
const screenSlugs = ref<string[]>([]);
let boxPointer = -1;
let unregisterBuild: (() => void) | null = null;
let unregisterBuildActs: (() => void)[] = [];
/** The chart's index with the universe's rows laid over it, held until either changes. */
const laid = new Map<string, { base: SectorIndex; tick: number; index: SectorIndex }>();

const client = new TruthClient({
    cdnBase: import.meta.env.VITE_CDN_BASE || 'https://cdn.traveller.voyage',
    apiBase: pageOrigin(),
    fetch,
});

function viewport(): Viewport {
    const el = canvasEl.value;
    return { width: el ? el.clientWidth : 0, height: el ? el.clientHeight : 0 };
}

/** The universe's universe: what the map draws for a sector. With no universe open it is the chart's own index. */
function mapIndex(slug: string): SectorIndex | null {
    const base = version ? client.index(version, slug) : null;
    const store = buildStore();
    if (!base || !store || !store.universe()) return base;
    const tick = store.tick();
    const held = laid.get(slug);
    if (held && held.base === base && held.tick === tick) return held.index;
    const index = layOver(base, store.rows(slug));
    laid.set(slug, { base, tick, index });
    return index;
}

function selectionLine(): string {
    if (buildReady() && build.selection.length > 1) return plural(build.selection.length, 'hex', 'hexes') + ' selected';
    if (!selected || !chart || !version) return '';
    const index = mapIndex(selected.slug);
    if (!index) return '';
    let sectorName = selected.slug;
    for (const sector of chart.sectors) if (sector.slug === selected.slug) sectorName = sector.name;
    const row = index.hexes[selected.hhhh];
    if (!row) {
        const store = buildStore();
        const held = store ? store.row(selected.slug + '/' + selected.hhhh) : null;
        const kept = held && held.state === 'removed' && held.entry ? held.entry.name : '';
        if (buildReady() && kept) return kept + ' · ' + sectorName + ' ' + selected.hhhh;
        return buildReady() ? 'Empty hex · ' + sectorName + ' ' + selected.hhhh : '';
    }
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
const campaignOpen = computed(() => hostsCampaign(shownPane.value));
/** The dossier is open only when the pane is the dossier, not merely because the path names a hex. */
const dossierShown = computed(() => shownPane.value.kind === 'dossier');

/** Set on this device once the Campaign panel has opened itself for a first sign-in (design J12). */
const GREETED_KEY = 'voyage_campaign_greeted';

/** A first sign-in lands on the home view: the Campaign panel opens once, and never again unasked. */
function greet(): void {
    if (!session.user || route.path !== '/') return;
    if (shownPane.value.kind !== 'shut') return;
    if (storageGet(GREETED_KEY) === '1') return;
    storageSet(GREETED_KEY, '1');
    if (storageGet(GREETED_KEY) !== '1') return;
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
    // Many hexes are outlined by the build marks; the single outline would mark only the last one.
    // The same for a hex being previewed: it is drawn dashed until the system is kept.
    const marked = buildReady() && (build.selection.length > 1 || build.preview !== null || build.rolling !== '');
    if (renderer) renderer.setSelection(marked ? null : selected);
}

function placeKey(state: DossierRoute): string {
    if (state.kind === 'closed') return '';
    return state.slug + '/' + state.hex;
}

function sectorIndex(slug: string): SectorIndex | null {
    if (!version) return null;
    return mapIndex(slug);
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
    const scope = state.kind === 'closed' ? addressedScope() : null;
    const slug = state.kind === 'closed' ? (scope ? scope.slug : '') : state.slug;
    if (!slug) return '';
    const index = sectorIndex(slug);
    if (index) return index.name;
    if (!chart) return slug;
    for (const sector of chart.sectors) if (sector.slug === slug) return sector.name;
    return slug;
});

const dossierSubsector = computed(() => {
    void dossierTick.value;
    const state = dossier.value;
    if (state.kind !== 'closed') {
        const index = sectorIndex(state.slug);
        return index ? subsectorName(index, state.hex) : '';
    }
    const scope = addressedScope();
    if (!scope || !scope.letter) return '';
    const index = sectorIndex(scope.slug);
    const hex = subsectorHexes(scope.letter)[0];
    return index && hex ? subsectorName(index, hex) : 'Subsector ' + scope.letter;
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
    // A system of the builder's: its tree is the universe's object, not the chart's.
    const store = buildStore();
    const mine = store && store.universe() ? store.row(key) : null;
    if (!entry && !(mine && mine.state !== 'removed')) {
        loadedHex = key;
        treeGen += 1;
        missingHex.value = true;
        treeRef.value = null;
        treeError.value = false;
        return;
    }
    missingHex.value = false;
    if (store && mine && mine.state !== 'removed') {
        if (loadedHex !== key) {
            treeRef.value = null;
            treeError.value = false;
        }
        loadedHex = key;
        const ticket = ++treeGen;
        void store.tree(key).then(
            (doc) => { if (doc) acceptTree(ticket, key, doc); else rejectTree(ticket); },
            () => { rejectTree(ticket); },
        );
        return;
    }
    if (!entry || entry.tree === null) {
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
    if (pane.kind === 'journal' && !pane.entry) return;
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
    // Build: the sheet, then a preview, then a many-hex selection, each before the panel.
    if (buildReady()) {
        if (build.sheetOpen) {
            build.sheetOpen = false;
            return;
        }
        if (build.preview || build.rolling) {
            discardPreview();
            return;
        }
        if (build.selection.length > 1) {
            build.selection = [];
            return;
        }
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
        const el = canvasEl.value;
        if (el) el.dataset.drawMs = drawn.ms.toFixed(2);
        if (drawn.tier === 'hex' && version) {
            requestIndexes(drawn.sectorsOnScreen);
            for (const slug of drawn.sectorsOnScreen) bound.load(slug);
        }
        if (marksEl.value) marksEl.value.place(cam, viewport());
        if (build.on && drawn.sectorsOnScreen.join('\n') !== screenSlugs.value.join('\n')) screenSlugs.value = [...drawn.sectorsOnScreen];
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
    renderer.setIndexSource((slug) => mapIndex(slug));
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
            const vesselId = renderer ? renderer.vesselAt(sx, sy) : null;
            if (vesselId) {
                openVessel(vesselId);
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
            // A plain click selects one hex: a many-hex selection ends.
            if (build.selection.length) build.selection = [];
            // In Build an empty hex can be selected too, where the chart is close enough to show hexes.
            if (onWorld || (buildReady() && tierFor(cam.ppp) === 'hex')) {
                const sector = chart ? chart.sectors.find((item) => item.x === place.sx && item.y === place.sy && item.canonical) : null;
                if (!sector) {
                    if (onWorld) return;
                } else {
                    openHex(sector.slug + '/' + hhhh);
                    return;
                }
            }
            if (route.path !== '/' && route.path !== '') {
                suppressFly = true;
                void router.push({ path: '/', query: withQuery(route.query, cameraQuery()) });
            }
        },
        // Legacy js/canvas_input.js:361-373: a double click on a system with orbit data enters its orbit view.
        doubleClick: (sx, sy) => {
            if (renderer && (renderer.partyAt(sx, sy) || renderer.vesselAt(sx, sy))) return;
            const world = toWorld(cam, viewport(), sx, sy);
            const hit = hexAt(world.x, world.y);
            const place = fromGlobal(hit.q, hit.r);
            const hhhh = formatHex(place.col, place.row);
            const sector = chart ? chart.sectors.find((item) => item.x === place.sx && item.y === place.sy && item.canonical) : null;
            if (!sector || !version) return;
            const index = mapIndex(sector.slug);
            const entry = index ? index.hexes[hhhh] : null;
            // A system the referee generated is opened from the universe row. The chart is the rest.
            const store = buildStore();
            const row = store && store.universe() ? store.row(sector.slug + '/' + hhhh) : null;
            if (row && row.state === 'removed') return;
            if (row && row.state !== 'removed') {
                void router.push({ path: orbitPath(sector.slug, hhhh), query: withQuery(route.query, {}) });
                return;
            }
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
    unregisterLocate = registerCommand({
        id: 'locate-system',
        name: 'Locate this system',
        keys: ['l'],
        runnable: () => panelWorld() !== null,
        run: () => { locateSystem(); },
    });
    unregisterSystem = registerCommand({
        id: 'system-panel',
        name: 'System panel',
        runnable: () => systemPanel({ panelOpen: dossierShown.value, world: panelWorld() }).runnable,
        run: () => { runSystemPanel(); },
    });
    el.focus();
    bound.sync();
    setBuildMap({
        truth: truthRow,
        sectorName: sectorNameOf,
        subsectorName: (hexKey) => {
            const place = parseHexKey(hexKey);
            const index = place && version ? client.index(version, place.slug) : null;
            return place && index ? subsectorName(index, place.hex) : '';
        },
        settings: () => (manifestRef.value ? manifestRef.value.settings : null),
    });
    setPlaceSource({ current: currentSystem, system: systemInfo, bodies: systemBodies });
    applyCampaign();
    void boot();
    nextFrame(() => { void loadSession(); });
});

watch(
    () => [campaign.status, campaign.seq, campaign.clock ? campaign.clock.days : null, route.query.campaignStandIn] as const,
    () => { applyCampaign(); },
);

// ---- Build: the switch, the selection, the commands (findings/builder_system_design.md §1) ----

/** Build can be switched on: signed in, with a universe open. */
const buildOffered = computed(() => session.user !== null && campaign.status === 'ready' && campaign.universeId !== null);
const buildUniverse = computed(() => {
    void campaign.universeId;
    const store = buildStore();
    return buildOffered.value && store ? store.universe() : null;
});
/** The hexes the builder removed among the sectors on screen: a faint outline while Build is on. */
const removedKeys = computed(() => {
    const store = buildStore();
    if (!store || !build.on || !buildUniverse.value) return [];
    void store.tick();
    const out: string[] = [];
    for (const slug of screenSlugs.value) for (const row of store.rows(slug)) if (row.state === 'removed') out.push(row.hexKey);
    return out;
});
/** A sector or a subsector on the address, with its pane showing: its hexes are what Build has selected. */
function scopeSelection(): string[] {
    const scope = addressedScope();
    return scope && dossierShown.value && buildReady() ? scopeKeys(scope) : [];
}
const manyKeys = computed(() => {
    if (!build.on || !buildUniverse.value) return [];
    return build.selection.length > 1 ? build.selection : scopeSelection();
});
const previewKey = computed(() => (build.on && buildUniverse.value ? (build.preview ? build.preview.hexKey : build.rolling) : ''));

function truthRow(hexKey: string): SectorHex | null {
    const place = parseHexKey(hexKey);
    const index = place && version ? client.index(version, place.slug) : null;
    return place && index ? index.hexes[place.hex] ?? null : null;
}

function sectorNameOf(slug: string): string {
    if (chart) for (const sector of chart.sectors) if (sector.slug === slug) return sector.name;
    return slug.replace(/_/g, ' ');
}

function sectorOf(slug: string): SectorPlace | null {
    const found = chart ? chart.sectors.find((item) => item.slug === slug) : null;
    return found ? { slug: found.slug, x: found.x, y: found.y } : null;
}

function sectorAt(x: number, y: number): string | null {
    const found = chart ? chart.sectors.find((item) => item.x === x && item.y === y && item.canonical) : null;
    return found ? found.slug : null;
}

/** One hex, selected: its page, with the dossier pane open and the camera left alone. */
function openHex(hexKey: string): void {
    const place = parseHexKey(hexKey);
    if (!place) return;
    const path = '/s/' + encodeURIComponent(place.slug) + '/' + place.hex;
    if (route.path === path && dossierShown.value) return;
    suppressFly = true;
    void router.push({ path, query: withQuery(route.query, { panel: null, record: null }) });
}

/** The hexes a build act takes: the many-hex selection, else the one hex selected, pane open or shut. */
function actingKeys(): string[] {
    const picked = pickedKeys();
    return picked.length ? picked : scopeSelection();
}

/** What was picked by hand: the many-hex selection, else the one hex selected. A box or a Shift+click adds to this, never to a whole sector. */
function pickedKeys(): string[] {
    if (build.selection.length > 1) return build.selection;
    return selected ? [selected.slug + '/' + selected.hhhh] : [];
}

/**
 * Generate and Generate with… open the selected hex when the pane is shut, so the
 * preview or the sheet can be seen. The watcher that drops a preview on shut stays.
 */
function runBuildAct(id: string, keys: readonly string[]): void {
    if ((id === 'build-generate' || id === 'build-generate-with') && !dossierShown.value && keys.length === 1) {
        openHex(keys[0]);
    }
    runBuild(id as BuildCommandId, keys);
}

/** A new many-hex selection: two or more are held; one is simply that hex; none is nothing. */
function selectKeys(keys: string[], anchor: string): void {
    if (build.preview || build.rolling) discardPreview();
    build.sheetOpen = false;
    build.error = '';
    if (keys.length <= 1) {
        build.selection = [];
        if (keys.length === 1) openHex(keys[0]);
        return;
    }
    build.selection = keys;
    // A hand-picked set has no hex address. One subsector, or one sector, is the pane.
    openScope(scopePath(keys, anchor));
}

function scopePath(keys: readonly string[], anchor: string): string {
    const places: { slug: string; hex: string }[] = [];
    for (const key of keys) {
        const place = parseHexKey(key);
        if (place) places.push(place);
    }
    if (!places.length) return route.path;
    const slug = places[0].slug;
    const oneSector = places.every((place) => place.slug === slug);
    const focus = parseHexKey(keys.includes(anchor) ? anchor : keys[keys.length - 1]);
    const sectorSlug = oneSector ? slug : (focus ? focus.slug : slug);
    if (oneSector) {
        const letters = new Set(places.map((place) => subsectorLetter(place.hex)));
        if (letters.size === 1) {
            const letter = [...letters][0];
            if (letter) return subsectorPath(sectorSlug, letter);
        }
    }
    return '/s/' + encodeURIComponent(sectorSlug);
}

function openScope(path: string): void {
    if (route.path === path && dossierShown.value) return;
    suppressFly = true;
    void router.push({ path, query: withQuery(route.query, { panel: null, record: null }) });
}

function canvasPoint(event: PointerEvent | MouseEvent): { x: number; y: number } | null {
    const el = canvasEl.value;
    if (!el || event.target !== el) return null;
    const box = el.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/**
 * Shift, or the Select hexes switch: the press belongs to the selection and the chart does
 * not pan. Taken in the capture phase, so the chart's own pointer handling never sees it.
 */
function onBuildDown(event: PointerEvent): void {
    if (!buildReady() || event.button !== 0 || !(event.shiftKey || build.selecting)) return;
    if (tierFor(cam.ppp) !== 'hex') return;
    const point = canvasPoint(event);
    if (!point || !canvasEl.value) return;
    event.stopPropagation();
    event.preventDefault();
    canvasEl.value.setPointerCapture(event.pointerId);
    canvasEl.value.focus();
    boxPointer = event.pointerId;
    boxRef.value = { x0: point.x, y0: point.y, x1: point.x, y1: point.y };
}

function onBuildMove(event: PointerEvent): void {
    const box = boxRef.value;
    if (!box || event.pointerId !== boxPointer || !canvasEl.value) return;
    const rect = canvasEl.value.getBoundingClientRect();
    boxRef.value = { x0: box.x0, y0: box.y0, x1: event.clientX - rect.left, y1: event.clientY - rect.top };
}

function onBuildUp(event: PointerEvent): void {
    const box = boxRef.value;
    if (!box || event.pointerId !== boxPointer) return;
    boxRef.value = null;
    boxPointer = -1;
    const held = pickedKeys();
    const moved = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) > 4;
    if (!moved) {
        const key = keyAt(cam, viewport(), box.x1, box.y1, sectorAt);
        if (key) selectKeys(toggleKey(held, key), key);
        return;
    }
    const inside = keysInBox(cam, viewport(), { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 }, sectorAt, SELECTION_CAP);
    const next = addKeys(held, inside);
    if (next.over) showToast('A selection holds at most ' + SELECTION_CAP.toLocaleString('en') + ' hexes.');
    if (inside.length) selectKeys(next.keys, inside[inside.length - 1]);
}

/** Right-click in Build: the acts for the hex under the pointer, or for the selection it is part of. */
function onBuildMenu(event: MouseEvent): void {
    if (!buildReady()) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    if (tierFor(cam.ppp) !== 'hex') return;
    const key = keyAt(cam, viewport(), point.x, point.y, sectorAt);
    if (!key) return;
    let keys = pickedKeys();
    if (!keys.includes(key)) {
        build.selection = [];
        openHex(key);
        keys = [key];
    }
    menuRef.value = { anchor: { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY }, keys };
}

const buildMenu = computed(() => (menuRef.value ? menuFor(menuRef.value.keys) : null));

function pickBuildMenu(id: string): void {
    const keys = menuRef.value ? menuRef.value.keys : [];
    closeBuildMenu();
    if (id !== 'build-edit') runBuildAct(id, keys);
}

function closeBuildMenu(): void {
    menuRef.value = null;
    if (canvasEl.value) canvasEl.value.focus();
}

function setStripWidth(px: number): void {
    if (!mapEl.value) return;
    if (px > 0) mapEl.value.style.setProperty('--build-strip', px + 8 + 'px');
    else mapEl.value.style.removeProperty('--build-strip');
}

function toggleBuild(): void {
    accountOpen.value = false;
    setBuildOn(!build.on);
}

// The switch itself is a command only where Build can be had; the acts only while it is on.
watch(buildOffered, (offered) => {
    if (unregisterBuild) unregisterBuild();
    unregisterBuild = offered
        ? registerCommand({ id: 'build', name: 'Build: on or off', keys: ['b'], run: () => { toggleBuild(); } })
        : null;
}, { immediate: true });

watch(() => build.on && buildOffered.value, (on) => {
    for (const remove of unregisterBuildActs) remove();
    unregisterBuildActs = on
        ? BUILD_COMMANDS.map((item) => registerCommand({
            id: item.id,
            name: item.name,
            ...(item.keys ? { keys: [...item.keys] } : {}),
            runnable: () => canBuild(item.id, actingKeys()),
            run: () => { runBuildAct(item.id, actingKeys()); },
        }))
        : [];
    if (!on) menuRef.value = null;
}, { immediate: true });

// Anything of the universe's map changed, or the selection did: the chart and the pane follow.
watch(
    () => {
        const store = buildStore();
        return [store ? store.tick() : 0, build.on, buildUniverse.value ? buildUniverse.value.id : '', build.selection.length, previewKey.value] as const;
    },
    () => {
        if (!chart) return;
        syncSelection();
        loadDossier();
        showStatus();
        markDirty();
    },
);

watch(marksEl, () => { markDirty(); });

// The pane was shut: a many-hex selection and a preview go with it.
watch(dossierShown, (shown) => {
    if (shown) return;
    if (build.selection.length) build.selection = [];
    if (build.preview || build.rolling) discardPreview();
    build.sheetOpen = false;
});

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
    const open = campaign.status === 'ready' && campaign.settings !== null;
    // A system can be located by anyone: the line is handed over with no campaign open, and signed out.
    if (!open && !locating.recordId) return null;
    // The party stands where its ship's track puts it at the campaign date (party_where.ts).
    const days = campaignDays(campaign.clock);
    const mark = open && campaign.settings ? partyMarker(campaign.settings.party, campaign.records, days) : null;
    return {
        party: mark ? { name: mark.name, hexKey: mark.hexKey, focused: false } : null,
        locate: locateLine(),
        reducedMotion: prefersReducedMotion(),
        vessels: open && campaign.settings ? vesselsOnMap(campaign.records, campaign.settings.party, days) : [],
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

/**
 * "Locate this system": the tracking line, the flight and the ring, for the system the panel
 * shows or last showed. Asked again while it runs, it stops. The line starts level with the
 * control that asked (the dossier's Locate button names this command), or with the panel's
 * heading when the command came from the keyboard.
 */
function locateSystem(): void {
    const world = panelWorld();
    if (!world) return;
    const hexKey = world.slug + '/' + world.hex;
    const subject = systemSubject(hexKey);
    if (locating.recordId === subject) {
        stopLocate();
        return;
    }
    startLocate(subject, hexKey, () => {
        const el = document.querySelector('.panel.is-open [data-command="locate-system"], .dossier-root .panel.is-open h1');
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return box.height > 0 ? box.top + box.height / 2 : null;
    });
}

/** The party's marker was pressed: the Party tab. */
function openParty(): void {
    if (shownPane.value.kind === 'party') return;
    accountOpen.value = false;
    suppressFly = true;
    void router.push(atPane(route.path, route.query, { kind: 'party' }));
}

/** A vessel's mark was pressed: that record in the campaign pane. */
function openVessel(id: string): void {
    accountOpen.value = false;
    suppressFly = true;
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: id }));
}

function holdsWorld(sx: number, sy: number, hhhh: string): boolean {
    if (!chart) return false;
    const sector = chart.sectors.find((item) => item.x === sx && item.y === sy && item.canonical);
    if (!sector) return false;
    if (tierFor(cam.ppp) === 'hex' && version) {
        const index = mapIndex(sector.slug);
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

/** U I O are the three neighbours above; N M , are the three below. Shift grows the selection. */
const NEIGHBOUR_KEY: Record<string, HexStep> = {
    KeyU: 'nw',
    KeyI: 'n',
    KeyO: 'ne',
    KeyN: 'sw',
    KeyM: 's',
    Comma: 'se',
};

function typingTarget(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!target || typeof target !== 'object') return false;
    const tag = 'tagName' in target ? String(target.tagName) : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return 'isContentEditable' in target && target.isContentEditable === true;
}

/** The hex a neighbour step leaves from: the last of a many-hex selection, else the one selected. */
function selectionAnchor(): string | null {
    if (build.selection.length) return build.selection[build.selection.length - 1];
    return selected ? selected.slug + '/' + selected.hhhh : null;
}

function neighbourOf(hexKey: string, step: HexStep): string | null {
    const place = parseHexKey(hexKey);
    if (!place) return null;
    const local = parseHex(place.hex);
    const sector = sectorOf(place.slug);
    if (!local || !sector) return null;
    const here = toGlobal(sector.x, sector.y, local.col, local.row);
    const stepped = stepGlobal(here.q, here.r, step);
    const next = fromGlobal(stepped.q, stepped.r);
    const slug = sectorAt(next.sx, next.sy);
    if (!slug) return null;
    return slug + '/' + formatHex(next.col, next.row);
}

function moveSelection(step: HexStep, grow: boolean): void {
    const anchor = selectionAnchor();
    if (!anchor) return;
    const key = neighbourOf(anchor, step);
    if (!key) return;
    if (!grow) {
        selectKeys([key], key);
        return;
    }
    const added = addKeys(pickedKeys(), [key]);
    if (added.over) showToast('A selection holds at most ' + SELECTION_CAP.toLocaleString('en') + ' hexes.');
    selectKeys(added.keys, key);
}

function onMapKey(event: KeyboardEvent): void {
    const step = NEIGHBOUR_KEY[event.code];
    if (step && buildReady() && selectionAnchor() && !event.ctrlKey && !event.altKey && !event.metaKey && !typingTarget(event)) {
        event.preventDefault();
        moveSelection(step, event.shiftKey);
        return;
    }
    handleKey(event);
}

/** The host paints the panes. This view only says what the dossier is showing. */
function publishFrame(): void {
    const state = dossier.value;
    const scope = state.kind === 'closed' ? addressedScope() : null;
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
            slug: placed ? placed.slug : (scope ? scope.slug : ''),
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

watch(
    () => {
        const id = campaign.status === 'ready' ? campaign.universeId : '';
        return [id ?? '', manifestRef.value ? manifestRef.value.seed : ''] as const;
    },
    () => {
        bound.sync();
        const scope = addressedScope();
        if (scope) bound.load(scope.slug);
    },
);

watch(() => route.path, () => {
    // A preview, the sheet and a failed roll's words belong to the hex they were asked on.
    const here = placeKey(dossierRoute(route.path));
    if ((build.preview && build.preview.hexKey !== here) || (build.rolling && build.rolling !== here)) discardPreview();
    if (build.selection.length <= 1) {
        build.sheetOpen = false;
        build.error = '';
    }
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
    if (unregisterLocate) unregisterLocate();
    if (unregisterBuild) unregisterBuild();
    for (const remove of unregisterBuildActs) remove();
    setBuildMap(null);
    bound.close();
    setPlaceSource(null);
    setFrame(null);
    if (locating.recordId) stopLocate();
});
</script>

<template>
  <div
    ref="mapEl"
    class="map"
    @keydown="onMapKey"
    @pointerdown.capture="onBuildDown"
    @pointermove.capture="onBuildMove"
    @pointerup.capture="onBuildUp"
    @pointercancel.capture="onBuildUp"
    @contextmenu="onBuildMenu"
  >
    <canvas ref="canvasEl" tabindex="0" :class="{ 'is-selecting': build.on && build.selecting }"></canvas>
    <BuildMarks
      v-if="build.on && buildUniverse"
      ref="marksEl"
      :many="manyKeys"
      :preview="previewKey"
      :removed="removedKeys"
      :sector-of="sectorOf"
      :box="boxRef"
    />
    <Rail
      ref="railEl"
      :panel-open="dossierShown"
      :search-open="omniOpen"
      :campaign-open="campaignOpen"
      :account-open="accountOpen"
      :build-offered="buildOffered"
      :build-on="build.on && buildOffered"
    />
    <BuildStrip
      v-if="build.on && buildUniverse"
      :name="buildUniverse.name"
      :truth-version="buildUniverse.truthVersion"
      @clear="build.selection = []"
      @width="setStripWidth"
    />
    <BuildMenu v-if="menuRef && buildMenu" :title="buildMenu.title" :items="buildMenu.items" :anchor="menuRef.anchor" @pick="pickBuildMenu" @close="closeBuildMenu" />
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
/* Select hexes is on: a drag draws a box. */
.map > canvas.is-selecting {
  cursor: crosshair;
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
  --toast-right: calc(var(--chrome-inset) + var(--build-strip, 0px));
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

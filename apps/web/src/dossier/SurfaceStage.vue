<script setup lang="ts">
/**
 * The surface-map lead of a dossier (legacy worldMapLead, js/system_inspector.js:541-624):
 * the 800×400 sheet of a body, in the legacy stage's 2:1 frame with its caption row.
 *
 * The flow is the legacy one. The blank is drawn at once; a beam sweeps down and back up
 * while the surface worker paints; when the sheet is ready the pass in hand finishes, then
 * the sheet fades in as the scan dissolves. A body seen before paints from the cache with no
 * scan. Changing body cancels the request in flight, and a result that arrives late is never
 * painted. Under reduced motion there is no beam: the blank, then the sheet.
 *
 * Vanilla: the diamond sheet (surface/vanilla/map.ts) and its overlay, untouched.
 * Enhanced: the hybrid hex map (surface/hybrid). Its painted sheet is put on the canvas
 * untouched; over it lie two layers of their own: the marks and, when chosen, the symbol
 * overlay (icons from the active icon set), and the day and night shadow, which follows the
 * shared clock (orbit/sim_clock.ts) and never changes the sheet's pixels. The time bar under
 * the map steers that clock. Seeds are the service's business; this file builds none.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Icon from '../design/Icon.vue';
import { cancelFrame, createCanvas, devicePixelRatio, fetchJson, loadImageAsync, nextFrame, now, prefersReducedMotion } from '../platform/browser.ts';
import { hybridCaption, sheetCaption } from '../surface/caption.ts';
import type { SurfaceMode } from '../surface/contracts.ts';
import { CONTINENTAL_DEFINITION, COASTLINE_COMPLEXITY, canMapWorld, worldMapData } from '../surface/identity.ts';
import {
    dayNightOverlay, enhancedFlags, iconSetName, mapStyle, onDayNightOverlay, onMapStyle, onSurfaceMode, setDayNightOverlay, setMapStyle, surfaceMode, type MapStyle,
} from '../surface/preferences.ts';
import { cancelSurface, hybridInputsFor, requestMap } from '../surface/service.ts';
import { SURFACE_WEBGL_NOTICE, webglMissing } from '../surface/webgl_notice.ts';
import { drawMapOverlay, renderDiamondBlank } from '../surface/vanilla/map.ts';
import { iconPaint, loadIconSet, type IconImage, type IconSet, type Tinter } from '../surface/hybrid/icons.ts';
import { drawSunMark, drawTerminus } from '../surface/hybrid/chrome.ts';
import { LARGE_SHEET, SHEET_LAYOUT, sheetPoint } from '../surface/hybrid/field.ts';
import { hexSpacing } from '../surface/hybrid/grid.ts';
import { hybridModel } from '../surface/hybrid/index.ts';
import type { HybridModel } from '../surface/hybrid/model.ts';
import { createDayNightLayer, type DayNightLayer, type LayerCtx, type LayerHost } from '../surface/hybrid/daynight_layer.ts';
import { frameDue } from '../surface/hybrid/motion.ts';
import { mapSun, netClipPath, netOutline } from '../surface/hybrid/stage.ts';
import { CODE_TABLE, type SurfaceCode } from '../surface/hybrid/codes.ts';
import { drawMarks, drawSymbols, symbolOf } from '../surface/hybrid/symbols.ts';
import { FIT_VIEW, hexCssPx, maxZoom, panBy, zoomAbout, ZOOM_KEY, ZOOM_NOTCH_PX, ZOOM_WHEEL, type MapView } from '../surface/hybrid/view.ts';
import { clockDays, clockJumps, offerStart, simClock, subscribeSimClock } from '../orbit/sim_clock.ts';
import { portTimeText, type Subsolar } from '../orbit/sun.ts';
import { wrapFocus } from '../workspace/focus_trap.ts';
import SurfaceKey from './SurfaceKey.vue';
import SurfaceTimeBar from './SurfaceTimeBar.vue';

export type SurfaceTarget = {
    /** The full released hex key, `Spinward_Marches/1910`. */
    hexKey: string;
    dossierKey: string;
    /** The body as the released document holds it. */
    body: Record<string, unknown>;
};

const props = defineProps<{
    badge: string;
    /** The body to map, or null when there is none. A body the legacy rule rejects shows nothing. */
    target: SurfaceTarget | null;
    /** Where the star stands over this body on a date (orbit/sun.ts), or null when unknown. */
    sun?: ((days: number) => Subsolar | null) | null;
    /** Now: the campaign date in days (the view's date when there is no campaign). */
    nowDays?: number;
    /** Where the shared clock starts when nothing has set it yet: the view's date. */
    startDays?: number;
}>();

/** waiting: the worker is painting. ready: painted, the beam finishing its pass. revealing: fading in. full: shown. */
type State = 'waiting' | 'ready' | 'revealing' | 'full';

const sheetEl = ref<HTMLCanvasElement | null>(null);
const marksEl = ref<HTMLCanvasElement | null>(null);
const shadowEl = ref<HTMLCanvasElement | null>(null);
const glowEl = ref<HTMLCanvasElement | null>(null);
const figureEl = ref<HTMLElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const dialogEl = ref<HTMLElement | null>(null);
const expandBtn = ref<HTMLButtonElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
/** The large map uses the whole window, on the same stage, the same clock, and the same layers. */
const large = ref(false);
/** Column height held while the figure is on the body, so the dossier does not jump. */
const holdPx = ref(0);
/** Drawn width of the figure, in CSS pixels. Labels and the grid stroke follow it. */
const viewPx = ref(0);
/** Zoom and pan of the large map. The column stays at fit. */
const mapView = ref<MapView>(FIT_VIEW);
/** Legend row under the pointer or keyboard focus. */
const highlight = ref<SurfaceCode | null>(null);
/** Name of the hex under the pointer, or the keyboard cursor. */
const picked = ref('');
const cursorId = ref<number | null>(null);
/** On-screen width of one hex, in CSS pixels. The scale sentence does not change with zoom. */
const hexBar = ref(0);
const blankEl = ref<HTMLCanvasElement | null>(null);
const state = ref<State>('waiting');
const beam = ref<'scan-down' | 'scan-up'>('scan-down');
/** Flips each time a cached sheet arrives, so its fade runs again. */
const arrival = ref<'' | 'arrive-a' | 'arrive-b'>('');
/** Cold timings of the last sheet, for measuring: data attributes on the figure. */
const timing = ref<{ sheet: string; worker: string; chunk: string; cached: string }>({ sheet: '', worker: '', chunk: '', cached: '' });

/** The mode in force: the device's preference, followed while this is on screen. */
const mode = ref<SurfaceMode>(surfaceMode());
/** Empty when this browser can paint WebGL. The map itself is a 2D canvas and still paints. */
const webglNotice = webglMissing() ? SURFACE_WEBGL_NOTICE : '';
const mappable = computed(() => props.target !== null && canMapWorld(props.target.body));
/** Which painter drew the sheet and, in enhanced, what its sea is; the reason is the tooltip. */
const style = ref<MapStyle>(mapStyle());
/** The hybrid model of the body shown (enhanced mode), built on the page for the overlays. */
const model = shallowRef<HybridModel | null>(null);
const iconSet = shallowRef<IconSet | null>(null);
/** The day and night overlay is shown (a device preference, like Symbols). */
const dayNight = ref<boolean>(dayNightOverlay());
/** The clock runs fast enough for the day-averaged shading. */
const averagedShown = ref(false);
const portTime = ref<string | null>(null);
const hybrid = computed(() => mode.value === 'enhanced' && model.value !== null);
const caption = computed(() => (hybrid.value && model.value
    ? hybridCaption(model.value)
    : sheetCaption(mode.value, props.target ? props.target.body : null)));
/** Enhanced large view bakes 1600 × 800. Vanilla stays 800 × 400 and scales in CSS. */
const activeLayout = computed(() => (large.value && mode.value === 'enhanced' ? LARGE_SHEET : SHEET_LAYOUT));
const sheetW = computed(() => activeLayout.value.width);
const sheetH = computed(() => activeLayout.value.height);
const clipPath = computed(() => (mode.value === 'enhanced' ? netClipPath(activeLayout.value) : undefined));
const scaleText = computed(() => {
    const m = model.value;
    if (!m || mode.value !== 'enhanced') return '';
    const km = (m.world.diamKm / 2) * hexSpacing(m.grid.n);
    return '1 hex ≈ ' + Math.round(km).toLocaleString('en-US') + ' km';
});
const zoomStyle = computed(() => {
    if (!large.value) return undefined;
    const v = mapView.value;
    return { transform: 'translate(' + v.x + 'px, ' + v.y + 'px) scale(' + v.zoom + ')' };
});
const nowDays = computed(() => (typeof props.nowDays === 'number' && Number.isFinite(props.nowDays) ? props.nowDays : clockDays()));
const worldName = computed(() => {
    const name = props.target ? props.target.body.name : '';
    return typeof name === 'string' && name.trim() ? name.trim() : 'this world';
});

let token = 0;
let requestId: string | null = null;
let shown: SurfaceTarget | null = null;
let shownMode: SurfaceMode | null = null;
let shownWidth = 0;
let returnTo: HTMLElement | null = null;
let resizeObs: ResizeObserver | null = null;
let stopMode: (() => void) | null = null;
let stopStyle: (() => void) | null = null;
let stopClock: (() => void) | null = null;
let stopDayNight: (() => void) | null = null;
let layer: DayNightLayer | null = null;
let raf = 0;
let lastDrawn: number | null = null;
let seenJumps = clockJumps();
let lastArrival: 'arrive-a' | 'arrive-b' = 'arrive-b';

/** The same body of the same hex: nothing to redo when the panel merely re-renders. */
function same(a: SurfaceTarget | null, b: SurfaceTarget | null): boolean {
    if (a === null || b === null) return a === b;
    return a.hexKey === b.hexKey && a.dossierKey === b.dossierKey && a.body === b.body;
}

function drop(): void {
    warmGen += 1;
    token += 1;
    if (requestId) cancelSurface(requestId);
    requestId = null;
}

function fitCanvas(canvas: HTMLCanvasElement | null, w: number, h: number): void {
    if (!canvas) return;
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
}

function clearSheet(): void {
    const layout = activeLayout.value;
    fitCanvas(sheetEl.value, layout.width, layout.height);
    const canvas = sheetEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (ctx) ctx.clearRect(0, 0, layout.width, layout.height);
}

/**
 * The painter's pixels, exactly as painted; then, for vanilla, the vanilla overlay (hex grid
 * and lobe edges). The hybrid sheet has no overlay of its own: its layers are drawn apart.
 */
function paint(pixels: Uint8ClampedArray, body: Record<string, unknown>): boolean {
    const canvas = sheetEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return false;
    const layout = activeLayout.value;
    if (pixels.length !== layout.width * layout.height * 4) return false;
    fitCanvas(canvas, layout.width, layout.height);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, layout.width, layout.height), 0, 0);
    if (mode.value === 'vanilla') drawMapOverlay(ctx, worldMapData(body));
    drawLayers();
    return true;
}

// ---- Hybrid layers: marks and symbols, and the shadow ----------------------------------

const tinted = new Map<IconImage, Map<string, IconImage>>();

/** A recoloured copy of an icon, made once per colour. */
const tint: Tinter = (image, colour) => {
    let byColour = tinted.get(image);
    if (!byColour) {
        byColour = new Map();
        tinted.set(image, byColour);
    }
    const held = byColour.get(colour);
    if (held) return held;
    const size = 64;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.drawImage(image as CanvasImageSource, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, size, size);
    byColour.set(colour, canvas);
    return canvas;
};

function stageBox(): { w: number; h: number } {
    const stage = stageEl.value;
    return { w: stage ? stage.clientWidth : 0, h: stage ? stage.clientHeight : 0 };
}

function viewLimit(): number {
    const m = model.value;
    const box = stageBox();
    const layout = activeLayout.value;
    if (!m || !box.w) return 1;
    return maxZoom(box.w, layout.width, layout.side, m.grid.n);
}

function applyView(next: MapView): void {
    const box = stageBox();
    if (!large.value || !box.w) {
        mapView.value = FIT_VIEW;
    } else {
        const zoom = Math.min(Math.max(1, next.zoom), viewLimit());
        mapView.value = panBy({ zoom, x: next.x, y: next.y }, box.w, box.h, 0, 0);
    }
    drawLayers();
}

function drawLayers(): void {
    const layout = activeLayout.value;
    const canvas = marksEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx || !canvas) return;
    const box = stageBox();
    const dpr = devicePixelRatio();
    const sw = box.w || layout.width;
    const sh = box.h || layout.height;
    fitCanvas(canvas, Math.max(1, Math.round(sw * dpr)), Math.max(1, Math.round(sh * dpr)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const m = model.value;
    if (!hybrid.value || !m) return;
    const zoom = large.value ? mapView.value.zoom : 1;
    const ox = large.value ? mapView.value.x : 0;
    const oy = large.value ? mapView.value.y : 0;
    const cssPerSheet = (sw / layout.width) * zoom;
    const scale = cssPerSheet * dpr;
    ctx.setTransform(scale, 0, 0, scale, ox * dpr, oy * dpr);
    const began = now();
    const oneCss = 1 / Math.max(cssPerSheet, 0.001);
    const hexCss = hexCssPx(sw, layout.width, layout.side, m.grid.n, zoom);
    const iconCss = Math.min(14, Math.max(8, hexCss * 0.45));
    const symbols = style.value === 'symbols';
    drawSymbols(ctx, m, layout, {
        set: iconSet.value,
        tint,
        icons: symbols,
        outlineWidth: oneCss,
        iconRadius: iconCss * oneCss,
        highlight: highlight.value,
    });
    const fontPx = 12 * oneCss;
    const gap = 16 * oneCss;
    drawMarks(ctx, m, layout, { graticule: false, ring: false, scale: false, font: fontPx + 'px sans-serif', labelGap: gap });
    if (dayNight.value) {
        const sub = props.sun ? props.sun(nowDays.value) : null;
        const pose = mapSun(m, sub, simClock.playing, simClock.rate);
        if (pose.sun) {
            drawTerminus(ctx, m.grid, layout, pose.sun, oneCss);
            drawSunMark(ctx, layout, pose.sun, 6 * oneCss);
        }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (figureEl.value) {
        figureEl.value.dataset.symbolsMs = (now() - began).toFixed(2);
        figureEl.value.dataset.gridPx = (oneCss * cssPerSheet * dpr).toFixed(2);
        figureEl.value.dataset.zoom = zoom.toFixed(2);
        figureEl.value.dataset.hexPx = hexCss.toFixed(1);
    }
    hexBar.value = Math.round(hexCss);
}

function sheetFromStage(sx: number, sy: number): [number, number] | null {
    const layout = activeLayout.value;
    const box = stageBox();
    if (!box.w || !box.h) return null;
    const zoom = large.value ? mapView.value.zoom : 1;
    const ox = large.value ? mapView.value.x : 0;
    const oy = large.value ? mapView.value.y : 0;
    const u = (sx - ox) / (box.w * zoom);
    const v = (sy - oy) / (box.h * zoom);
    return [u * layout.width, v * layout.height];
}

function nameHex(id: number): void {
    const m = model.value;
    if (!m) return;
    const hex = m.hexes[id];
    if (!hex) return;
    const code = symbolOf(hex) ?? hex.terrain;
    picked.value = CODE_TABLE[code] ? CODE_TABLE[code].name : '';
    cursorId.value = id;
}

function pickAt(sx: number, sy: number): void {
    const m = model.value;
    const at = sheetFromStage(sx, sy);
    if (!m || !at) return;
    const layout = activeLayout.value;
    let best = -1;
    let bestD = Infinity;
    const limit = (layout.side / m.grid.n) * 0.7;
    for (let id = 0; id < m.grid.count; id += 1) {
        const p = sheetPoint(layout, m.grid.P[id]);
        const d = (p[0] - at[0]) * (p[0] - at[0]) + (p[1] - at[1]) * (p[1] - at[1]);
        if (d < bestD) {
            bestD = d;
            best = id;
        }
    }
    if (best < 0 || bestD > limit * limit) {
        picked.value = '';
        return;
    }
    nameHex(best);
}

/** What the day and night layer needs from the page: canvases, ImageData, the motion setting. */
function layerHost(): LayerHost {
    return {
        reducedMotion: prefersReducedMotion(),
        canvas(width, height) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            return ctx ? { canvas, ctx: ctx as unknown as LayerCtx } : null;
        },
        imageData: (pixels, width, height) => new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height),
    };
}

/**
 * One frame of the day and night layer (requestAnimationFrame). It keeps asking for frames
 * while the clock runs, a jump is travelling or a crossfade is under way, then rests: a
 * stopped clock costs nothing. Under reduced motion a running clock is drawn once a second.
 */
function frame(time: number): void {
    raf = 0;
    const m = model.value;
    const shadowCtx = shadowEl.value ? shadowEl.value.getContext('2d') : null;
    const glowCtx = glowEl.value ? glowEl.value.getContext('2d') : null;
    if (!m || !hybrid.value || !dayNight.value || !shadowCtx || !glowCtx) return;
    if (!layer) layer = createDayNightLayer(layerHost());
    const reduced = prefersReducedMotion();
    if (simClock.playing && !frameDue(lastDrawn, time, reduced)) {
        raf = nextFrame(frame);
        return;
    }
    const days = clockDays();
    const sub = props.sun ? props.sun(days) : null;
    const jumps = clockJumps();
    const jumped = jumps !== seenJumps;
    seenJumps = jumps;
    const began = now();
    const layout = activeLayout.value;
    fitCanvas(shadowEl.value, layout.width, layout.height);
    fitCanvas(glowEl.value, layout.width, layout.height);
    const out = layer.draw({ model: m, sub, playing: simClock.playing, rate: simClock.rate, jumped, nowMs: time }, shadowCtx as unknown as LayerCtx, glowCtx as unknown as LayerCtx, layout);
    if (figureEl.value) figureEl.value.dataset.overlayMs = (now() - began).toFixed(2);
    lastDrawn = time;
    const local = sub && !out.still ? portTimeText(sub) : null;
    if (local !== portTime.value) portTime.value = local;
    if (out.averaged !== averagedShown.value) averagedShown.value = out.averaged;
    if (out.busy) raf = nextFrame(frame);
}

/** Ask for a frame of the day and night layer (once; a frame in hand covers it). */
function wake(): void {
    if (!raf && dayNight.value && hybrid.value) raf = nextFrame(frame);
}

function rest(): void {
    if (raf) cancelFrame(raf);
    raf = 0;
}

function toggleDayNight(): void {
    setDayNightOverlay(!dayNight.value);
}

function drawBlankNet(canvas: HTMLCanvasElement): void {
    const layout = activeLayout.value;
    fitCanvas(canvas, layout.width, layout.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const outline = netOutline(layout);
    ctx.fillStyle = iconPaint('--surface-net-fill');
    ctx.strokeStyle = iconPaint('--surface-net-stroke');
    ctx.lineWidth = 1;
    ctx.beginPath();
    outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

let warmGen = 0;

/**
 * Decode and rasterise the icon set after the sheet is on screen, on a later frame, so the
 * first Symbols click draws icons that are already decoded.
 */
function scheduleIconWarm(): void {
    if (mode.value !== 'enhanced') return;
    const mine = ++warmGen;
    if (figureEl.value) figureEl.value.dataset.icons = 'waiting';
    nextFrame(() => {
        nextFrame(() => {
            if (mine !== warmGen || mode.value !== 'enhanced') return;
            void warmIcons(mine);
        });
    });
}

async function warmIcons(mine: number): Promise<void> {
    if (figureEl.value && figureEl.value.dataset.icons !== 'ready') figureEl.value.dataset.icons = 'loading';
    const set = await loadIconSet(iconSetName(), { fetchJson, loadImage: loadImageAsync });
    if (mine !== warmGen) return;
    const scratch = createCanvas(64, 64);
    const ctx = scratch.getContext('2d');
    if (ctx) {
        for (const image of set.images.values()) {
            const decodable = image as HTMLImageElement;
            if (typeof decodable.decode === 'function') {
                try { await decodable.decode(); } catch { /* the draw below still rasterises it */ }
            }
            if (mine !== warmGen) return;
            ctx.clearRect(0, 0, 64, 64);
            ctx.drawImage(image as CanvasImageSource, 0, 0, 64, 64);
        }
    }
    if (mine !== warmGen) return;
    iconSet.value = set;
    if (figureEl.value) figureEl.value.dataset.icons = 'ready';
}

function loadIcons(): void {
    if (style.value !== 'symbols' || mode.value !== 'enhanced') return;
    const name = iconSetName();
    if (iconSet.value && iconSet.value.name === name) return;
    void loadIconSet(name, { fetchJson, loadImage: loadImageAsync }).then((set) => {
        iconSet.value = set;
        drawLayers();
    });
}

function toggleStyle(): void {
    setMapStyle(style.value === 'symbols' ? 'painted' : 'symbols');
}

function start(): void {
    const target = props.target;
    const width = activeLayout.value.width;
    if (same(target, shown) && shownMode === mode.value && shownWidth === width && requestId !== null) return;
    drop();
    shown = target;
    shownMode = mode.value;
    shownWidth = width;
    if (!target || !mappable.value) return;
    const mine = token;
    // Nothing of the last body may show under the new one.
    clearSheet();
    arrival.value = '';
    const options = { continentalDefinition: CONTINENTAL_DEFINITION, coastlineComplexity: COASTLINE_COMPLEXITY, flags: enhancedFlags() };
    if (mode.value === 'enhanced') {
        const world = hybridInputsFor({ hexKey: target.hexKey, dossierKey: target.dossierKey, body: target.body, options });
        model.value = world ? hybridModel(world) : null;
    } else {
        model.value = null;
    }
    if (layer) layer.reset();
    lastDrawn = null;
    drawLayers();
    wake();
    if (blankEl.value) {
        if (mode.value === 'enhanced') drawBlankNet(blankEl.value);
        else renderDiamondBlank(blankEl.value, worldMapData(target.body));
    }
    const ticket = requestMap({
        mode: mode.value,
        hexKey: target.hexKey,
        dossierKey: target.dossierKey,
        body: target.body,
        resolution: { width: activeLayout.value.width, height: activeLayout.value.height },
        options,
    });
    requestId = ticket.requestId;
    if (ticket.status === 'sheet' && ticket.pixels) {
        // Seen before: straight from the cache, no scan.
        if (paint(ticket.pixels, target.body)) {
            state.value = 'full';
            lastArrival = lastArrival === 'arrive-a' ? 'arrive-b' : 'arrive-a';
            arrival.value = lastArrival;
            timing.value = { sheet: '0', worker: '', chunk: '0', cached: 'true' };
            scheduleIconWarm();
        }
        return;
    }
    state.value = 'waiting';
    beam.value = 'scan-down';
    void ticket.done.then((sheet) => {
        // A late answer for a body the visitor has left is dropped here as well as in the service.
        if (mine !== token || !sheet) return;
        if (!paint(sheet.pixels, target.body)) return;
        timing.value = {
            sheet: sheet.sheetMs.toFixed(1),
            worker: sheet.workerStartMs === null ? '' : sheet.workerStartMs.toFixed(1),
            chunk: sheet.longestChunkMs.toFixed(1),
            cached: String(sheet.fromCache),
        };
        // No beam to wait for under reduced motion: the sheet simply appears.
        state.value = prefersReducedMotion() ? 'full' : 'ready';
        scheduleIconWarm();
    });
}

/** One pass of the beam has ended: reveal a sheet that is ready, or turn round and sweep again. */
function onBeamEnd(): void {
    if (state.value === 'ready') {
        state.value = 'revealing';
        return;
    }
    if (state.value === 'waiting') beam.value = beam.value === 'scan-down' ? 'scan-up' : 'scan-down';
}

function onSheetEnd(): void {
    if (state.value === 'revealing') state.value = 'full';
}

function noteWidth(): void {
    const width = figureEl.value ? figureEl.value.clientWidth : 0;
    if (width && width !== viewPx.value) viewPx.value = width;
    if (large.value) applyView(mapView.value);
    else drawLayers();
}

/** Controls Tab can reach while the large map is open. */
function stops(): HTMLElement[] {
    const root = dialogEl.value;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>('button, [tabindex="0"], select, input, textarea')].filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
}

function holdFocus(event: FocusEvent): void {
    if (!large.value) return;
    const root = dialogEl.value;
    if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
    const list = stops();
    if (list.length) list[0].focus();
}

function onDialogKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        if (!large.value) return;
        event.preventDefault();
        event.stopPropagation();
        closeLarge();
        return;
    }
    if (!large.value || event.key !== 'Tab') return;
    const list = stops();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = wrapFocus(list.length, at, event.shiftKey);
    if (next !== null) {
        event.preventDefault();
        list[next].focus();
    }
    event.stopPropagation();
}

function localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const stage = stageEl.value;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function zoomAtPoint(sx: number, sy: number, factor: number): void {
    const box = stageBox();
    if (!box.w) return;
    applyView(zoomAbout(mapView.value, box.w, box.h, sx, sy, factor, viewLimit()));
}

function zoomBy(factor: number): void {
    const box = stageBox();
    zoomAtPoint(box.w / 2, box.h / 2, factor);
}

function fitMap(): void {
    applyView(FIT_VIEW);
}

function stepCursor(dLat: number, dLon: number): void {
    const m = model.value;
    if (!m) return;
    const id = cursorId.value ?? 0;
    const lat = m.grid.lat[id];
    const lon = m.grid.lon[id];
    let best = id;
    let score = 0;
    for (const nb of m.grid.nb[id]) {
        const s = dLat * (m.grid.lat[nb] - lat) + dLon * (m.grid.lon[nb] - lon);
        if (s > score) {
            score = s;
            best = nb;
        }
    }
    nameHex(best);
    drawLayers();
}

function onStageKey(event: KeyboardEvent): void {
    if (!large.value || event.target !== stageEl.value) return;
    const box = stageBox();
    const pan = !event.shiftKey && mapView.value.zoom > 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (pan) {
            const dx = event.key === 'ArrowLeft' ? box.w * 0.15 : event.key === 'ArrowRight' ? -box.w * 0.15 : 0;
            const dy = event.key === 'ArrowUp' ? box.h * 0.15 : event.key === 'ArrowDown' ? -box.h * 0.15 : 0;
            applyView(panBy(mapView.value, box.w, box.h, dx, dy));
        } else {
            const dLon = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
            const dLat = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
            stepCursor(dLat, dLon);
        }
        return;
    }
    if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomBy(ZOOM_KEY);
    } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomBy(1 / ZOOM_KEY);
    } else if (event.key === '0') {
        event.preventDefault();
        fitMap();
    }
}

let pointers = new Map<number, { x: number; y: number }>();
let dragLast: { x: number; y: number } | null = null;
let pinchStart: { dist: number; zoom: number; x: number; y: number } | null = null;

function onStageWheel(event: WheelEvent): void {
    if (!large.value) return;
    event.preventDefault();
    const point = localPoint(event);
    let pixels = event.deltaY;
    if (event.deltaMode === 1) pixels *= 16;
    else if (event.deltaMode === 2) pixels *= stageBox().h;
    const factor = Math.pow(ZOOM_WHEEL, -pixels / ZOOM_NOTCH_PX);
    zoomAtPoint(point.x, point.y, factor);
}

function onStageDown(event: PointerEvent): void {
    if (!large.value || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button')) return;
    const point = localPoint(event);
    pointers.set(event.pointerId, point);
    stageEl.value?.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        pinchStart = { dist, zoom: mapView.value.zoom, x: mapView.value.x, y: mapView.value.y };
        dragLast = null;
        return;
    }
    dragLast = point;
    pinchStart = null;
}

function onStageMove(event: PointerEvent): void {
    const point = localPoint(event);
    if (!large.value) {
        pickAt(point.x, point.y);
        return;
    }
    // A move with the button up is a hover. A missed pointer-up must not keep the drag.
    if (event.buttons === 0) {
        pointers.clear();
        dragLast = null;
        pinchStart = null;
    } else if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, point);
    }
    if (pointers.size >= 2 && pinchStart) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const box = stageBox();
        const zoomed = zoomAbout(
            { zoom: pinchStart.zoom, x: pinchStart.x, y: pinchStart.y },
            box.w, box.h, mid.x, mid.y, dist / pinchStart.dist, viewLimit(),
        );
        applyView(zoomed);
        return;
    }
    if (dragLast && pointers.size === 1) {
        const box = stageBox();
        applyView(panBy(mapView.value, box.w, box.h, point.x - dragLast.x, point.y - dragLast.y));
        dragLast = point;
        return;
    }
    pickAt(point.x, point.y);
}

function onStageUp(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) dragLast = null;
    else if (pointers.size === 1) dragLast = [...pointers.values()][0];
}

function onStageDouble(event: MouseEvent): void {
    if (!large.value) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button')) return;
    const point = localPoint(event);
    zoomAtPoint(point.x, point.y, ZOOM_KEY);
}

function openLarge(): void {
    if (large.value) return;
    holdPx.value = figureEl.value ? figureEl.value.offsetHeight : 0;
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : expandBtn.value;
    mapView.value = FIT_VIEW;
    large.value = true;
    document.addEventListener('focusin', holdFocus);
    void nextTick(() => {
        closeBtn.value?.focus();
        noteWidth();
        start();
    });
}

function closeLarge(): void {
    if (!large.value) return;
    large.value = false;
    mapView.value = FIT_VIEW;
    highlight.value = null;
    document.removeEventListener('focusin', holdFocus);
    void nextTick(() => {
        const back = returnTo && returnTo.isConnected ? returnTo : expandBtn.value;
        back?.focus();
        noteWidth();
        start();
    });
}

watch(() => props.target, start, { flush: 'post' });
watch(() => props.sun, wake);
watch(() => [simClock.playing, simClock.rate], wake);
watch(hybrid, wake);
onMounted(() => {
    mode.value = surfaceMode();
    offerStart(typeof props.startDays === 'number' ? props.startDays : nowDays.value);
    stopStyle = onMapStyle((next) => {
        style.value = next;
        loadIcons();
        drawLayers();
    });
    stopClock = subscribeSimClock(wake);
    stopDayNight = onDayNightOverlay((on) => {
        dayNight.value = on;
        // Off: the layer fades out holding its last frame, then rests. On: a fresh frame fades in.
        if (on) wake();
        else rest();
    });
    loadIcons();
    // The Surfaces command switches the mode for the device: the sheet in view is painted again.
    stopMode = onSurfaceMode((next) => {
        mode.value = next;
        start();
        loadIcons();
    });
    start();
    if (typeof ResizeObserver !== 'undefined' && figureEl.value) {
        resizeObs = new ResizeObserver(() => noteWidth());
        resizeObs.observe(figureEl.value);
        if (stageEl.value) resizeObs.observe(stageEl.value);
        noteWidth();
    }
    stageEl.value?.addEventListener('wheel', onStageWheel, { passive: false });
});
onBeforeUnmount(() => {
    if (stopMode) stopMode();
    if (stopStyle) stopStyle();
    if (stopClock) stopClock();
    if (stopDayNight) stopDayNight();
    if (resizeObs) resizeObs.disconnect();
    stageEl.value?.removeEventListener('wheel', onStageWheel);
    document.removeEventListener('focusin', holdFocus);
    rest();
    drop();
});
watch(highlight, () => drawLayers());
</script>

<template>
  <div v-if="mappable" class="doss-map-slot">
  <div v-if="large" class="doss-map-hold" :style="{ height: holdPx + 'px' }"></div>
  <Teleport to="body" :disabled="!large">
  <div
    ref="dialogEl"
    class="doss-map-frame"
    :class="{ 'is-large': large }"
    :role="large ? 'dialog' : undefined"
    :aria-modal="large ? 'true' : undefined"
    :aria-label="large ? 'Surface map' : undefined"
    @keydown="onDialogKey"
  >
  <div v-if="large" class="doss-map-scrim" @click="closeLarge"></div>
  <div class="doss-map-card">
  <div class="doss-map-body">
  <figure
    ref="figureEl"
    class="doss-map"
    :data-state="state"
    :data-mode="mode"
    :data-large="large ? 'true' : 'false'"
    :data-map-css="viewPx"
    :aria-busy="state === 'waiting' || state === 'ready' ? 'true' : undefined"
    :data-sheet-ms="timing.sheet"
    :data-worker-start-ms="timing.worker"
    :data-longest-chunk-ms="timing.chunk"
    :data-from-cache="timing.cached"
    :data-webgl="webglNotice ? 'off' : 'on'"
  >
    <div
      ref="stageEl"
      class="doss-stage"
      :tabindex="large ? 0 : undefined"
      :aria-label="large ? 'Surface map. Plus and minus zoom, 0 fits, arrows pan.' : undefined"
      @pointerdown="onStageDown"
      @pointermove="onStageMove"
      @pointerup="onStageUp"
      @pointercancel="onStageUp"
      @dblclick="onStageDouble"
      @keydown="onStageKey"
    >
      <div class="doss-zoom" :style="zoomStyle">
        <canvas
          ref="sheetEl"
          class="doss-sheet"
          :class="arrival"
          :width="sheetW"
          :height="sheetH"
          role="img"
          :aria-label="'Surface map of ' + worldName"
          @animationend="onSheetEnd"
        />
        <div class="doss-stage-daynight" :data-on="dayNight && hybrid ? 'true' : 'false'" aria-hidden="true">
          <canvas ref="shadowEl" class="doss-layer doss-shadow" :width="sheetW" :height="sheetH" />
          <canvas ref="glowEl" class="doss-layer doss-glow" :width="sheetW" :height="sheetH" />
        </div>
      </div>
      <canvas ref="marksEl" class="doss-layer doss-marks" aria-hidden="true" />
      <div v-if="large" class="doss-zoom-tools" role="group" aria-label="Zoom">
        <button type="button" class="ui-btn is-icon" aria-label="Zoom in" title="Zoom in" @click="zoomBy(ZOOM_KEY)">
          <Icon name="plus" :size="13" />
        </button>
        <button type="button" class="ui-btn is-icon" aria-label="Zoom out" title="Zoom out" @click="zoomBy(1 / ZOOM_KEY)">
          <span aria-hidden="true">−</span>
        </button>
        <button type="button" class="ui-btn is-icon doss-fit" aria-label="Fit the map" title="Fit the map" @click="fitMap">
          <span>Fit</span>
        </button>
      </div>
      <div v-show="state !== 'full'" class="doss-scan" aria-hidden="true">
        <canvas ref="blankEl" class="doss-blank" :width="sheetW" :height="sheetH" />
        <div class="doss-scan-field" :style="clipPath ? { clipPath } : undefined">
          <div class="doss-scan-beam" :class="beam" @animationend="onBeamEnd"></div>
        </div>
      </div>
    </div>
    <p v-if="scaleText" class="doss-scale">
      <span class="doss-scale-bar" :style="{ width: hexBar + 'px' }" aria-hidden="true"></span>
      <span>{{ scaleText }}</span>
      <span v-if="picked" class="doss-pick">{{ picked }}</span>
    </p>
    <figcaption class="doss-map-caption">
      <p v-if="badge" class="ui-badge doss-badge"><Icon name="star" :size="10.5" /><span>{{ badge }}</span></p>
      <div v-if="hybrid" class="doss-toggles" role="group" aria-label="Map layers">
        <button
          type="button"
          class="doss-toggle"
          :aria-pressed="dayNight ? 'true' : 'false'"
          :title="dayNight ? 'Day and night on: hide the light and shadow of the star' : 'Day and night off: show the light and shadow of the star on the clock date'"
          @click="toggleDayNight"
        >
          <Icon name="circle-half-stroke" :size="11" />
          <span>Day/Night</span>
          <span class="doss-pip" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="doss-toggle"
          :aria-pressed="style === 'symbols' ? 'true' : 'false'"
          :title="style === 'symbols' ? 'Symbols on: hide the symbols' : 'Symbols off: show the symbols over the painted map'"
          @click="toggleStyle"
        >
          <Icon name="layer-group" :size="11" />
          <span>Symbols</span>
          <span class="doss-pip" aria-hidden="true"></span>
        </button>
      </div>
      <button
        v-if="!large"
        ref="expandBtn"
        type="button"
        class="ui-btn doss-open"
        :title="hybrid ? 'Open the map large, with the key' : 'Open the map large'"
        @click="openLarge"
      >
        <Icon name="up-right-and-down-left-from-center" :size="13" />
        <span>{{ hybrid ? 'Map and key' : 'Open the map large' }}</span>
      </button>
      <span class="doss-hint" :title="caption.title">Surface map · {{ caption.text }}</span>
    </figcaption>
    <SurfaceTimeBar
      v-if="hybrid && dayNight && (sun || (model && model.sub))"
      :now-days="nowDays"
      :local-time="portTime"
      :locked="!!(model && model.sub)"
      :averaged="averagedShown"
    />
    <p v-if="webglNotice" class="doss-webgl" role="status">{{ webglNotice }}</p>
  </figure>
  <SurfaceKey v-if="hybrid && large" :model="model" :icon-set="iconSet" :active="highlight" @highlight="highlight = $event" />
  </div>
  <button
    v-if="large"
    ref="closeBtn"
    type="button"
    class="ui-btn is-icon doss-map-close"
    aria-label="Close"
    title="Close (Esc)"
    @click="closeLarge"
  >
    <Icon name="xmark" :size="14" />
  </button>
  </div>
  </div>
  </Teleport>
  </div>
</template>

<style>
.doss-map-slot {
  display: contents;
}

.doss-map-hold {
  width: 100%;
}

.doss-map-frame:not(.is-large),
.doss-map-frame:not(.is-large) .doss-map-card,
.doss-map-frame:not(.is-large) .doss-map-body {
  display: contents;
}

.doss-map-frame.is-large {
  position: fixed;
  inset: 0;
  z-index: 40;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-6);
  animation: doss-large-in var(--t-fast) var(--ease-out) both;
}

.doss-map-frame.is-large .doss-map-card {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: auto;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--line-1);
  border-radius: var(--r-4);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop);
}

.doss-map-frame.is-large .doss-map-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: row;
  align-items: stretch;
  min-width: 0;
  min-height: 0;
}

.doss-map-frame.is-large .surf-key {
  flex: 0 0 480px;
  max-height: 100%;
  overflow: auto;
  border-left: 1px solid var(--line-1);
}

@media (max-width: 1023px) {
  .doss-map-frame.is-large .doss-map-body {
    flex-direction: column;
  }

  .doss-map-frame.is-large .surf-key {
    flex: 0 0 auto;
    width: 100%;
    max-height: none;
    border-left: 0;
    border-top: 1px solid var(--line-1);
  }
}

.doss-map-scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--bg-0) 88%, transparent);
}

.doss-map-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
}

@keyframes doss-large-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.doss-map {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  margin: 0 0 14px;
}

.doss-map-frame.is-large .doss-map {
  z-index: 1;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: auto;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 12px;
  overflow: hidden;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.doss-zoom {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}

.doss-zoom-tools {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  display: flex;
  gap: 6px;
}

.doss-fit {
  width: auto;
  padding: 0 8px;
}

.doss-open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  height: 30px;
  padding: 0 8px;
  font: 600 12px/1 var(--font-text);
}

.doss-scale-bar {
  display: inline-block;
  height: 4px;
  margin-right: 8px;
  vertical-align: middle;
  background: var(--text-1);
}

.doss-pick {
  margin-left: 12px;
  color: var(--text-1);
}

.doss-scale {
  display: flex;
  align-items: center;
  min-width: 0;
  white-space: nowrap;
}

.doss-expand {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
}

.doss-stage {
  position: relative;
  aspect-ratio: 800 / 400;
  overflow: hidden;
}

.doss-map-frame.is-large .doss-stage {
  flex: 0 0 auto;
  width: 100%;
  max-width: 100%;
  margin-inline: auto;
  aspect-ratio: 800 / 400;
}

/* The hybrid map's layers over the sheet: the shadow, then the marks and symbols. */
.doss-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.doss-map:is([data-state="waiting"], [data-state="ready"]) .doss-layer {
  visibility: hidden;
}

/* The day and night layer: a dark overlay, then settlement lights added on top. */
.doss-stage-daynight {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 1;
  transition: opacity var(--t-slow) var(--ease-in-out);
}

.doss-stage-daynight[data-on="false"] {
  opacity: 0;
}

.doss-glow {
  mix-blend-mode: screen;
}

/* The map's layer toggles: a matched pair, each its own on/off state. */
.doss-toggles {
  display: flex;
  flex: 0 0 auto;
  border: 1px solid var(--control-line);
  border-radius: var(--r-3);
  overflow: hidden;
}

.doss-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 4px 9px;
  border: 0;
  border-right: 1px solid var(--line-1);
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  font: 600 12px/1.4 var(--font-text);
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.doss-toggle:last-child {
  border-right: 0;
}

.doss-toggle:hover {
  color: var(--text-1);
}

.doss-toggle .ui-icon {
  color: inherit;
}

.doss-toggle[aria-pressed="true"] {
  background: var(--row-active);
  color: var(--signal);
}

.doss-toggle:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
  z-index: 1;
}

/* The pip: a hollow ring when off, a lit dot when on. */
.doss-pip {
  width: 7px;
  height: 7px;
  box-sizing: border-box;
  border: 1px solid currentColor;
  border-radius: var(--r-pill);
  opacity: 0.7;
  transition: background var(--t-fast) var(--ease-out), box-shadow var(--t-fast) var(--ease-out), opacity var(--t-fast) var(--ease-out);
}

.doss-toggle[aria-pressed="true"] .doss-pip {
  background: var(--signal);
  border-color: var(--signal);
  box-shadow: 0 0 6px var(--signal-glow);
  opacity: 1;
}

/* The sheet: the painter's pixels, scaled to the frame and otherwise left alone. */
.doss-sheet {
  display: block;
  width: 100%;
  height: 100%;
}

.doss-map:is([data-state="waiting"], [data-state="ready"]) .doss-sheet {
  visibility: hidden;
}

.doss-map[data-state="revealing"] .doss-sheet {
  animation: doss-sheet-in var(--t-long) var(--ease-scan) both;
}

/* A sheet from the cache: a short fade, run again for each body by swapping the name. */
.doss-map[data-state="full"] .doss-sheet.arrive-a {
  animation: doss-sheet-arrive-a var(--t-base) var(--ease-out) both;
}

.doss-map[data-state="full"] .doss-sheet.arrive-b {
  animation: doss-sheet-arrive-b var(--t-base) var(--ease-out) both;
}

@keyframes doss-sheet-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes doss-sheet-arrive-a {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes doss-sheet-arrive-b {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* The scan sits over the frame until the sheet is in: the blank diamond, and the beam inside it. */
.doss-scan {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: opacity var(--t-long) var(--ease-scan);
}

.doss-map[data-state="revealing"] .doss-scan {
  opacity: 0;
}

.doss-blank {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* The field holds the diamond's outline still while the beam moves inside it (legacy .map-scan-field). */
.doss-scan-field {
  position: absolute;
  inset: 0;
  overflow: hidden;
  clip-path: polygon(0% 0%, 10% 33.3%, 20% 0%, 30% 33.3%, 40% 0%, 50% 33.3%, 60% 0%, 70% 33.3%, 80% 0%, 90% 33.3%, 100% 0%,
    100% 66.7%, 90% 100%, 80% 66.7%, 70% 100%, 60% 66.7%, 50% 100%, 40% 66.7%, 30% 100%, 20% 66.7%, 10% 100%, 0% 66.7%);
}

.doss-scan-beam {
  position: absolute;
  left: 0;
  right: 0;
  top: -100%;
  height: 200%;
  mix-blend-mode: screen;
  background: linear-gradient(to bottom, transparent 42%,
    color-mix(in srgb, var(--signal) 8%, transparent) 45.5%,
    color-mix(in srgb, var(--signal) 32%, transparent) 49.3%,
    var(--signal-bright) 49.85%, var(--signal) 50.1%,
    color-mix(in srgb, var(--signal) 32%, transparent) 50.7%,
    color-mix(in srgb, var(--signal) 8%, transparent) 54.5%, transparent 58%);
}

/* One pass down, then one back up, until the sheet is ready (legacy --scan-cycle is two passes). */
.doss-scan-beam.scan-down {
  animation: doss-scan-down var(--t-scan) var(--ease-scan) forwards;
}

.doss-scan-beam.scan-up {
  animation: doss-scan-up var(--t-scan) var(--ease-scan) forwards;
}

.doss-map:is([data-state="revealing"], [data-state="full"]) .doss-scan-beam {
  animation-play-state: paused;
}

@keyframes doss-scan-down {
  from { transform: translateY(0); }
  to { transform: translateY(50%); }
}

@keyframes doss-scan-up {
  from { transform: translateY(50%); }
  to { transform: translateY(0); }
}

.doss-scale {
  margin: 8px 0 0;
  color: var(--text-muted);
  font: 400 12px/16px var(--font-text);
}

.doss-map-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  padding-top: 8px;
  font-size: 12px;
  line-height: 16px;
}

.doss-hint {
  margin-left: auto;
  color: var(--text-muted);
  text-align: right;
}

/* The same quiet line the orbit picture draws when WebGL is off. */
.doss-webgl {
  margin: 8px 0 0;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

/* Reduced motion: the blank, then the sheet. No beam, no fades. */
@media (prefers-reduced-motion: reduce) {
  .doss-scan-field {
    display: none;
  }

  .doss-sheet,
  .doss-scan {
    animation: none !important;
    transition: none;
  }

  .doss-stage-daynight,
  .doss-toggle,
  .doss-pip {
    transition: none;
  }

  .doss-map-frame.is-large {
    animation: none;
  }
}
</style>

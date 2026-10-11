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
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Icon from '../design/Icon.vue';
import { cancelFrame, createCanvas, fetchJson, loadImageAsync, nextFrame, now, prefersReducedMotion } from '../platform/browser.ts';
import { hybridCaption, sheetCaption } from '../surface/caption.ts';
import type { SurfaceMode } from '../surface/contracts.ts';
import { CONTINENTAL_DEFINITION, COASTLINE_COMPLEXITY, canMapWorld, worldMapData } from '../surface/identity.ts';
import {
    dayNightOverlay, enhancedFlags, iconSetName, mapStyle, onDayNightOverlay, onMapStyle, onSurfaceMode, setDayNightOverlay, setMapStyle, surfaceMode, type MapStyle,
} from '../surface/preferences.ts';
import { cancelSurface, hybridInputsFor, requestMap } from '../surface/service.ts';
import { drawMapOverlay, MAP_HEIGHT, MAP_WIDTH, renderDiamondBlank } from '../surface/vanilla/map.ts';
import { iconPaint, loadIconSet, type IconImage, type IconSet, type Tinter } from '../surface/hybrid/icons.ts';
import { hybridModel, SHEET_LAYOUT } from '../surface/hybrid/index.ts';
import type { HybridModel } from '../surface/hybrid/model.ts';
import { createDayNightLayer, type DayNightLayer, type LayerCtx, type LayerHost } from '../surface/hybrid/daynight_layer.ts';
import { frameDue } from '../surface/hybrid/motion.ts';
import { netClipPath, netOutline } from '../surface/hybrid/stage.ts';
import { drawMarks, drawSymbols } from '../surface/hybrid/symbols.ts';
import { clockDays, clockJumps, offerStart, simClock, subscribeSimClock } from '../orbit/sim_clock.ts';
import { portTimeText, type Subsolar } from '../orbit/sun.ts';
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
/** The marks and symbol layer is drawn at twice the sheet's size, for crisp lines. */
const MARK_SCALE = 2;
const blankEl = ref<HTMLCanvasElement | null>(null);
const state = ref<State>('waiting');
const beam = ref<'scan-down' | 'scan-up'>('scan-down');
/** Flips each time a cached sheet arrives, so its fade runs again. */
const arrival = ref<'' | 'arrive-a' | 'arrive-b'>('');
/** Cold timings of the last sheet, for measuring: data attributes on the figure. */
const timing = ref<{ sheet: string; worker: string; chunk: string; cached: string }>({ sheet: '', worker: '', chunk: '', cached: '' });

/** The mode in force: the device's preference, followed while this is on screen. */
const mode = ref<SurfaceMode>(surfaceMode());
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
const clipPath = computed(() => (mode.value === 'enhanced' ? netClipPath(SHEET_LAYOUT) : undefined));
const nowDays = computed(() => (typeof props.nowDays === 'number' && Number.isFinite(props.nowDays) ? props.nowDays : clockDays()));
const worldName = computed(() => {
    const name = props.target ? props.target.body.name : '';
    return typeof name === 'string' && name.trim() ? name.trim() : 'this world';
});

let token = 0;
let requestId: string | null = null;
let shown: SurfaceTarget | null = null;
let shownMode: SurfaceMode | null = null;
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

function clearSheet(): void {
    const canvas = sheetEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (ctx) ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
}

/**
 * The painter's pixels, exactly as painted; then, for vanilla, the vanilla overlay (hex grid
 * and lobe edges). The hybrid sheet has no overlay of its own: its layers are drawn apart.
 */
function paint(pixels: Uint8ClampedArray, body: Record<string, unknown>): boolean {
    const canvas = sheetEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return false;
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, MAP_WIDTH, MAP_HEIGHT), 0, 0);
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

function drawLayers(): void {
    const canvas = marksEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx || !canvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const m = model.value;
    if (!hybrid.value || !m) return;
    ctx.setTransform(MARK_SCALE, 0, 0, MARK_SCALE, 0, 0);
    const began = now();
    const symbols = style.value === 'symbols';
    if (symbols) drawSymbols(ctx, m, SHEET_LAYOUT, { set: iconSet.value, tint });
    drawMarks(ctx, m, SHEET_LAYOUT, { graticule: symbols, ring: symbols });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (figureEl.value && symbols) figureEl.value.dataset.symbolsMs = (now() - began).toFixed(2);
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
    const out = layer.draw({ model: m, sub, playing: simClock.playing, rate: simClock.rate, jumped, nowMs: time }, shadowCtx as unknown as LayerCtx, glowCtx as unknown as LayerCtx, SHEET_LAYOUT);
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const outline = netOutline(SHEET_LAYOUT);
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
    if (same(target, shown) && shownMode === mode.value && requestId !== null) return;
    drop();
    shown = target;
    shownMode = mode.value;
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
        resolution: { width: MAP_WIDTH, height: MAP_HEIGHT },
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
});
onBeforeUnmount(() => {
    if (stopMode) stopMode();
    if (stopStyle) stopStyle();
    if (stopClock) stopClock();
    if (stopDayNight) stopDayNight();
    rest();
    drop();
});
</script>

<template>
  <figure
    v-if="mappable"
    ref="figureEl"
    class="doss-map"
    :data-state="state"
    :data-mode="mode"
    :aria-busy="state === 'waiting' || state === 'ready' ? 'true' : undefined"
    :data-sheet-ms="timing.sheet"
    :data-worker-start-ms="timing.worker"
    :data-longest-chunk-ms="timing.chunk"
    :data-from-cache="timing.cached"
  >
    <div class="doss-stage">
      <canvas
        ref="sheetEl"
        class="doss-sheet"
        :class="arrival"
        :width="MAP_WIDTH"
        :height="MAP_HEIGHT"
        role="img"
        :aria-label="'Surface map of ' + worldName"
        @animationend="onSheetEnd"
      />
      <div class="doss-daynight" :data-on="dayNight && hybrid ? 'true' : 'false'" aria-hidden="true">
        <canvas ref="shadowEl" class="doss-layer doss-shadow" :width="MAP_WIDTH" :height="MAP_HEIGHT" />
        <canvas ref="glowEl" class="doss-layer doss-glow" :width="MAP_WIDTH" :height="MAP_HEIGHT" />
      </div>
      <canvas ref="marksEl" class="doss-layer doss-marks" :width="MAP_WIDTH * MARK_SCALE" :height="MAP_HEIGHT * MARK_SCALE" aria-hidden="true" />
      <div v-show="state !== 'full'" class="doss-scan" aria-hidden="true">
        <canvas ref="blankEl" class="doss-blank" :width="MAP_WIDTH" :height="MAP_HEIGHT" />
        <div class="doss-scan-field" :style="clipPath ? { clipPath } : undefined">
          <div class="doss-scan-beam" :class="beam" @animationend="onBeamEnd"></div>
        </div>
      </div>
    </div>
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
          :title="style === 'symbols' ? 'Symbols on: hide the hex outlines and symbols' : 'Symbols off: show hex outlines and symbols over the painted map'"
          @click="toggleStyle"
        >
          <Icon name="layer-group" :size="11" />
          <span>Symbols</span>
          <span class="doss-pip" aria-hidden="true"></span>
        </button>
      </div>
      <span class="doss-hint" :title="caption.title">Surface map · {{ caption.text }}</span>
    </figcaption>
    <SurfaceTimeBar
      v-if="hybrid && dayNight && (sun || (model && model.sub))"
      :now-days="nowDays"
      :local-time="portTime"
      :locked="!!(model && model.sub)"
      :averaged="averagedShown"
    />
  </figure>
</template>

<style>
.doss-map {
  flex: 0 0 auto;
  width: min(100%, var(--panel-column));
  margin: 0 auto 14px;
}

.doss-stage {
  position: relative;
  aspect-ratio: 800 / 400;
  overflow: hidden;
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

/* The day and night layer: the shadow, then its light (terminator line, lights, reticle) added on top. */
.doss-daynight {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 1;
  transition: opacity var(--t-slow) var(--ease-in-out);
}

.doss-daynight[data-on="false"] {
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

.doss-map-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  padding-top: 8px;
  font-size: 11.5px;
  line-height: 1.3;
}

.doss-hint {
  margin-left: auto;
  color: var(--text-muted);
  text-align: right;
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

  .doss-daynight,
  .doss-toggle,
  .doss-pip {
    transition: none;
  }
}
</style>

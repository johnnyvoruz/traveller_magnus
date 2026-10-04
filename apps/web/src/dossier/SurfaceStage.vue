<script setup lang="ts">
/**
 * The surface-map lead of a dossier (legacy worldMapLead, js/system_inspector.js:541-624):
 * the 800×400 diamond sheet of a body, in the legacy stage's 2:1 frame with its caption row.
 *
 * The flow is the legacy one. The blank diamond is drawn at once; a beam sweeps down and
 * back up while the surface worker paints; when the sheet is ready the pass in hand
 * finishes, then the sheet fades in as the scan dissolves. A body seen before paints from
 * the cache with no scan. Changing body cancels the request in flight, and a result that
 * arrives late is never painted. Under reduced motion there is no beam: the blank, then the
 * sheet.
 *
 * The sheet's pixels are the painter's for the mode in force (surface/vanilla/map.ts, or
 * surface/enhanced/map.ts) and are put on the canvas untouched: nothing here tints, filters
 * or blends them. Seeds are the service's business (surface/identity.ts, through
 * surface/service.ts); this file passes the hex key, the dossier key and the body, and
 * builds no seed. The caption names the mode; switching it (the Surfaces command) repaints.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../design/Icon.vue';
import { prefersReducedMotion } from '../platform/browser.ts';
import { sheetCaption } from '../surface/caption.ts';
import type { SurfaceMode } from '../surface/contracts.ts';
import { CONTINENTAL_DEFINITION, COASTLINE_COMPLEXITY, canMapWorld, worldMapData } from '../surface/identity.ts';
import { enhancedFlags, onSurfaceMode, surfaceMode } from '../surface/preferences.ts';
import { cancelSurface, requestMap } from '../surface/service.ts';
import { drawMapOverlay, MAP_HEIGHT, MAP_WIDTH, renderDiamondBlank } from '../surface/vanilla/map.ts';

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
}>();

/** waiting: the worker is painting. ready: painted, the beam finishing its pass. revealing: fading in. full: shown. */
type State = 'waiting' | 'ready' | 'revealing' | 'full';

const sheetEl = ref<HTMLCanvasElement | null>(null);
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
const caption = computed(() => sheetCaption(mode.value, props.target ? props.target.body : null));
const worldName = computed(() => {
    const name = props.target ? props.target.body.name : '';
    return typeof name === 'string' && name.trim() ? name.trim() : 'this world';
});

let token = 0;
let requestId: string | null = null;
let shown: SurfaceTarget | null = null;
let shownMode: SurfaceMode | null = null;
let stopMode: (() => void) | null = null;
let lastArrival: 'arrive-a' | 'arrive-b' = 'arrive-b';

/** The same body of the same hex: nothing to redo when the panel merely re-renders. */
function same(a: SurfaceTarget | null, b: SurfaceTarget | null): boolean {
    if (a === null || b === null) return a === b;
    return a.hexKey === b.hexKey && a.dossierKey === b.dossierKey && a.body === b.body;
}

function drop(): void {
    token += 1;
    if (requestId) cancelSurface(requestId);
    requestId = null;
}

function clearSheet(): void {
    const canvas = sheetEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (ctx) ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
}

/** The vanilla pixels, then the vanilla overlay (hex grid and lobe edges), exactly as painted. */
function paint(pixels: Uint8ClampedArray, body: Record<string, unknown>): boolean {
    const canvas = sheetEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!ctx) return false;
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, MAP_WIDTH, MAP_HEIGHT), 0, 0);
    drawMapOverlay(ctx, worldMapData(body));
    return true;
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
    if (blankEl.value) renderDiamondBlank(blankEl.value, worldMapData(target.body));
    const ticket = requestMap({
        mode: mode.value,
        hexKey: target.hexKey,
        dossierKey: target.dossierKey,
        body: target.body,
        resolution: { width: MAP_WIDTH, height: MAP_HEIGHT },
        options: { continentalDefinition: CONTINENTAL_DEFINITION, coastlineComplexity: COASTLINE_COMPLEXITY, flags: enhancedFlags() },
    });
    requestId = ticket.requestId;
    if (ticket.status === 'sheet' && ticket.pixels) {
        // Seen before: straight from the cache, no scan.
        if (paint(ticket.pixels, target.body)) {
            state.value = 'full';
            lastArrival = lastArrival === 'arrive-a' ? 'arrive-b' : 'arrive-a';
            arrival.value = lastArrival;
            timing.value = { sheet: '0', worker: '', chunk: '0', cached: 'true' };
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
onMounted(() => {
    mode.value = surfaceMode();
    // The Surfaces command switches the mode for the device: the sheet in view is painted again.
    stopMode = onSurfaceMode((next) => {
        mode.value = next;
        start();
    });
    start();
});
onBeforeUnmount(() => {
    if (stopMode) stopMode();
    drop();
});
</script>

<template>
  <figure
    v-if="mappable"
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
      <div v-show="state !== 'full'" class="doss-scan" aria-hidden="true">
        <canvas ref="blankEl" class="doss-blank" :width="MAP_WIDTH" :height="MAP_HEIGHT" />
        <div class="doss-scan-field">
          <div class="doss-scan-beam" :class="beam" @animationend="onBeamEnd"></div>
        </div>
      </div>
    </div>
    <figcaption class="doss-map-caption">
      <p v-if="badge" class="ui-badge doss-badge"><Icon name="star" :size="10.5" /><span>{{ badge }}</span></p>
      <span class="doss-hint" :title="caption.title">Surface map · {{ caption.text }}</span>
    </figcaption>
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

/* The sheet: the vanilla painter's pixels, scaled to the frame and otherwise left alone. */
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
}
</style>

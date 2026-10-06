<script setup lang="ts">
/**
 * The orbit stage: the canvas, its pointer input, the docked body card and the
 * Fit button.
 * It only binds. The layouts are orbit/layout.ts and orbit/lineup.ts, the move between them
 * orbit/tween.ts, the camera orbit/camera.ts and orbit/stage.ts, the paint
 * orbit/OrbitRenderer.ts, the card orbit/card.ts. The view owns the clock and the frame loop
 * and calls paint() once a frame.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../design/Icon.vue';
import {
    createCanvas, devicePixelRatio, loadImage, now, observeSize, onDevicePixelRatioChange,
    prefersReducedMotion,
} from '../platform/browser.ts';
import BodyCard from './BodyCard.vue';
import { DRAG_SLOP, wheelNotches } from './camera.ts';
import { cardFor } from './card.ts';
import { hitOf, layoutScene, planSystem, type HitKind, type Plan, type Scene, type View } from './layout.ts';
import { onSurfaceMode, surfaceMode } from '../surface/preferences.ts';
import { drawDisc, prepareDiscs } from '../surface/service.ts';
import { OrbitRenderer, type DiscPainter, type FlightPreview } from './OrbitRenderer.ts';
import type { Layers, Mode, Picture } from './picture.ts';
import { OrbitStage } from './stage.ts';
import { publishOrbitClock } from './running.ts';
import { bodiesAtOf, shipStanding, type ShipStanding } from './ship_marks.ts';
import { pictureBodies, placeShips, standInMarks, type PlotReadout, type ShipMark, type ShipTrack } from './ships.ts';
import { readOrbitMotion, readOrbitTheme, type OrbitMotion } from './theme.ts';

const props = defineProps<{
    /** The normalised system (orbit/system.ts), or null while there is none. */
    system: Record<string, any> | null;
    /** The route's hex key, `Spinward_Marches/1910`: the model does not carry it. */
    hexKey: string;
    /** The selected body's dossier key, or null. */
    selected: string | null;
    /** Orbits, Row or Column. */
    mode: Mode;
    /** The layer switches and the View popover's settings. */
    layers: Layers;
    /** Marks from the campaign. Omitted, a dev stand-in may fill them. */
    ships?: readonly ShipMark[] | null;
    /** The campaign's vessels here as tracks (orbit/ship_list.ts): placed on each frame's picture by placeShips. Takes precedence over `ships`. */
    tracks?: readonly ShipTrack[] | null;
    /** Plotting overlay. Omitted, it stays off except under the dev stand-in. */
    plot?: PlotReadout | null;
    /** Plotting mode (K12 2b): the hairlines follow the pointer, measured from the ship `plotFrom`; a body clicked is a destination, not a selection. */
    plotting?: boolean;
    plotFrom?: string | null;
    /** The flight being previewed, or null. Omitted, the dev stand-in may show one. */
    preview?: FlightPreview | null;
}>();

const emit = defineEmits<{
    /** A body was clicked on the canvas. */
    pick: [key: string];
    /** In plotting mode, a body was clicked: the destination. */
    plot: [key: string];
}>();

const route = useRoute();
const wrapEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const plan = shallowRef<Plan | null>(null);
const stage = new OrbitStage();
let renderer: OrbitRenderer | null = null;
let motionTokens: OrbitMotion = { hop: 0, flight: 0, lineup: 0 };
let reduced = false;
let reducedCheckedAt = 0;
let stale = true;
let days = 0;
const unsubscribe: (() => void)[] = [];

/**
 * Shaded discs come from the surface service (directives/handoff.md §61): one batch a frame,
 * then a tile per body. Whatever it answers short of a tile, the painter draws its flat disc.
 * Both modes show the vanilla disc for now; the mode is sent so the service can tell them apart.
 */
let discMode = surfaceMode();
const discs: DiscPainter = {
    mode: () => discMode,
    prepare: (batch) => prepareDiscs(batch).status,
    // The painter's units are the context's own, as the service asks: the same for the centre and the radius.
    draw: (ctx, key, x, y, r) => drawDisc(ctx, key, x, y, r),
};

// ---- Hover and the card ----------------------------------------------------------------

const hover = ref<{ kind: HitKind; key: string } | null>(null);
/** The date the card shows; it follows the clock a few times a second, not every frame. */
const cardDays = ref(0);
let cardAt = 0;
let pointer: { x: number; y: number } | null = null;
const dragging = ref(false);
const fitted = ref(true);

/** What the marks on the picture mean; it changes with the layers and the layout, not every frame. */

/** The selected body whose pinned card the visitor closed; it comes back on hover or with another selection. */
const dismissed = ref<string | null>(null);

/** The selected body's card: it stays put whatever the pointer does. */
const pinnedTarget = computed((): { kind: HitKind; key: string } | null => {
    if (!props.selected || !plan.value || dismissed.value === props.selected) return null;
    // The selected body's own kind decides its card (a belt's differs from a world's).
    const world = plan.value.worlds.find((w) => w.key === props.selected);
    if (world) return { kind: world.belt && !world.mainworldBelt ? 'belt' : 'world', key: world.key };
    if (plan.value.stars.some((s) => s.key === props.selected)) return { kind: 'star', key: props.selected };
    return { kind: 'moon', key: props.selected };
});

/** The body under the pointer, when it is not the one whose card is already pinned. */
const hoverTarget = computed((): { kind: HitKind; key: string } | null => {
    const over = hover.value;
    if (!over) return null;
    return pinnedTarget.value && pinnedTarget.value.key === over.key ? null : over;
});

const pinnedCard = computed(() => {
    const target = pinnedTarget.value;
    return target && plan.value ? cardFor(plan.value, target.kind, target.key, cardDays.value) : null;
});

const hoverCard = computed(() => {
    const target = hoverTarget.value;
    return target && plan.value ? cardFor(plan.value, target.kind, target.key, cardDays.value) : null;
});

function setHover(x: number, y: number): void {
    const hit = stage.pick(x, y);
    const next = hit && hit.kind !== 'ring' ? { kind: hit.kind, key: hit.key } : null;
    const was = hover.value;
    if ((was && next && was.key === next.key && was.kind === next.kind) || (!was && !next)) return;
    hover.value = next;
}

// ---- Pointer input ----------------------------------------------------------------------

let press: { x: number; y: number; lastX: number; lastY: number; moved: boolean } | null = null;

function local(event: MouseEvent): { x: number; y: number } {
    const rect = (canvasEl.value as HTMLCanvasElement).getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onDown(event: PointerEvent): void {
    if (event.button !== 0 || !canvasEl.value) return;
    canvasEl.value.setPointerCapture(event.pointerId);
    press = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
    dragging.value = true;
}

function onMove(event: PointerEvent): void {
    const at = local(event);
    pointer = at;
    if (standInCount() > 0 || props.plotting) stale = true;
    if (!press) {
        setHover(at.x, at.y);
        return;
    }
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_SLOP) press.moved = true;
    stage.drag(event.clientX - press.lastX, event.clientY - press.lastY, press.moved);
    press.lastX = event.clientX;
    press.lastY = event.clientY;
    if (press.moved) hover.value = null;
}

function onUp(event: PointerEvent): void {
    if (!press) return;
    const moved = press.moved;
    press = null;
    dragging.value = false;
    if (canvasEl.value && canvasEl.value.hasPointerCapture(event.pointerId)) canvasEl.value.releasePointerCapture(event.pointerId);
    if (moved || event.type === 'pointercancel') return;
    const at = local(event);
    const hit = stage.pick(at.x, at.y);
    // Plotting: a body is a destination, and the camera stays where it is.
    if (props.plotting) {
        if (hit) emit('plot', hit.key);
        return;
    }
    if (!hit) {
        stage.release();
        return;
    }
    stage.follow(hit.key, now());
    emit('pick', hit.key);
}

function onLeave(): void {
    pointer = null;
    if (standInCount() > 0 || props.plotting) stale = true;
    if (!press) hover.value = null;
}

/** The same dev switch as the map: `?campaignStandIn=` a positive count. Off in a build. */
function standInCount(): number {
    if (!import.meta.env.DEV) return 0;
    const raw = route.query.campaignStandIn;
    const text = Array.isArray(raw) ? raw[0] : raw;
    const count = Number(text);
    return Number.isFinite(count) && count > 0 ? count : 0;
}

/** The last frame, and its marks, for the strip's questions (shipStatus). */
let lastMarks: readonly ShipMark[] = [];
let lastFrame: { picture: Picture; view: View } | null = null;

function queryText(name: string): string {
    const raw = route.query[name];
    const text = Array.isArray(raw) ? raw[0] : raw;
    return typeof text === 'string' ? text : '';
}

/** The view's preview when one was passed, including null. Otherwise the dev stand-in's. */
function standPreview(clockDays: number): FlightPreview | null {
    if (props.preview !== undefined) return props.preview;
    if (standInCount() <= 0) return null;
    const current = plan.value;
    if (!current) return null;
    const ghost = queryText('ghost');
    let toKey = '';
    let hours = 11 * 24;
    if (ghost) {
        const parts = ghost.split(',');
        toKey = parts[0] || '';
        const parsed = Number(parts[1]);
        if (parsed > 0) hours = parsed;
    }
    if (!toKey) {
        const named = current.worlds.find((world) => world.name.endsWith('A-II') && !world.belt);
        const fallback = current.worlds.find((world) => !world.belt);
        toKey = named ? named.key : (fallback ? fallback.key : '');
    }
    if (!toKey) return null;
    return { toKey, departs: clockDays, arrives: clockDays + hours / 24 };
}

/** `?line=departs,arrives` fixes the stand-in party's flight. Absent, the party stays halfway. */
function standFlight(): { departs: number; arrives: number } | null {
    const line = queryText('line');
    if (!line) return null;
    const parts = line.split(',');
    const departs = Number(parts[0]);
    const arrives = Number(parts[1]);
    if (!(arrives > departs)) return null;
    return { departs, arrives };
}

/** A body's place on a layout of this view at `at`. The campaign's bodiesAtOf is not asked. */
function picturePlace(view: View, key: string, at: number): { x: number; y: number } | null {
    const current = plan.value;
    if (!current) return null;
    const scene: Scene = layoutScene(current, view, at);
    for (const star of scene.stars) {
        if (star.star.key === key) return { x: star.x, y: star.y };
    }
    const sets = [scene.primary, ...scene.companions.map((companion) => companion.set)];
    for (const set of sets) {
        if (!set) continue;
        for (const body of set.bodies) {
            if (body.world.key === key) return { x: body.x, y: body.y };
            for (const moon of body.moons) {
                if (moon.moon.key === key) return { x: moon.x, y: moon.y };
            }
        }
    }
    return null;
}

function marksFor(picture: Picture, clockDays: number): readonly ShipMark[] | undefined {
    if (props.tracks) {
        lastMarks = placeShips(props.tracks, bodiesAtOf(props.hexKey, pictureBodies(picture)), clockDays);
        return lastMarks;
    }
    if (props.ships) return props.ships;
    if (standInCount() <= 0) return undefined;
    const flight = standFlight();
    const last = lastFrame;
    if (flight && last) return standInMarks(props.hexKey, clockDays, picture, (key, at) => picturePlace(last.view, key, at), flight);
    return standInMarks(props.hexKey, clockDays, picture);
}

function plotFor(marks: readonly ShipMark[] | undefined): PlotReadout | null | undefined {
    if (props.plot !== undefined) return props.plot;
    if (props.plotting) {
        if (!pointer) return undefined;
        const from = marks && props.plotFrom ? marks.find((mark) => mark.id === props.plotFrom) : undefined;
        return { x: pointer.x, y: pointer.y, from: from ? { x: from.x, y: from.y } : null };
    }
    if (standInCount() <= 0 || !pointer) return undefined;
    const party = marks ? marks.find((mark) => mark.kind === 'party') : undefined;
    return { x: pointer.x, y: pointer.y, from: party ? { x: party.x, y: party.y } : null };
}

/**
 * Where a ship's mark stands on the last frame, and whether it lies outside every 100D
 * circle (orbit/layout.ts lays them out for the frame's view, whatever the Jump layer shows).
 * Null when the ship is not on the picture.
 */
function shipStatus(id: string): ShipStanding | null {
    const mark = lastMarks.find((item) => item.id === id);
    const current = plan.value;
    const last = lastFrame;
    if (!mark || !current || !last) return null;
    const scene = layoutScene(current, last.view, days);
    return shipStanding(mark, scene.jumps, pictureBodies(last.picture));
}

function onDouble(event: MouseEvent): void {
    const at = local(event);
    const hit = stage.pick(at.x, at.y);
    if (!hit) {
        stage.fit(now());
        return;
    }
    if (stage.frame(hit.key, days, now())) emit('pick', hit.key);
}

function onWheel(event: WheelEvent): void {
    const at = local(event);
    stage.wheel(at.x, at.y, wheelNotches(event.deltaY, event.deltaMode), days, now());
}

function fit(): void {
    stage.fit(now());
}

// ---- Size, theme, paint -------------------------------------------------------------------

function applyMotion(): void {
    reduced = prefersReducedMotion();
    stage.motion = reduced ? { hop: 0, flight: 0, lineup: 0 } : motionTokens;
}

function resize(): void {
    const wrap = wrapEl.value;
    const canvas = canvasEl.value;
    if (!wrap || !canvas || !renderer) return;
    const w = Math.max(1, Math.floor(wrap.clientWidth));
    const h = Math.max(1, Math.floor(wrap.clientHeight));
    const dpr = devicePixelRatio();
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
    }
    renderer.resize(w, h, dpr);
    stage.resize(w, h, days);
    stage.invalidate();
    stale = true;
}

/**
 * Frame cost, for the 16 ms budget: written once a second to data-draw-ms as "mean/worst",
 * with the zoom relative to the fitted view in data-zoom.
 */
let costSum = 0;
let costWorst = 0;
let costFrames = 0;
let costAt = 0;

/** Called by the view once a frame with the clock's date and the wall time in milliseconds. */
function paint(clockDays: number, time: number): void {
    days = clockDays;
    // OrbitView calls this once a frame with the running clock. The dossier hears it here.
    publishOrbitClock(clockDays);
    const current = plan.value;
    if (!renderer || !current) return;
    if (time - reducedCheckedAt > 1000) {
        reducedCheckedAt = time;
        applyMotion();
    }
    const frame = stage.tick(clockDays, time);
    if (!frame) return;
    lastFrame = frame;
    if (fitted.value !== stage.fitted) fitted.value = stage.fitted;
    if (time - cardAt > 200) {
        cardAt = time;
        if (cardDays.value !== clockDays) cardDays.value = clockDays;
    }
    // A body can move under a still pointer. Not while the camera flies: the card would flicker
    // through everything that sweeps past.
    if (frame.changed && !frame.moving && pointer && !press) setHover(pointer.x, pointer.y);
    // The selection lock and a highport's lights run on the wall clock.
    const selected = props.selected && hitOf(frame.picture, props.selected) ? props.selected : null;
    const alive = !reduced && (selected !== null || stage.layers.scan || current.worlds.some((w) => w.port !== null || w.moons.some((m) => m.port !== null)));
    // Shaded discs turn and their clouds drift, and tiles arrive a frame or more after they are asked for.
    if (!frame.changed && !frame.moving && !alive && !renderer.discsBusy && !renderer.layersBusy && !stale) return;
    stale = false;
    const started = now();
    const ships = marksFor(frame.picture, clockDays);
    const plot = plotFor(ships);
    const preview = standPreview(clockDays);
    renderer.draw(current, frame.picture, frame.view, {
        selected, days: clockDays, time, motion: !reduced, layers: stage.layers,
        ...(ships && ships.length > 0 ? { ships } : {}),
        ...(plot ? { plot } : {}),
        ...(preview ? { preview } : {}),
    });
    const cost = now() - started;
    costSum += cost;
    costFrames += 1;
    if (cost > costWorst) costWorst = cost;
    if (time - costAt > 1000 && wrapEl.value) {
        wrapEl.value.dataset.drawMs = (costSum / costFrames).toFixed(2) + '/' + costWorst.toFixed(2);
        wrapEl.value.dataset.zoom = (stage.cam.zoom / (stage.cam.fitZoom || 1)).toFixed(1);
        wrapEl.value.dataset.discs = renderer.discsReport;
        costSum = 0;
        costWorst = 0;
        costFrames = 0;
        costAt = time;
    }
}

function loadPlan(): void {
    plan.value = props.system ? planSystem(props.system, props.hexKey) : null;
    stage.setPlan(plan.value);
    hover.value = null;
    stale = true;
}

watch([() => props.system, () => props.hexKey], loadPlan);

watch(() => props.mode, (mode) => {
    applyMotion();
    stage.setMode(mode, now());
    hover.value = null;
    stale = true;
});

watch(() => props.layers, (layers) => {
    stage.setLayers(layers, now());
    stale = true;
}, { deep: true });

watch(() => [route.query.campaignStandIn, route.query.ghost, route.query.line, props.ships, props.plot, props.tracks, props.plotting, props.plotFrom, props.preview] as const, () => { stale = true; });

/** js/system_viewer.js:2084-2092: the canvas says which layout it shows. */
const canvasLabel = computed(() => {
    const layout = props.mode === 'row'
        ? 'Planets lined up horizontally, star on the left.'
        : props.mode === 'column'
            ? 'Planets lined up vertically, star at the top.'
            : 'System orbits.';
    return layout + ' Every body is also in the list below.';
});

// A body chosen elsewhere (a chip, the dossier) is followed; a body clicked here already is.
watch(() => props.selected, (key) => {
    stale = true;
    dismissed.value = null;
    if (!key) {
        stage.release();
        return;
    }
    if (key !== stage.tracked) stage.follow(key, now());
});

onMounted(() => {
    const wrap = wrapEl.value;
    const canvas = canvasEl.value;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!wrap || !canvas || !ctx) return;
    motionTokens = readOrbitMotion(wrap);
    applyMotion();
    renderer = new OrbitRenderer(ctx, readOrbitTheme(wrap), {
        makeCanvas: createCanvas,
        loadImage,
        artBase: import.meta.env.BASE_URL + 'starports/',
        stale: () => { stale = true; },
        discs,
    });
    unsubscribe.push(onSurfaceMode((mode) => {
        discMode = mode;
        stale = true;
    }));
    stage.layers = { ...props.layers };
    stage.mode = props.mode;
    loadPlan();
    resize();
    unsubscribe.push(observeSize(wrap, resize), onDevicePixelRatioChange(resize));
});

onBeforeUnmount(() => {
    for (const off of unsubscribe) off();
    renderer = null;
});

defineExpose({ paint, fit, shipStatus });
</script>

<template>
  <div ref="wrapEl" class="orbit-canvas-wrap">
    <canvas
      ref="canvasEl"
      class="orbit-canvas"
      :class="{ 'is-dragging': dragging, 'is-over': hover !== null && !dragging }"
      :aria-label="canvasLabel"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="onLeave"
      @dblclick.prevent="onDouble"
      @wheel.prevent="onWheel"
    />
    <div class="orbit-cards">
      <BodyCard
        v-if="pinnedCard && pinnedTarget"
        :model="pinnedCard"
        :body-key="pinnedTarget.key"
        closable
        @close="dismissed = selected"
      />
      <BodyCard
        v-if="hoverCard && hoverTarget"
        :model="hoverCard"
        :body-key="hoverTarget.key"
        :closable="false"
        :under="pinnedCard !== null"
      />
    </div>
    <!-- The layout control, the key and whatever else stands on the picture (views/OrbitView.vue). -->
    <slot name="overlay" />
    <button
      type="button"
      class="orbit-btn orbit-fit"
      data-command="orbit-fit"
      title="Fit the whole system (F, or double-click empty space)"
      :aria-pressed="fitted"
      @click="fit"
    >
      <Icon name="expand" :size="13" />Fit
    </button>
  </div>
</template>

<style>
.orbit-canvas-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: var(--orbit-space);
}

.orbit-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  cursor: default;
  touch-action: none;
}

.orbit-canvas.is-over {
  cursor: pointer;
}

.orbit-canvas.is-dragging {
  cursor: move;
}

.orbit-fit {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 2;
  background: var(--chrome-glass);
}

.orbit-fit[aria-pressed="true"] {
  border-color: var(--line-2);
  color: var(--text-muted);
}
</style>

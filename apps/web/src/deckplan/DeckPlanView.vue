<script setup lang="ts">
/**
 * Draws one deck plan: pan, zoom, and fit. Agent D places this on the record page.
 * Tiles come from tileUrl. The credit stays on screen whenever the view does.
 */
import type { DeckPlan } from '@voyage/shared';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { devicePixelRatio } from '../platform/browser.ts';
import { drawDeck, fitFrame, tileUrl, type DeckFrame } from './draw.ts';
import { placeShip, type GeomorphManifest, type PlacedShip } from './place.ts';

const props = defineProps<{ plan: DeckPlan }>();

const credit = 'Deck geomorphs by Robert Pearce and Eric B. Smith, CC BY-NC 4.0.';
const canvasEl = ref<HTMLCanvasElement | null>(null);
const skipped = ref<string[]>([]);
const status = ref('');

const MIN_SCALE = 0.02;
const MAX_SCALE = 80;
const KEY_ZOOM = 1.5;
const WHEEL_STEP = 1.1;
const WHEEL_NOTCH_PX = 100;
const PAN_FRACTION = 0.15;

let placed: PlacedShip | null = null;
let frame: DeckFrame | null = null;
let generation = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let resizeObserver: ResizeObserver | null = null;

function canvasPixels(canvas: HTMLCanvasElement): { width: number; height: number } {
    const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio();
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return { width, height };
}

function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function zoomAt(sx: number, sy: number, factor: number): void {
    if (!frame) return;
    const mapX = (sx - frame.panX) / frame.scale;
    const mapY = (frame.panY - sy) / frame.scale;
    const scale = clampScale(frame.scale * factor);
    frame = { scale, panX: sx - mapX * scale, panY: sy + mapY * scale };
}

async function paint(): Promise<void> {
    const canvas = canvasEl.value;
    if (!canvas || !placed || !frame) return;
    const gen = ++generation;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = canvasPixels(canvas);
    const missed = await drawDeck(ctx, placed, {
        width: size.width,
        height: size.height,
        frame,
        isCurrent: () => gen === generation,
    });
    if (gen !== generation || !placed) return;
    const codes = placed.missing;
    skipped.value = [...codes, ...missed.filter((path) => !codes.includes(path))];
}

function fit(): void {
    const canvas = canvasEl.value;
    if (!canvas || !placed?.bounds) return;
    const size = canvasPixels(canvas);
    const next = fitFrame(placed.bounds, size.width, size.height);
    if (!next) return;
    frame = next;
    void paint();
}

async function load(): Promise<void> {
    const gen = ++generation;
    status.value = '';
    skipped.value = [];
    placed = null;
    frame = null;
    let response: Response;
    try {
        response = await fetch(tileUrl('manifest.json'));
    } catch {
        if (gen === generation) status.value = 'The tile catalogue could not be loaded.';
        return;
    }
    if (gen !== generation) return;
    if (!response.ok) {
        status.value = 'The tile catalogue could not be loaded.';
        return;
    }
    let manifest: GeomorphManifest;
    try {
        manifest = await response.json() as GeomorphManifest;
    } catch {
        if (gen === generation) status.value = 'The tile catalogue could not be loaded.';
        return;
    }
    if (gen !== generation) return;
    if (!manifest || !Array.isArray(manifest.images)) {
        status.value = 'The tile catalogue could not be loaded.';
        return;
    }
    placed = placeShip(manifest, props.plan.parts);
    skipped.value = [...placed.missing];
    fit();
}

function onWheel(event: WheelEvent): void {
    const canvas = canvasEl.value;
    if (!canvas || !frame) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio();
    const sx = (event.clientX - rect.left) * dpr;
    const sy = (event.clientY - rect.top) * dpr;
    let pixels = event.deltaY;
    if (event.deltaMode === 1) pixels *= 16;
    else if (event.deltaMode === 2) pixels *= rect.height;
    zoomAt(sx, sy, Math.pow(WHEEL_STEP, -pixels / WHEEL_NOTCH_PX));
    void paint();
}

function onPointerDown(event: PointerEvent): void {
    const canvas = canvasEl.value;
    if (!canvas || !frame || event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
    if (!dragging || !frame) return;
    const dpr = devicePixelRatio();
    frame = {
        ...frame,
        panX: frame.panX + (event.clientX - lastX) * dpr,
        panY: frame.panY + (event.clientY - lastY) * dpr,
    };
    lastX = event.clientX;
    lastY = event.clientY;
    void paint();
}

function onPointerUp(): void {
    dragging = false;
}

function onKey(event: KeyboardEvent): void {
    const canvas = canvasEl.value;
    if (!canvas || !frame) return;
    const width = canvas.width;
    const height = canvas.height;
    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        frame = { ...frame, panX: frame.panX + width * PAN_FRACTION };
    } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        frame = { ...frame, panX: frame.panX - width * PAN_FRACTION };
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        frame = { ...frame, panY: frame.panY + height * PAN_FRACTION };
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        frame = { ...frame, panY: frame.panY - height * PAN_FRACTION };
    } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomAt(width / 2, height / 2, KEY_ZOOM);
    } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomAt(width / 2, height / 2, 1 / KEY_ZOOM);
    } else if (event.key === 'f' || event.key === 'F' || event.key === '0') {
        event.preventDefault();
        fit();
        return;
    } else {
        return;
    }
    void paint();
}

onMounted(() => {
    const canvas = canvasEl.value;
    if (!canvas) return;
    canvas.addEventListener('wheel', onWheel, { passive: false });
    resizeObserver = new ResizeObserver(() => {
        if (!frame) fit();
        else void paint();
    });
    resizeObserver.observe(canvas);
});

onBeforeUnmount(() => {
    canvasEl.value?.removeEventListener('wheel', onWheel);
    resizeObserver?.disconnect();
});

watch(() => props.plan, () => { void load(); }, { immediate: true });
</script>

<template>
  <section class="plan">
    <div class="bar">
      <p class="name">{{ plan.name }}</p>
      <button type="button" class="ui-btn" @click="fit">Fit to view</button>
      <p v-if="status" class="status">{{ status }}</p>
    </div>
    <canvas
      ref="canvasEl"
      class="sheet"
      tabindex="0"
      aria-label="Deck plan"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKey"
    ></canvas>
    <ul v-if="skipped.length" class="skipped">
      <li>Not in the tile catalogue:</li>
      <li v-for="(item, index) in skipped" :key="index">{{ item }}</li>
    </ul>
    <p class="credit">{{ credit }}</p>
  </section>
</template>

<style scoped>
.plan {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-0);
  color: var(--text-1);
  font-family: var(--font-text);
}

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line-1);
}

.name,
.status,
.credit {
  margin: 0;
  font-size: 14px;
}

.name {
  color: var(--text-0);
}

.sheet {
  flex: 1;
  width: 100%;
  min-height: 0;
  background: var(--paper);
  touch-action: none;
  cursor: grab;
}

.sheet:active {
  cursor: grabbing;
}

.skipped {
  max-height: 6rem;
  margin: 0;
  padding: 8px 16px;
  overflow: auto;
  color: var(--text-1);
  background: var(--surface-1, var(--bg-1));
  border-top: 1px solid var(--line-1);
  font-size: 13px;
}

.credit {
  padding: 6px 12px;
  color: var(--text-1);
  background: var(--bg-1);
  border-top: 1px solid var(--line-1);
  /* 10px is the smallest text in the shared UI (the tag). One line at every panel width. */
  font-size: 10px;
  line-height: 1.3;
  white-space: nowrap;
}
</style>

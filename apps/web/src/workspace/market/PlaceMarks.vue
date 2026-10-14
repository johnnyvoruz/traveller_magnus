<script setup lang="ts">
/**
 * A package's outline on the map while it is being placed (contracts/b_marketplace.md F5):
 * one rigid shape that snaps to hexes. Drag it by any of its hexes; the bar below says
 * where it lands and offers Preview. Drawn in the chart's own units inside one group that
 * the map view moves with the camera (`place`), as the build marks are. Only the outline
 * takes the pointer; the rest of the map pans as usual.
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Camera, Viewport } from '../../map/camera.ts';
import { cameraTransform, hexesPath, type SectorPlace } from '../build/marks.ts';
import { anchorUnder, choosePlacement, placedKeys, placing, stopPlacing, type Slot, landingWords } from './place.ts';

const props = defineProps<{
    sectorOf: (slug: string) => SectorPlace | null;
    slotOf: (slug: string) => Slot | null;
    /** The sector slug at a slot: the chart's, the referee's, or an empty slot's. */
    slugAt: (sx: number, sy: number) => string;
    /** The hex under a point of the overlay, in its pixels. */
    keyAt: (sx: number, sy: number) => string | null;
}>();

const router = useRouter();
const group = ref<SVGGElement | null>(null);
const svg = ref<SVGSVGElement | null>(null);
const dragging = ref(false);

/** Bumped when the map learns a sector of the piece (the chart loads after the outline). */
const known = ref('');
const placed = computed(() => {
    void known.value;
    return placedKeys(placing.keys, { anchor: placing.anchor, to: placing.to }, props.slotOf, props.slugAt);
});

function slugsOf(keys: readonly string[]): string[] {
    return [...new Set(keys.map((key) => key.slice(0, key.lastIndexOf('/'))))];
}
const outline = computed(() => (placed.value.keys.length ? hexesPath(placed.value.keys, props.sectorOf) : ''));
const words = computed(() => {
    if (placed.value.error) return placed.value.error;
    return landingWords(placing.keys.length, placing.to);
});

function local(event: PointerEvent): { x: number; y: number } {
    const box = svg.value ? svg.value.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: event.clientX - box.left, y: event.clientY - box.top };
}

function onDown(event: PointerEvent): void {
    const at = local(event);
    const key = props.keyAt(at.x, at.y);
    const anchor = key ? anchorUnder(placing.keys, placed.value.keys, key) : null;
    if (!key || !anchor) return;
    event.preventDefault();
    event.stopPropagation();
    placing.anchor = anchor;
    placing.to = key;
    dragging.value = true;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
}

function onMove(event: PointerEvent): void {
    if (!dragging.value) return;
    const at = local(event);
    const key = props.keyAt(at.x, at.y);
    if (key && key !== placing.to) placing.to = key;
}

function onUp(event: PointerEvent): void {
    if (!dragging.value) return;
    dragging.value = false;
    (event.currentTarget as Element).releasePointerCapture(event.pointerId);
}

function preview(): void {
    if (placed.value.error) return;
    void router.push(choosePlacement());
}

function cancel(): void {
    stopPlacing();
    void router.push('/packages/' + encodeURIComponent(placing.packageId));
}

defineExpose({
    place: (cam: Camera, vp: Viewport) => {
        if (group.value) group.value.setAttribute('transform', cameraTransform(cam, vp));
        const seen = slugsOf([...placing.keys, placing.to]).map((slug) => (props.slotOf(slug) ? '1' : '0')).join('');
        if (seen !== known.value) known.value = seen;
    },
});
</script>

<template>
  <svg ref="svg" class="place-marks" aria-hidden="true">
    <g ref="group">
      <path
        v-if="outline"
        class="place-outline"
        :class="{ 'is-dragging': dragging }"
        :d="outline"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      />
    </g>
  </svg>
  <div class="place-bar" role="region" aria-label="Place a package">
    <p class="place-words"><b>{{ placing.title }}</b><span :class="{ 'is-error': !!placed.error }" role="status" aria-live="polite">{{ words }}</span></p>
    <p class="place-fine">Drag the outline to where it goes. It snaps to hexes.</p>
    <div class="place-acts">
      <button type="button" class="ui-btn" @click="cancel">Cancel</button>
      <button type="button" class="ui-btn is-primary" :disabled="!!placed.error" @click="preview">Preview</button>
    </div>
  </div>
</template>

<style>
.place-marks {
  position: absolute;
  top: 0;
  left: var(--rail-width);
  width: calc(100% - var(--rail-width));
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.place-outline {
  fill: var(--wash);
  stroke: var(--signal);
  stroke-width: 2;
  stroke-dasharray: 6 4;
  vector-effect: non-scaling-stroke;
  pointer-events: visiblePainted;
  cursor: grab;
  touch-action: none;
}

.place-outline.is-dragging {
  cursor: grabbing;
  stroke-dasharray: none;
}

.place-bar {
  position: absolute;
  left: calc(var(--rail-width) + (100% - var(--rail-width)) / 2);
  bottom: 16px;
  z-index: 5;
  box-sizing: border-box;
  width: min(520px, calc(100% - var(--rail-width) - 24px));
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13.5px/1.45 var(--font-text);
  transform: translateX(-50%);
}

.place-words {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.place-words b {
  color: var(--text-0);
}

.place-words .is-error {
  color: var(--danger);
}

.place-fine {
  margin: 2px 0 8px;
  color: var(--text-muted);
  font-size: 12.5px;
}

.place-acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 600px) {
  .place-bar {
    left: 12px;
    right: 12px;
    width: auto;
    transform: none;
  }
}
</style>
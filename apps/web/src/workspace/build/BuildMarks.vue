<script setup lang="ts">
/**
 * The build marks over the chart: every selected hex washed and outlined, the dashed hex of
 * a preview, the faint dashed hex of a removed system, the hex under the pointer with its
 * chip, an empty slot's ghost grid, and the box being dragged with what it would add or take
 * away (findings/builder_system_design.md §1 and §18). Drawn in the chart's own units inside
 * one group; the map view moves that group with the camera (`place`), so nothing here is
 * recomputed while panning. What follows the pointer (the hover, the box) is set straight on
 * its element and never passes through a render. It takes no pointer.
 */
import { computed, ref } from 'vue';
import type { Camera, Viewport } from '../../map/camera.ts';
import { cameraTransform, hexesPath, hexPoints, slotBox, type SectorPlace } from './marks.ts';
import { flight, flightSplit, revOf } from './flight.ts';
import { build } from './state.ts';
import { undoLeft } from './undo_words.ts';

export type HoverMark = {
    /** The hex's corners in parsecs, or empty when only a slot is hovered. */
    points: string;
    /** An empty slot's ghost grid as a path in parsecs, or empty. */
    ghost: string;
    tone: 'plain' | 'add' | 'take';
    /** An empty hex reads dashed, a filled one solid. */
    empty: boolean;
    words: string;
    /** Where the chip stands, in canvas pixels: above the hex, or below it. */
    chip: { x: number; y: number; below: boolean };
};

export type BoxMark = {
    rect: { x0: number; y0: number; x1: number; y1: number };
    /** The hexes the box would add or take away, as one path in parsecs. Null leaves the last one drawn. */
    path: string | null;
    take: boolean;
    words: string;
    /** The pointer, in canvas pixels: the count rides beside it. */
    at: { x: number; y: number };
};

const props = defineProps<{
    many: string[];
    preview: string;
    removed: string[];
    sectorOf: (slug: string) => SectorPlace | null;
    /** The empty slot that is selected, on the grid of sectors. */
    slot?: { x: number; y: number } | null;
    /** While a sector is being moved: the empty slots it may go to, and the one the keyboard is on. */
    targets?: { x: number; y: number }[];
    cursor?: { x: number; y: number; free: boolean } | null;
}>();

const group = ref<SVGGElement | null>(null);
const hoverEl = ref<SVGPolygonElement | null>(null);
const ghostEl = ref<SVGPathElement | null>(null);
const preEl = ref<SVGPathElement | null>(null);
const boxEl = ref<SVGRectElement | null>(null);
const chipEl = ref<HTMLElement | null>(null);
const countEl = ref<HTMLElement | null>(null);

const points = (keys: string[]): { key: string; at: string }[] =>
    keys.map((key) => ({ key, at: hexPoints(key, props.sectorOf) })).filter((item) => item.at !== '');
/** A selection of up to a sector's 1,280 hexes is one path: one element to lay out, however many hexes it holds. */
const manyAt = computed(() => hexesPath(props.many, props.sectorOf));
const removedAt = computed(() => points(props.removed));
const previewAt = computed(() => (props.preview ? hexPoints(props.preview, props.sectorOf) : ''));
const slotAt = computed(() => (props.slot ? slotBox(props.slot) : null));
const targetsAt = computed(() => (props.targets ?? []).map((slot) => ({ key: slot.x + ',' + slot.y, ...slotBox(slot) })));
const cursorAt = computed(() => (props.cursor ? { free: props.cursor.free, ...slotBox(props.cursor) } : null));
/**
 * Generation in flight, read from Build's state (no prop: the map view need not know): the hexes
 * still waiting march, each turns to a wash as its system lands, and one hex being rolled for a
 * preview marches until the preview is drawn.
 */
const inFlight = computed(() => flightSplit(flight.keys, flight.from, revOf));
const waitingAt = computed(() => {
    const keys = [...inFlight.value.waiting];
    if (build.rolling && !keys.includes(build.rolling)) keys.push(build.rolling);
    return keys.length ? hexesPath(keys, props.sectorOf) : '';
});
/** The hexes an Undo left as they are, while the toast that names them shows. */
const leftAt = computed(() => (undoLeft.keys.length ? hexesPath(undoLeft.keys, props.sectorOf) : ''));
const landedAt = computed(() => (inFlight.value.landed.length ? hexesPath(inFlight.value.landed, props.sectorOf) : ''));

function show(el: Element | null, on: boolean): void {
    if (!el) return;
    if (on) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
}

function moveTo(el: HTMLElement, x: number, y: number): void {
    el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
}

defineExpose({
    place: (cam: Camera, vp: Viewport) => {
        if (group.value) group.value.setAttribute('transform', cameraTransform(cam, vp));
    },
    /** The hex (or the empty slot) under the pointer; null clears it. */
    hover: (mark: HoverMark | null) => {
        const hex = hoverEl.value;
        const ghost = ghostEl.value;
        const chip = chipEl.value;
        if (!hex || !ghost || !chip) return;
        if (!mark) {
            show(hex, false);
            show(ghost, false);
            show(chip, false);
            return;
        }
        show(hex, mark.points !== '');
        if (mark.points && hex.getAttribute('points') !== mark.points) hex.setAttribute('points', mark.points);
        hex.dataset.tone = mark.tone;
        hex.dataset.empty = mark.empty ? '1' : '0';
        show(ghost, mark.ghost !== '');
        if (mark.ghost && ghost.getAttribute('d') !== mark.ghost) ghost.setAttribute('d', mark.ghost);
        show(chip, true);
        if (chip.textContent !== mark.words) chip.textContent = mark.words;
        chip.dataset.tone = mark.tone;
        chip.dataset.below = mark.chip.below ? '1' : '0';
        moveTo(chip, mark.chip.x, mark.chip.y);
    },
    /** The box being dragged, what it would add or take away, and the count beside the pointer; null ends it. */
    box: (mark: BoxMark | null) => {
        const rect = boxEl.value;
        const pre = preEl.value;
        const count = countEl.value;
        if (!rect || !pre || !count) return;
        if (!mark) {
            show(rect, false);
            show(pre, false);
            show(count, false);
            pre.setAttribute('d', '');
            return;
        }
        show(rect, true);
        rect.setAttribute('x', String(Math.min(mark.rect.x0, mark.rect.x1)));
        rect.setAttribute('y', String(Math.min(mark.rect.y0, mark.rect.y1)));
        rect.setAttribute('width', String(Math.abs(mark.rect.x1 - mark.rect.x0)));
        rect.setAttribute('height', String(Math.abs(mark.rect.y1 - mark.rect.y0)));
        rect.dataset.take = mark.take ? '1' : '0';
        show(pre, true);
        if (mark.path !== null) pre.setAttribute('d', mark.path);
        pre.dataset.take = mark.take ? '1' : '0';
        show(count, mark.words !== '');
        if (count.textContent !== mark.words) count.textContent = mark.words;
        count.dataset.tone = mark.take ? 'take' : 'add';
        moveTo(count, mark.at.x + 16, mark.at.y + 18);
    },
});
</script>

<template>
  <svg class="build-marks" aria-hidden="true">
    <g ref="group">
      <rect v-for="item in targetsAt" :key="'t' + item.key" class="build-mark-target" :x="item.x" :y="item.y" :width="item.width" :height="item.height" />
      <rect v-if="slotAt" class="build-mark-slot" :x="slotAt.x" :y="slotAt.y" :width="slotAt.width" :height="slotAt.height" />
      <rect v-if="cursorAt" class="build-mark-cursor" :class="{ 'is-taken': !cursorAt.free }" :x="cursorAt.x" :y="cursorAt.y" :width="cursorAt.width" :height="cursorAt.height" />
      <path ref="ghostEl" class="build-mark-ghost" hidden />
      <polygon v-for="item in removedAt" :key="'r' + item.key" class="build-mark-removed" :points="item.at" />
      <path v-if="manyAt" class="build-mark-many" :d="manyAt" />
      <polygon v-if="previewAt" class="build-mark-preview" :points="previewAt" />
      <path v-if="landedAt" class="build-mark-landed" :d="landedAt" />
      <path v-if="waitingAt" class="build-mark-working" :d="waitingAt" />
      <path v-if="leftAt" class="build-mark-left" :d="leftAt" />
      <path ref="preEl" class="build-mark-pre" hidden />
      <polygon ref="hoverEl" class="build-mark-hover" hidden />
    </g>
    <rect ref="boxEl" class="build-mark-box" hidden />
  </svg>
  <!-- The chips stand over the chart in its own pixels and take no pointer: they are words beside a mark, never a control. -->
  <div class="build-chips" aria-hidden="true">
    <span ref="chipEl" class="build-chip" hidden></span>
    <span ref="countEl" class="build-chip is-count" hidden></span>
  </div>
</template>

<style>
/* Laid exactly over the chart's canvas. */
.build-marks,
.build-chips {
  position: absolute;
  top: 0;
  left: var(--rail-width);
  width: calc(100% - var(--rail-width));
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.build-marks [hidden],
.build-chips [hidden] {
  display: none;
}

.build-marks polygon,
.build-marks rect,
.build-marks path,
.build-mark-box {
  vector-effect: non-scaling-stroke;
}

.build-mark-many {
  fill: var(--wash-faint);
  stroke: var(--chart-selected);
  stroke-width: 2;
}

.build-mark-preview {
  fill: none;
  stroke: var(--chart-selected);
  stroke-width: 2;
  stroke-dasharray: 6 5;
}

/* Generation in flight: a hex still waiting marches; one whose system has landed is washed. */
/* Amber, the tone of what to look at now, so a waiting hex stands apart from the selection's outline under it. */
.build-mark-working {
  fill: color-mix(in srgb, var(--attention) 10%, transparent);
  stroke: var(--attention);
  stroke-width: 2;
  stroke-dasharray: 5 5;
  animation: build-mark-march 0.9s linear infinite;
}

.build-mark-landed {
  fill: color-mix(in srgb, var(--signal) 22%, transparent);
  stroke: var(--chart-selected);
  stroke-width: 1.5;
}

/* A hex an Undo left as it is, because it had changed since: amber, solid, while the toast that names it shows. */
.build-mark-left {
  fill: color-mix(in srgb, var(--attention) 14%, transparent);
  stroke: var(--attention);
  stroke-width: 2.5;
}

@keyframes build-mark-march {
  to {
    stroke-dashoffset: -10;
  }
}

@media (prefers-reduced-motion: reduce) {
  .build-mark-working {
    animation: none;
  }
}

.build-mark-removed {
  fill: none;
  stroke: var(--text-faint);
  stroke-width: 1.5;
  stroke-dasharray: 3 5;
}

/* An empty slot, selected: the outline a selected hex has, at the size of a sector. */
.build-mark-slot {
  fill: var(--wash-faint);
  stroke: var(--chart-selected);
  stroke-width: 2;
}

/* A slot a sector may be moved to: amber, the one thing to look at while moving. */
.build-mark-target {
  fill: none;
  stroke: var(--attention);
  stroke-width: 1.5;
  stroke-dasharray: 6 5;
}

.build-mark-cursor {
  fill: color-mix(in srgb, var(--attention) 14%, transparent);
  stroke: var(--attention);
  stroke-width: 2.5;
}

.build-mark-cursor.is-taken {
  fill: none;
  stroke: var(--text-faint);
  stroke-dasharray: 3 5;
}

/* The hex under the pointer, before any press: solid when it holds a system, dashed when it is empty. */
.build-mark-hover {
  fill: none;
  stroke: var(--text-0);
  stroke-width: 1.5;
}

.build-mark-hover[data-empty="1"] {
  stroke-dasharray: 5 4;
}

/* A press would add it: the selection's tone. A press would take it away: the removal tone. */
.build-mark-hover[data-tone="add"] {
  fill: var(--wash-faint);
  stroke: var(--chart-selected);
  stroke-width: 2.5;
}

.build-mark-hover[data-tone="take"] {
  fill: color-mix(in srgb, var(--danger) 12%, transparent);
  stroke: var(--danger);
  stroke-width: 2.5;
}

/* An empty slot under the pointer: its edge and the lines between its sixteen subsectors. */
.build-mark-ghost {
  fill: none;
  stroke: var(--text-faint);
  stroke-width: 1;
  stroke-dasharray: 6 5;
}

/* What the box being dragged would add, or take away. */
.build-mark-pre {
  fill: color-mix(in srgb, var(--signal) 16%, transparent);
  stroke: var(--chart-selected);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.build-mark-pre[data-take="1"] {
  fill: color-mix(in srgb, var(--danger) 16%, transparent);
  stroke: var(--danger);
}

.build-mark-box {
  fill: var(--wash-faint);
  stroke: var(--signal);
  stroke-width: 1;
  stroke-dasharray: 4 3;
}

.build-mark-box[data-take="1"] {
  fill: color-mix(in srgb, var(--danger) 8%, transparent);
  stroke: var(--danger);
}

/* The chip: the hex's number and name, above the hex (or below it), never on it. */
.build-chip {
  position: absolute;
  top: 0;
  left: 0;
  margin: 0;
  padding: 3px 8px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  box-shadow: var(--shadow-chrome);
  color: var(--text-0);
  font: 600 12px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
  translate: -50% -100%;
}

.build-chip[data-below="1"] {
  translate: -50% 0;
}

.build-chip.is-count {
  translate: 0 0;
}

.build-chip[data-tone="add"] {
  border-color: var(--signal);
}

.build-chip[data-tone="take"] {
  border-color: var(--danger);
}
</style>

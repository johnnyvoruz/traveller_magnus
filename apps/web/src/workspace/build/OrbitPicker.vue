<script setup lang="ts">
/**
 * The orbit picker (findings/builder_system_design.md §22; mockups kb6_picker, kb6_pair,
 * kb6_moon, kb6_au, kb6_narrow). The app's one modal frame (`.ui-modal`, design/base.css): on the body,
 * a scrim, Esc to leave, focus back where it was. The picture is one SVG: what the body orbits
 * at the middle, every other body at its own orbit, a faint ring under the pointer and the
 * solid ring picked. Place writes the value into the draft; nothing is stored until Keep.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import { draftHandle } from './edit.ts';
import { handList, nodeTitle, orbitsValue } from './hand.ts';
import { closePicker, modeFor, wrapFocus, pAtRadius, pickParents, pickWords, placeOrbit, radiusOf, ringsAround, scaleFor, stepP, storedP, ticksOf } from './orbit_pick.ts';

const props = defineProps<{ body: string }>();

/** The picture's own units: a square, drawn at the size it is given. */
const SIZE = 460;
const C = SIZE / 2;
const OUTER = C - 22;

const form = computed(() => (draftHandle.value ? draftHandle.value.form.value : null));
const nodes = computed(() => (form.value ? handList(form.value) : []));
const node = computed(() => nodes.value.find((item) => item.id === props.body) ?? null);
const name = computed(() => (node.value ? nodeTitle(node.value) : ''));
const mode = computed(() => (form.value && node.value ? modeFor(form.value, node.value, nodes.value) : 'au'));
const parents = computed(() => pickParents(nodes.value, props.body));

function firstParent(): string {
    const now = node.value ? orbitsValue(node.value) : '';
    const list = parents.value.filter((item) => item.why === '');
    return list.some((item) => item.value === now) ? now : (list[0] ? list[0].value : '');
}

const parent = ref(firstParent());
const stored = form.value ? storedP(form.value, props.body, mode.value) : null;
/** The value picked: null until the body has one or one is chosen. */
const pinned = ref<number | null>(stored);
/** Where the pointer points, while it is over the picture. */
const hover = ref<number | null>(null);
const pressing = ref(false);

const around = computed(() => (form.value ? ringsAround(form.value, nodes.value, parent.value, props.body, mode.value) : { rings: [], unplaced: [] }));
/** Fixed while the picker is open, so the rings do not shift as the pointer moves. */
const scale = computed(() => scaleFor(mode.value, [...around.value.rings.map((ring) => ring.p), ...(stored === null ? [] : [stored])]));
const middle = computed(() => parent.value.split('+').map((id) => {
    const item = nodes.value.find((other) => other.id === id);
    return { id, name: item ? nodeTitle(item) : id, kind: item ? item.kind : 'star' };
}));
const inner = computed(() => (middle.value.length > 1 ? 40 : 26));
const r = (p: number): number => radiusOf(scale.value, p, inner.value, OUTER);
const parentName = computed(() => middle.value.map((item) => item.name).join(' and '));

const ticks = computed(() => ticksOf(scale.value));
const drawn = computed(() => around.value.rings.map((ring, index) => {
    const angle = -Math.PI / 2 + 0.55 + index * 0.62;
    const rr = r(ring.p);
    const x = C + rr * Math.cos(angle);
    const y = C + rr * Math.sin(angle);
    const flip = x > SIZE * 0.62;
    return { ...ring, rr, x, y, tx: flip ? x - 8 : x + 8, anchor: flip ? 'end' : 'start', label: ring.name + ' · ' + ring.words.replace(/ · .*/, '') };
}));

const words = computed(() => (pinned.value === null ? '' : pickWords(mode.value, pinned.value)));
const toWord = computed(() => (mode.value === 'pd' ? ' from ' : ' around '));
/** The picked body on its ring, and its chip on the side with room. */
const self = computed(() => {
    if (pinned.value === null) return null;
    const rr = r(pinned.value);
    const angle = -Math.PI / 4;
    const x = C + rr * Math.cos(angle);
    const y = C + rr * Math.sin(angle);
    const text = name.value + ' · ' + words.value;
    const w = text.length * 6.6 + 18;
    const left = x + 10 + w > SIZE - 4;
    return { rr, x, y, text, w, cx: left ? x - 10 - w : x + 10, cy: y - 30 < 4 ? y + 10 : y - 30 };
});

const picture = ref<SVGSVGElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
let box: { left: number; top: number; width: number } | null = null;
let returnTo: HTMLElement | null = null;

function measure(): void {
    const el = picture.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    box = { left: rect.left, top: rect.top, width: rect.width };
}

/** The pointer's distance from the middle, in the picture's units: measured once per press or entry, no layout per move. */
function pAt(event: PointerEvent): number | null {
    if (!box || box.width === 0) return null;
    const k = SIZE / box.width;
    const dx = (event.clientX - box.left) * k - C;
    const dy = (event.clientY - box.top) * k - C;
    return pAtRadius(scale.value, Math.hypot(dx, dy), inner.value, OUTER);
}

function onEnter(): void {
    measure();
}

function onMove(event: PointerEvent): void {
    const p = pAt(event);
    if (p === null) return;
    hover.value = p;
    if (pressing.value) pinned.value = p;
}

function onDown(event: PointerEvent): void {
    measure();
    const p = pAt(event);
    if (p === null) return;
    pressing.value = true;
    pinned.value = p;
    if (picture.value) {
        picture.value.setPointerCapture(event.pointerId);
        picture.value.focus();
    }
}

function onUp(event: PointerEvent): void {
    pressing.value = false;
    if (picture.value && picture.value.hasPointerCapture(event.pointerId)) picture.value.releasePointerCapture(event.pointerId);
}

function onLeave(): void {
    if (!pressing.value) hover.value = null;
}

function onPictureKey(event: KeyboardEvent): void {
    const up = event.key === 'ArrowUp' || event.key === 'ArrowRight';
    const down = event.key === 'ArrowDown' || event.key === 'ArrowLeft';
    if (up || down) {
        event.preventDefault();
        const from = pinned.value ?? (scale.value.lo + scale.value.hi) / 2;
        pinned.value = stepP(scale.value, from, up ? 1 : -1, event.shiftKey);
    } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        pinned.value = event.key === 'Home' ? scale.value.lo : scale.value.hi;
    } else if (event.key === 'Enter') {
        event.preventDefault();
        place();
    }
}

/** The controls Tab can reach inside the picker, in order. */
function stops(): HTMLElement[] {
    const root = dialog.value;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>('button, [tabindex="0"], select, input')].filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePicker();
        return;
    }
    // Focus stays in the picker while it is open: Tab past either end comes round to the other.
    if (event.key === 'Tab') {
        const list = stops();
        const at = list.indexOf(document.activeElement as HTMLElement);
        const next = wrapFocus(list.length, at, event.shiftKey);
        if (next !== null) {
            event.preventDefault();
            list[next].focus();
        }
    }
    // The map's and the panel's shortcuts do not fire under the modal.
    event.stopPropagation();
}

function choose(value: string): void {
    parent.value = value;
}

const canPlace = computed(() => pinned.value !== null && parent.value !== '' && !!node.value);

function place(): void {
    if (!canPlace.value || pinned.value === null) return;
    placeOrbit(props.body, parent.value, mode.value, pinned.value);
    closePicker();
}

/** Focus that lands outside the open picker any other way (a click on the page under the scrim's edge, a script) is brought back. */
function holdFocus(event: FocusEvent): void {
    const root = dialog.value;
    if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
    const list = stops();
    if (list.length) list[0].focus();
}

onMounted(() => {
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener('focusin', holdFocus);
    void nextTick(() => {
        measure();
        if (picture.value) picture.value.focus();
    });
});

onBeforeUnmount(() => {
    document.removeEventListener('focusin', holdFocus);
    // Back to the control that opened it; opened from the palette, to the body's own Pick orbit button.
    const opener = returnTo && returnTo.isConnected && returnTo.closest('.hand') ? returnTo : document.querySelector<HTMLElement>('.hand [data-command="build-body-orbit"]');
    const back = opener ?? (returnTo && returnTo.isConnected ? returnTo : null);
    if (back) back.focus();
});
</script>

<template>
  <Teleport to="body">
    <div ref="dialog" class="ui-modal pick" role="dialog" aria-modal="true" :aria-label="'Pick orbit for ' + name" @keydown="onKey">
      <div class="ui-modal-scrim" @click="closePicker()"></div>
      <div class="ui-modal-card pick-card">
        <div class="pick-bar">
          <b class="pick-title">Pick orbit for {{ name }}</b>
          <span class="pick-hint">Point to an orbit, then select it. To fine-tune, use the arrow keys.</span>
          <button type="button" class="ui-btn is-icon" aria-label="Close" title="Close (Esc)" @click="closePicker()">
            <Icon name="xmark" :size="14" />
          </button>
        </div>
        <div class="pick-body">
          <div class="pick-side" role="group" aria-label="Orbits">
            <h4 class="pick-head">Orbits</h4>
            <button
              v-for="item in parents"
              :key="item.value"
              type="button"
              class="pick-par"
              :class="{ 'is-on': item.value === parent }"
              :aria-pressed="item.value === parent ? 'true' : 'false'"
              :disabled="item.why !== ''"
              @click="choose(item.value)"
            >
              <b>{{ item.label }}</b><small v-if="item.why">{{ item.why }}</small>
            </button>
          </div>
          <div class="pick-stage">
            <svg
              ref="picture"
              class="pick-svg"
              :viewBox="'0 0 ' + SIZE + ' ' + SIZE"
              tabindex="0"
              role="slider"
              :aria-label="'Orbit of ' + name + toWord + parentName"
              :aria-valuemin="scale.lo"
              :aria-valuemax="scale.hi"
              :aria-valuenow="pinned === null ? undefined : pinned"
              :aria-valuetext="pinned === null ? 'No orbit picked' : words"
              @pointerenter="onEnter"
              @pointermove="onMove"
              @pointerdown="onDown"
              @pointerup="onUp"
              @pointercancel="onUp"
              @pointerleave="onLeave"
              @keydown="onPictureKey"
            >
              <g aria-hidden="true">
                <template v-for="tick in ticks" :key="'t' + tick.p">
                  <circle class="pick-tick" :cx="C" :cy="C" :r="r(tick.p)" />
                  <text class="pick-tickt" :x="C + r(tick.p) + 3" :y="C - 3">{{ tick.label }}</text>
                </template>
                <circle v-for="(item, index) in middle" :key="item.id" class="pick-mid" :data-kind="item.kind" :cx="middle.length > 1 ? C + (index ? 14 : -14) : C" :cy="C" :r="item.kind === 'star' ? 10 : 8" />
                <text class="pick-midt" :x="C" :y="C + 26">{{ parentName }}</text>
                <template v-for="ring in drawn" :key="ring.id">
                  <circle class="pick-ring" :cx="C" :cy="C" :r="ring.rr" />
                  <circle class="pick-body-dot" :data-kind="ring.kind" :cx="ring.x" :cy="ring.y" r="4.5" />
                  <text class="pick-ringt" :x="ring.tx" :y="ring.y + 4" :text-anchor="ring.anchor">{{ ring.label }}</text>
                </template>
                <circle v-if="hover !== null" class="pick-hover" :cx="C" :cy="C" :r="r(hover)" />
                <template v-if="self">
                  <circle class="pick-pin" :cx="C" :cy="C" :r="self.rr" />
                  <circle class="pick-self" :cx="self.x" :cy="self.y" r="6" />
                  <g :transform="'translate(' + self.cx + ' ' + self.cy + ')'">
                    <rect class="pick-chip" :width="self.w" height="22" rx="4" />
                    <text class="pick-chipt" x="9" y="15">{{ self.text }}</text>
                  </g>
                </template>
              </g>
            </svg>
          </div>
        </div>
        <p v-if="around.unplaced.length" class="pick-note">Not drawn, because they have no orbit yet: {{ around.unplaced.join(', ') }}.</p>
        <div class="pick-foot">
          <span class="pick-read" aria-live="polite">
            <template v-if="pinned !== null">{{ name }}: <b>{{ words }}</b>{{ toWord }}{{ parentName }}</template>
            <template v-else>To pick an orbit, select a place in the picture.</template>
          </span>
          <button type="button" class="ui-btn" @click="closePicker()">Cancel</button>
          <button type="button" class="ui-btn is-primary" :disabled="!canPlace" @click="place()">Place<kbd class="build-key">Enter</kbd></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* The frame (.ui-modal, its scrim and card) is design/base.css. The card here is narrower, scrolls, and keeps the page's type. */
.ui-modal-card.pick-card {
  box-sizing: border-box;
  width: min(780px, 100%);
  overflow: auto;
  background: var(--panel-raised);
  font: inherit;
}

.pick-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.pick-title {
  color: var(--text-0);
}

.pick-hint {
  flex: 1 1 auto;
  color: var(--text-muted);
  font-size: 12.5px;
}

.pick-body {
  display: flex;
  gap: 14px;
}

.pick-side {
  display: flex;
  flex: 0 0 190px;
  flex-direction: column;
  gap: 6px;
}

.pick-head {
  margin: 0;
  color: var(--text-muted);
  font: 700 11px/1.3 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pick-par {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 500 13px/1.35 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.pick-par.is-on {
  border-color: var(--signal);
  box-shadow: inset 3px 0 0 var(--signal);
}

.pick-par:disabled {
  opacity: 0.55;
  cursor: default;
}

.pick-par small {
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 400;
}

.pick-stage {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 460px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-0);
  line-height: 0;
}

.pick-svg {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  cursor: crosshair;
  touch-action: none;
}

.pick-svg:focus-visible {
  outline-offset: -2px;
}

.pick-tick {
  fill: none;
  stroke: var(--chart-grid);
  stroke-width: 1;
}

.pick-tickt {
  fill: var(--text-faint);
  font: 500 9px var(--font-code);
}

.pick-mid {
  fill: var(--star-g);
}

.pick-mid[data-kind="world"],
.pick-mid[data-kind="moon"] {
  fill: var(--chart-water);
}

.pick-mid[data-kind="gas"] {
  fill: var(--glyph-gas);
}

.pick-mid[data-kind="belt"] {
  fill: var(--glyph-belt);
}

.pick-midt {
  fill: var(--text-muted);
  font: 600 11px var(--font-text);
  text-anchor: middle;
}

.pick-ring {
  fill: none;
  stroke: var(--text-faint);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.pick-ringt {
  fill: var(--text-1);
  font: 500 11px var(--font-text);
}

.pick-body-dot {
  fill: var(--glyph-rock);
}

.pick-body-dot[data-kind="gas"] {
  fill: var(--glyph-gas);
}

.pick-body-dot[data-kind="belt"] {
  fill: var(--glyph-belt);
}

.pick-body-dot[data-kind="star"] {
  fill: var(--star-g);
}

.pick-hover {
  fill: none;
  stroke: var(--signal);
  stroke-opacity: 0.45;
  stroke-width: 1;
}

.pick-pin {
  fill: none;
  stroke: var(--signal);
  stroke-width: 2;
}

.pick-self {
  fill: var(--signal);
}

.pick-chip {
  fill: var(--bg-2);
  stroke: var(--signal);
}

.pick-chipt {
  fill: var(--text-0);
  font: 600 11px var(--font-code);
}

.pick-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 12.5px;
}

.pick-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pick-read {
  flex: 1 1 auto;
  color: var(--text-1);
}

.pick-read b {
  color: var(--text-0);
}

/* A narrow window: the parents wrap above the picture. */
@media (max-width: 640px) {
  .ui-modal.pick {
    padding: 8px;
  }

  .pick-body {
    flex-direction: column;
  }

  .pick-side {
    flex: 0 0 auto;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .pick-head {
    width: 100%;
  }

  .pick-hint {
    order: 3;
    flex-basis: 100%;
  }

  .pick-read {
    flex-basis: 100%;
  }
}
</style>

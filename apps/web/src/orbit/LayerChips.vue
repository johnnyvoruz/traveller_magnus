<script setup lang="ts">
/**
 * The orbit view's second row (legacy .sv-layout, .sv-layers and the View popover,
 * js/system_viewer.js:1861-1931): the layout (Orbits, Row, Column), the layers as real
 * checkboxes drawn as chips, and the View popover (scale, mainworld mark, ring strength).
 * It only reports changes; the stage owns what they mean (orbit/picture.ts Layers).
 */
import { nextTick } from 'vue';
import Icon from '../design/Icon.vue';
import type { FaIconName } from '../design/icons.ts';
import OrbitPopover from './OrbitPopover.vue';
import type { Layers, Mode } from './picture.ts';

const props = defineProps<{
    mode: Mode;
    layers: Layers;
    viewOpen: boolean;
}>();

const emit = defineEmits<{
    mode: [mode: Mode];
    layers: [layers: Layers];
    pop: [open: boolean];
}>();

const MODES: { mode: Mode; label: string; icon: FaIconName; title: string }[] = [
    { mode: 'orbits', label: 'Orbits', icon: 'bullseye', title: 'Bodies at their current orbital positions' },
    { mode: 'row', label: 'Row', icon: 'grip-lines-vertical', title: 'Line planets up left to right, star on the left, even spacing in orbit order' },
    { mode: 'column', label: 'Column', icon: 'grip-lines', title: 'Line planets up top to bottom, star at the top, even spacing in orbit order' },
];

type Toggle = 'paths' | 'moons' | 'habitable' | 'jump' | 'dayNight' | 'scan';

const TOGGLES: { key: Toggle; label: string; icon: FaIconName; title: string }[] = [
    { key: 'paths', label: 'Paths', icon: 'solar-system', title: 'Orbit paths for worlds and moons' },
    { key: 'moons', label: 'Moons', icon: 'moon', title: 'Moons and rings around each world' },
    {
        key: 'habitable', label: 'Habitable', icon: 'seedling',
        title: 'Habitable zone: green band around the habitable-zone center. Worlds here can have liquid water. It is a climate band, not a safe-jump line.',
    },
    {
        key: 'jump', label: 'Jump limit', icon: 'circle-dashed',
        title: 'Blue circle at 100 diameters from a star or world. A jump drive cannot engage inside it, so a ship inside the line has to fly out to the circle first.',
    },
    {
        key: 'dayNight', label: 'Day / night', icon: 'circle-half-stroke',
        title: 'Illustrative lighting facing the host star: the night half of each world, and a moon dimmed in its world’s shadow.',
    },
    {
        key: 'scan', label: 'Scan', icon: 'radar',
        title: 'Scan view: sensor outlines and designations on every world and moon, and a slow sweep around the primary. Makes small and night-side worlds easy to find.',
    },
];

/** Reports one switch, then makes the box show what the owner actually holds. */
function report(key: Toggle | 'linear' | 'markMainworld', event: Event): void {
    const input = event.target as HTMLInputElement;
    emit('layers', { ...props.layers, [key]: input.checked });
    void nextTick(() => { input.checked = props.layers[key]; });
}

function toggle(key: Toggle, event: Event): void {
    report(key, event);
}

function check(key: 'linear' | 'markMainworld', event: Event): void {
    report(key, event);
}

function strength(event: Event): void {
    const value = Number.parseFloat((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) emit('layers', { ...props.layers, pathStrength: value });
}
</script>

<template>
  <div class="orbit-view-row">
    <div class="orbit-layout" role="group" aria-label="Layout">
      <button
        v-for="item in MODES"
        :key="item.mode"
        type="button"
        :title="item.title"
        :aria-pressed="mode === item.mode ? 'true' : 'false'"
        @click="emit('mode', item.mode)"
      >
        <Icon :name="item.icon" :size="11" /><span>{{ item.label }}</span>
      </button>
    </div>
    <div class="orbit-layers" role="group" aria-label="Show on the picture">
      <label v-for="item in TOGGLES" :key="item.key" class="orbit-toggle" :title="item.title">
        <input type="checkbox" :checked="layers[item.key]" @change="toggle(item.key, $event)">
        <Icon :name="item.icon" :size="11" /><span>{{ item.label }}</span>
      </label>
    </div>
    <div class="orbit-view-pops">
      <OrbitPopover
        id="orbit-view-pop"
        :open="viewOpen"
        icon="sliders"
        label="View"
        title="Scale and orbit ring strength"
        @toggle="emit('pop', !viewOpen)"
        @close="emit('pop', false)"
      >
        <label class="orbit-pop-check" title="Space orbits in proportion to their AU. The star’s drawn size still holds the innermost orbit outside the disc.">
          <input type="checkbox" :checked="layers.linear" @change="check('linear', $event)">
          <span>Linear scale (true AU spacing)</span>
        </label>
        <label class="orbit-pop-check" title="The cyan star that marks the mainworld">
          <input type="checkbox" :checked="layers.markMainworld" @change="check('markMainworld', $event)">
          <span>Mark the mainworld</span>
        </label>
        <label class="orbit-pop-range">
          <span>Orbit ring strength</span>
          <input class="orbit-jog" type="range" min="0.1" max="1" step="0.05" :value="layers.pathStrength" @input="strength">
        </label>
      </OrbitPopover>
    </div>
  </div>
</template>

<style>
.orbit-view-row {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 8px 14px;
  background: var(--stage-head);
  border-bottom: 1px solid var(--line-1);
}

.orbit-layout {
  display: inline-flex;
  flex: 0 0 auto;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-3);
  overflow: hidden;
}

.orbit-layout button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  margin: 0;
  padding: 0 11px;
  border: 0;
  border-radius: 0;
  background: var(--stage-head);
  color: var(--text-muted);
  font: 600 12px/1 var(--font-text);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.orbit-layout button + button {
  border-left: 1px solid var(--signal-line);
}

.orbit-layout button[aria-pressed="true"] {
  background: var(--row-active);
  color: var(--signal);
}

.orbit-layout button:hover {
  background: var(--surface-2);
  color: var(--signal-bright);
}

.orbit-layout button:focus-visible {
  outline-offset: -2px;
}

.orbit-layers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* A real checkbox laid over a pill: the chip is its label. */
.orbit-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-pill);
  color: var(--text-muted);
  font: 600 12px/1 var(--font-text);
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.orbit-toggle input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.orbit-toggle:hover {
  border-color: var(--signal-dim);
  color: var(--text-1);
}

.orbit-toggle:has(input:checked) {
  border-color: var(--signal-dim);
  background: var(--surface-2);
  color: var(--text-0);
}

.orbit-toggle:has(input:checked) .ui-icon,
.orbit-toggle:has(input:checked) svg {
  color: var(--signal);
}

.orbit-toggle:has(input:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.orbit-view-pops {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.orbit-pop-check,
.orbit-pop-range {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
  font: 400 12px/1.4 var(--font-text);
  cursor: pointer;
  white-space: nowrap;
}

.orbit-pop-check + .orbit-pop-check {
  margin-top: 8px;
}

.orbit-pop-check input {
  margin: 0;
  accent-color: var(--signal);
}

.orbit-pop-range {
  justify-content: space-between;
  margin-top: 12px;
}

.orbit-pop-range .orbit-jog {
  width: 120px;
}

@media (prefers-reduced-motion: reduce) {
  .orbit-layout button,
  .orbit-toggle {
    transition: none;
  }
}
</style>

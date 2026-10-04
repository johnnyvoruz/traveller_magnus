<script setup lang="ts">
/**
 * The body chips along the bottom of the stage (design_reference.md §3 "View nav" and §7):
 * one chip per star and world in orbit order, the selected one filled. A world with moons
 * carries a second button that opens its moons. This row is the keyboard route to every body.
 */
import BodyGlyph from '../dossier/BodyGlyph.vue';
import Icon from '../design/Icon.vue';
import type { BodyChip } from './bodies.ts';

defineProps<{
    chips: BodyChip[];
    /** The selected body's key, or null. */
    selected: string | null;
    /** The key of the world whose moon list is open, or null. */
    moonsOpen: string | null;
}>();

defineEmits<{
    select: [key: string];
    moons: [key: string | null];
}>();

function holds(chip: BodyChip, key: string | null): boolean {
    return key !== null && chip.moons.some((moon) => moon.key === key);
}
</script>

<template>
  <nav class="orbit-chips" aria-label="Bodies in this system">
    <div v-for="chip in chips" :key="chip.key" class="orbit-chip-group" :class="{ 'is-held': holds(chip, selected) }">
      <button
        type="button"
        class="orbit-chip"
        :class="{ 'is-mainworld': chip.mainworld }"
        :aria-pressed="selected === chip.key ? 'true' : 'false'"
        :title="chip.name"
        @click="$emit('select', chip.key)"
      >
        <BodyGlyph :glyph="chip.glyph" :mainworld="chip.mainworld" :size="18" />
        <span>{{ chip.label }}</span>
      </button>
      <template v-if="chip.moons.length">
        <button
          type="button"
          class="orbit-chip orbit-chip-moons"
          :aria-expanded="moonsOpen === chip.key ? 'true' : 'false'"
          :aria-controls="'orbit-moons-' + chip.key"
          :aria-label="'Moons of ' + chip.name + ', ' + chip.moons.length"
          :title="'Moons of ' + chip.name"
          @click="$emit('moons', moonsOpen === chip.key ? null : chip.key)"
        >
          <Icon name="moon" :size="11" />
          <span>{{ chip.moons.length }}</span>
        </button>
        <div v-if="moonsOpen === chip.key" class="orbit-pop-backdrop" @click="$emit('moons', null)"></div>
        <div v-show="moonsOpen === chip.key" :id="'orbit-moons-' + chip.key" class="orbit-moons" role="group" :aria-label="'Moons of ' + chip.name">
          <button
            v-for="moon in chip.moons"
            :key="moon.key"
            type="button"
            class="orbit-chip"
            :class="{ 'is-mainworld': moon.mainworld }"
            :aria-pressed="selected === moon.key ? 'true' : 'false'"
            :title="moon.name"
            @click="$emit('select', moon.key)"
          >
            <BodyGlyph :glyph="moon.glyph" :mainworld="moon.mainworld" :size="16" />
            <span>{{ moon.label }}</span>
          </button>
        </div>
      </template>
    </div>
  </nav>
</template>

<style>
.orbit-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
}

.orbit-chip-group {
  position: relative;
  display: flex;
  flex: 0 0 auto;
}

.orbit-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  margin: 0;
  padding: 0 11px 0 8px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-pill);
  background: var(--chrome-glass);
  color: var(--text-1);
  font: 600 12px/1 var(--font-text);
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.orbit-chip:hover {
  border-color: var(--signal);
}

.orbit-chip.is-mainworld {
  border-color: var(--signal-edge);
}

.orbit-chip[aria-pressed="true"] {
  background: var(--signal);
  border-color: var(--signal);
  color: var(--on-signal);
}

.orbit-chip-group.is-held > .orbit-chip:first-child,
.orbit-chip-group.is-held > .orbit-chip-moons {
  border-color: var(--signal);
}

/* The chip and its moons button read as one pill. */
.orbit-chip-group:has(.orbit-chip-moons) > .orbit-chip:first-child {
  padding-right: 8px;
  border-right: 0;
  border-radius: var(--r-pill) 0 0 var(--r-pill);
}

.orbit-chip-moons {
  gap: 4px;
  padding: 0 10px 0 8px;
  border-radius: 0 var(--r-pill) var(--r-pill) 0;
  color: var(--text-muted);
  font-variant-numeric: var(--tabular);
}

.orbit-chip-moons .ui-icon {
  color: var(--signal-dim);
}

.orbit-chip-moons[aria-expanded="true"] {
  background: var(--row-active);
  border-color: var(--row-active-line);
  color: var(--signal-active);
}

.orbit-chip:focus-visible {
  outline-offset: 2px;
}

.orbit-moons {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: min(320px, 50vh);
  padding: 8px;
  overflow-y: auto;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-4);
  background: var(--stage-head);
  box-shadow: var(--shadow-pop);
}

.orbit-moons .orbit-chip {
  justify-content: flex-start;
}

@media (prefers-reduced-motion: reduce) {
  .orbit-chip {
    transition: none;
  }
}
</style>

<script setup lang="ts">
/**
 * The body chips along the bottom of the stage (design_reference.md §3 "View nav" and §7):
 * one chip per star and world in orbit order, the selected one filled. A world with moons
 * carries a second button that opens its moons. This row is the keyboard route to every body.
 * The mainworld carries the same star that marks it on the picture; when the mainworld is a
 * moon, the star sits on its world's moons button, so it can be found without opening the list.
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

/** The mainworld among a world's moons, or null. */
function mainMoon(chip: BodyChip): BodyChip | null {
    return chip.moons.find((moon) => moon.mainworld) || null;
}

function moonsTitle(chip: BodyChip): string {
    const main = mainMoon(chip);
    return 'Moons of ' + chip.name + (main ? ', with the mainworld ' + main.name : '');
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
        :title="chip.mainworld ? chip.name + ' (mainworld)' : chip.name"
        @click="$emit('select', chip.key)"
      >
        <BodyGlyph :glyph="chip.glyph" :mainworld="chip.mainworld" :size="18" />
        <span>{{ chip.label }}</span>
        <Icon v-if="chip.mainworld" class="orbit-chip-main" name="star" :size="11" />
        <span v-if="chip.mainworld" class="orbit-chip-sr">, mainworld</span>
      </button>
      <template v-if="chip.moons.length">
        <button
          type="button"
          class="orbit-chip orbit-chip-moons"
          :class="{ 'has-mainworld': mainMoon(chip) !== null }"
          :aria-expanded="moonsOpen === chip.key ? 'true' : 'false'"
          :aria-controls="'orbit-moons-' + chip.key"
          :aria-label="moonsTitle(chip) + ', ' + chip.moons.length"
          :title="moonsTitle(chip)"
          @click="$emit('moons', moonsOpen === chip.key ? null : chip.key)"
        >
          <Icon name="moon" :size="11" />
          <span>{{ chip.moons.length }}</span>
          <Icon v-if="mainMoon(chip)" class="orbit-chip-main" name="star" :size="11" />
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
            :title="moon.mainworld ? moon.name + ' (mainworld)' : moon.name"
            @click="$emit('select', moon.key)"
          >
            <BodyGlyph :glyph="moon.glyph" :mainworld="moon.mainworld" :size="16" />
            <span>{{ moon.label }}</span>
            <Icon v-if="moon.mainworld" class="orbit-chip-main" name="star" :size="11" />
            <span v-if="moon.mainworld" class="orbit-chip-sr">, mainworld</span>
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

/* The mainworld: the picture's star, and the signal colour on the chip's edge and name. */
.orbit-chip.is-mainworld,
.orbit-chip-moons.has-mainworld {
  border-color: var(--signal);
}

.orbit-chip.is-mainworld {
  color: var(--signal-bright);
}

.orbit-chip .orbit-chip-main {
  flex: 0 0 auto;
  color: var(--signal);
}

.orbit-chip[aria-pressed="true"] .orbit-chip-main {
  color: var(--on-signal);
}

/* The world that holds the mainworld among its moons shares the signal edge, so the pair reads as one. */
.orbit-chip-group:has(.orbit-chip-moons.has-mainworld) > .orbit-chip:first-child {
  border-color: var(--signal);
}

/* Read out, not shown. */
.orbit-chip-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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

.orbit-chip-moons .ui-icon:not(.orbit-chip-main) {
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

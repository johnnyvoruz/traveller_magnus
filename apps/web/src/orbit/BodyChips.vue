<script setup lang="ts">
/**
 * The body chips along the bottom of the stage (design_reference.md §3 "View nav" and §7):
 * one chip per star and world in orbit order, the selected one filled. A world with moons
 * carries a second button that opens its moons. This row is the keyboard route to every body.
 * The mainworld carries the same star that marks it on the picture; when the mainworld is a
 * moon, the star sits on its world's moons button, so it can be found without opening the list.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BodyGlyph from '../dossier/BodyGlyph.vue';
import Icon from '../design/Icon.vue';
import type { BodyChip } from './bodies.ts';

const props = defineProps<{
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

function satellites(chip: BodyChip): BodyChip[] {
    return chip.moons.filter((moon) => moon.glyph.kind !== 'belt');
}

function belts(chip: BodyChip): BodyChip[] {
    return chip.moons.filter((moon) => moon.glyph.kind === 'belt');
}

/** The mainworld among a world's moons, or null. */
function mainMoon(chip: BodyChip): BodyChip | null {
    return satellites(chip).find((moon) => moon.mainworld) || null;
}

function moonsTitle(chip: BodyChip): string {
    const main = satellites(chip).find((moon) => moon.mainworld) || null;
    return 'Moons of ' + chip.name + (main ? ', with the mainworld ' + main.name : '');
}

const scroller = ref<HTMLElement | null>(null);
const cutStart = ref(false);
const cutEnd = ref(false);
let stopSize: ResizeObserver | null = null;

/** A fade only on an edge the row has actually cut. */
function measureCut(): void {
    const el = scroller.value;
    if (!el) return;
    cutStart.value = el.scrollLeft > 1;
    cutEnd.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

onMounted(() => {
    measureCut();
    void nextTick(measureCut);
    if (typeof ResizeObserver === 'undefined' || !scroller.value) return;
    stopSize = new ResizeObserver(() => { measureCut(); });
    stopSize.observe(scroller.value);
});

watch(() => props.chips.length, () => { void nextTick(measureCut); });

onBeforeUnmount(() => {
    if (stopSize) stopSize.disconnect();
});
</script>

<template>
  <div class="orbit-chip-bar" :class="{ 'is-cut-start': cutStart, 'is-cut-end': cutEnd }">
  <nav ref="scroller" class="orbit-chips" aria-label="Bodies in this system" @scroll.passive="measureCut">
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
      <template v-if="satellites(chip).length">
        <button
          type="button"
          class="orbit-chip orbit-chip-moons"
          :class="{ 'has-mainworld': mainMoon(chip) !== null }"
          :aria-expanded="moonsOpen === chip.key ? 'true' : 'false'"
          :aria-controls="'orbit-moons-' + chip.key"
          :aria-label="moonsTitle(chip) + ', ' + satellites(chip).length"
          :title="moonsTitle(chip)"
          @click="$emit('moons', moonsOpen === chip.key ? null : chip.key)"
        >
          <Icon name="moon" :size="11" />
          <span class="orbit-chip-count">{{ satellites(chip).length }}</span>
          <Icon v-if="mainMoon(chip)" class="orbit-chip-main" name="star" :size="11" />
        </button>
        <div v-if="moonsOpen === chip.key" class="orbit-pop-backdrop" @click="$emit('moons', null)"></div>
        <div v-show="moonsOpen === chip.key" :id="'orbit-moons-' + chip.key" class="orbit-moons" role="group" :aria-label="'Moons of ' + chip.name">
          <button
            v-for="moon in satellites(chip)"
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
      <button
        v-for="belt in belts(chip)"
        :key="belt.key"
        type="button"
        class="orbit-chip"
        :aria-pressed="selected === belt.key ? 'true' : 'false'"
        :title="belt.name + ' (belt)'"
        @click="$emit('select', belt.key)"
      >
        <BodyGlyph :glyph="belt.glyph" :size="16" />
        <span>{{ belt.label }}</span>
        <span class="orbit-chip-sr">, belt</span>
      </button>
    </div>
  </nav>
  </div>
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

/* The moon count as a frame's count: Orbitron, teal. */
.orbit-chip-count {
  color: var(--signal);
  font: 700 12px/1 var(--font-display);
  letter-spacing: 0.04em;
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

/*
 * The phone (599 px): the chips are one row that scrolls sideways, so the picture keeps its height.
 * The scroller would clip a moons list hung from its chip, so the list stands over the chip row,
 * across the card, instead.
 */
@media (max-width: 599px) {
  .orbit-chips {
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    padding: 8px 10px;
  }

  .orbit-chips::-webkit-scrollbar {
    display: none;
  }

  .orbit-chip {
    min-width: 44px;
    min-height: 44px;
  }

  /* A mask fades the chips themselves, including the light type, at a cut edge. */
  .orbit-chip-bar.is-cut-end .orbit-chips {
    -webkit-mask-image: linear-gradient(to right, black calc(100% - 48px), transparent);
    mask-image: linear-gradient(to right, black calc(100% - 48px), transparent);
  }

  .orbit-chip-bar.is-cut-start .orbit-chips {
    -webkit-mask-image: linear-gradient(to right, transparent, black 48px);
    mask-image: linear-gradient(to right, transparent, black 48px);
  }

  .orbit-chip-bar.is-cut-start.is-cut-end .orbit-chips {
    -webkit-mask-image: linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent);
    mask-image: linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent);
  }

  .orbit-moons {
    position: fixed;
    right: calc(var(--chrome-inset) + 10px);
    bottom: calc(var(--chrome-inset) + max(var(--sheet-cover, 0px), env(safe-area-inset-bottom, 0px)) + 68px);
    left: calc(var(--rail-width) + var(--chrome-inset) + 10px);
    max-height: min(320px, 40vh);
  }
}

@media (prefers-reduced-motion: reduce) {
  .orbit-chip {
    transition: none;
  }
}
</style>

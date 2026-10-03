<script setup lang="ts">
/**
 * The small disc beside a body's name (js/system_inspector.js bodyGlyph, 224-268).
 * Shapes are the legacy ones; colours are tokens. Which glyph is chosen: glyph.ts.
 */
import { computed, useId } from 'vue';
import { glyphFor } from './glyph.ts';
import type { BodyGlyphData } from './model.ts';

const props = withDefaults(defineProps<{
    glyph: BodyGlyphData;
    mainworld?: boolean;
    size?: number;
}>(), { mainworld: false, size: 22 });

const look = computed(() => glyphFor(props.glyph));
const uid = useId();
const shade = computed(() => 'url(#' + uid + '-shade)');
const clip = computed(() => 'url(#' + uid + '-disc)');

const BELT: [number, number, number][] = [
    [4.5, 15, 1.3], [7.5, 11.5, 1.7], [11, 9.6, 1.2], [14.5, 8.4, 1.8], [18.3, 7.6, 1.2],
    [8.5, 17, 1], [13, 13.5, 1.5], [17, 11.5, 1.1], [20.2, 10.5, 1.4], [5, 19.5, 0.9],
];
const GAS_BANDS: [number, number][] = [[6.2, 1.6], [9.6, 1.1], [12, 2.4], [15.8, 1.3], [18.2, 1.8]];
const ROCK_MARKS: [number, number, number][] = [[9, 9.5, 1.9], [14.8, 14.2, 2.5], [15, 7.8, 1.1], [8.5, 15.5, 1]];
const MAINWORLD_STAR = '19.20,0.30 20.32,3.36 23.57,3.48 21.01,5.49 21.90,8.62 19.20,6.80 16.50,8.62 17.39,5.49 14.83,3.48 18.08,3.36';
</script>

<template>
  <svg
    class="glyph"
    :class="['glyph-' + look.kind, look.tone ? 'tone-' + look.tone : '']"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <radialGradient :id="uid + '-shade'" cx="36%" cy="32%" r="78%">
        <stop offset="0" class="glyph-stop-light" stop-opacity=".38" />
        <stop offset=".42" class="glyph-stop-light" stop-opacity="0" />
        <stop offset="1" class="glyph-stop-dark" stop-opacity=".6" />
      </radialGradient>
      <clipPath :id="uid + '-disc'" clipPathUnits="userSpaceOnUse">
        <circle cx="12" cy="12" r="8.5" />
      </clipPath>
    </defs>
    <template v-if="look.kind === 'star'">
      <circle class="glyph-tone" cx="12" cy="12" r="11.5" opacity=".14" />
      <circle class="glyph-tone" cx="12" cy="12" r="9.8" opacity=".24" />
      <circle class="glyph-tone" cx="12" cy="12" r="7.8" />
      <circle cx="12" cy="12" r="7.8" :fill="shade" opacity=".55" />
    </template>
    <template v-else-if="look.kind === 'belt'">
      <circle v-for="(rock, index) in BELT" :key="index" class="glyph-belt-rock" :cx="rock[0]" :cy="rock[1]" :r="rock[2]" />
    </template>
    <template v-else-if="look.kind === 'gas'">
      <circle class="glyph-gas-disc" cx="12" cy="12" r="8.5" />
      <g :clip-path="clip">
        <rect v-for="(band, index) in GAS_BANDS" :key="index" :class="'glyph-gas-band-' + (index + 1)" x="0" :y="band[0]" width="24" :height="band[1]" />
      </g>
      <circle cx="12" cy="12" r="8.5" :fill="shade" />
    </template>
    <template v-else>
      <circle class="glyph-rock-disc" cx="12" cy="12" r="8.5" />
      <g :clip-path="clip">
        <circle v-for="(mark, index) in ROCK_MARKS" :key="index" class="glyph-rock-mark" :cx="mark[0]" :cy="mark[1]" :r="mark[2]" />
      </g>
      <circle cx="12" cy="12" r="8.5" :fill="shade" />
    </template>
    <polygon v-if="mainworld" class="glyph-mainworld" :points="MAINWORLD_STAR" />
  </svg>
</template>

<style>
.glyph {
  flex: 0 0 auto;
  display: block;
  overflow: visible;
  --glyph-tone: var(--star-g);
}

.glyph.tone-o { --glyph-tone: var(--star-o); }
.glyph.tone-b { --glyph-tone: var(--star-b); }
.glyph.tone-a { --glyph-tone: var(--star-a); }
.glyph.tone-f { --glyph-tone: var(--star-f); }
.glyph.tone-g { --glyph-tone: var(--star-g); }
.glyph.tone-k { --glyph-tone: var(--star-k); }
.glyph.tone-m { --glyph-tone: var(--star-m); }
.glyph.tone-d { --glyph-tone: var(--star-d); }
.glyph.tone-bd { --glyph-tone: var(--star-bd); }

.glyph-tone { fill: var(--glyph-tone); }
.glyph-stop-light { stop-color: var(--glyph-light); }
.glyph-stop-dark { stop-color: var(--glyph-dark); }
.glyph-belt-rock { fill: var(--glyph-belt); }
.glyph-gas-disc { fill: var(--glyph-gas); }
.glyph-gas-band-1 { fill: var(--glyph-gas-band-1); }
.glyph-gas-band-2 { fill: var(--glyph-gas-band-2); }
.glyph-gas-band-3 { fill: var(--glyph-gas-band-3); }
.glyph-gas-band-4 { fill: var(--glyph-gas-band-4); }
.glyph-gas-band-5 { fill: var(--glyph-gas-band-5); }
.glyph-rock-disc { fill: var(--glyph-rock); }
.glyph-rock-mark { fill: var(--glyph-rock-mark); }

.glyph-mainworld {
  fill: var(--signal);
  stroke: var(--bg-1);
  stroke-width: 1;
  stroke-linejoin: round;
}
</style>

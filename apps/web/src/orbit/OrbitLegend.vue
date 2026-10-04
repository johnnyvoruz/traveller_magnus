<script setup lang="ts">
/**
 * The legend at the stage's lower left: one line per mark on the picture (orbit/legend.ts).
 * It takes no pointer input, so the picture under it can still be dragged and picked.
 */
import Icon from '../design/Icon.vue';
import type { LegendEntry } from './legend.ts';

defineProps<{ entries: LegendEntry[] }>();
</script>

<template>
  <ul v-if="entries.length" class="orbit-legend" aria-label="Legend">
    <li v-for="entry in entries" :key="entry.kind">
      <span class="orbit-legend-mark" aria-hidden="true">
        <Icon v-if="entry.kind === 'mainworld'" name="star" :size="11" />
        <i v-else :class="'is-' + entry.kind"></i>
      </span>
      <span>{{ entry.label }}</span>
    </li>
  </ul>
</template>

<style>
.orbit-legend {
  position: absolute;
  left: 18px;
  bottom: 14px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-width: calc(100% - 110px);
  margin: 0;
  padding: 8px 11px;
  list-style: none;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--chrome-glass);
  color: var(--text-1);
  font: 400 12px/1.3 var(--font-text);
  pointer-events: none;
}

.orbit-legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.orbit-legend-mark {
  display: inline-flex;
  flex: 0 0 20px;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 12px;
  color: var(--signal);
}

/* The habitable band: its wash and its dashed edge, as on the picture. */
.orbit-legend-mark .is-band,
.orbit-legend-mark .is-panel {
  box-sizing: border-box;
  width: 20px;
  height: 10px;
  border: 1px dashed var(--orbit-hz);
  background: color-mix(in srgb, var(--orbit-hz) 24%, transparent);
}

.orbit-legend-mark .is-panel {
  border-radius: 4px;
}

/* The 100D circle. */
.orbit-legend-mark .is-jump {
  box-sizing: border-box;
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--orbit-jump);
  border-radius: 50%;
}
</style>

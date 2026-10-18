<script setup lang="ts">
/**
 * The one icon component (design_reference.md §6). Icons the legacy app used are its own
 * Font Awesome glyphs, as outlines in icons.ts; `size` is the glyph's em, as a font-size was.
 * Three icons have no legacy Font Awesome source and are drawn here: `search` is the legacy
 * omnibox's own inline SVG, `retry` is new, and `dice` is the rail's die.
 */
import { computed } from 'vue';
import { FA_ICONS, type FaIconName } from './icons.ts';

const props = withDefaults(defineProps<{
    name: FaIconName | 'search' | 'retry' | 'dice';
    size?: number;
}>(), { size: 16 });

const glyph = computed(() => (props.name === 'search' || props.name === 'retry' || props.name === 'dice' ? null : FA_ICONS[props.name]));
</script>

<template>
  <svg
    v-if="glyph"
    class="ui-icon is-solid"
    :viewBox="'0 0 ' + glyph.w + ' ' + glyph.h"
    :width="size * glyph.w / glyph.h"
    :height="size"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="glyph.d" />
  </svg>
  <svg v-else class="ui-icon" viewBox="0 0 24 24" :width="size" :height="size" aria-hidden="true" focusable="false">
    <template v-if="name === 'search'">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </template>
    <template v-else-if="name === 'dice'">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.15" fill="currentColor" stroke="none" />
    </template>
    <path v-else d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
  </svg>
</template>

<script setup lang="ts">
/**
 * The layout choice at the picture's upper left (showpiece D2): Orbits, Row or Column, one
 * press, always in sight; 1, 2 and 3 from the keyboard. Each button names its command.
 */
import Icon from '../design/Icon.vue';
import type { FaIconName } from '../design/icons.ts';
import { LAYOUTS } from './commands.ts';
import type { Mode } from './picture.ts';

defineProps<{ mode: Mode }>();
defineEmits<{ mode: [mode: Mode] }>();

const ICONS: Record<Mode, FaIconName> = { orbits: 'bullseye', row: 'grip-lines-vertical', column: 'grip-lines' };
const TITLES: Record<Mode, string> = {
    orbits: 'Bodies at their orbital positions',
    row: 'The planets in a row, star at the left, in orbit order',
    column: 'The planets in a column, star at the top, in orbit order',
};
</script>

<template>
  <div class="orbit-corner" role="radiogroup" aria-label="Layout">
    <button
      v-for="item in LAYOUTS"
      :key="item.mode"
      type="button"
      role="radio"
      :data-command="item.id"
      :aria-checked="mode === item.mode ? 'true' : 'false'"
      :title="TITLES[item.mode] + ' (' + item.key + ')'"
      @click="$emit('mode', item.mode)"
    >
      <Icon :name="ICONS[item.mode]" :size="11" /><span>{{ item.label }}</span>
    </button>
  </div>
</template>

<style>
.orbit-corner {
  position: absolute;
  left: 14px;
  top: 14px;
  z-index: 3;
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
}

.orbit-corner button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 0;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-muted);
  font: 600 12.5px/1 var(--font-text);
  cursor: pointer;
}

.orbit-corner button:hover {
  color: var(--text-1);
}

.orbit-corner button[aria-checked="true"] {
  background: var(--row-active);
  color: var(--signal);
}

.orbit-corner button:focus-visible {
  outline-offset: -2px;
}
</style>

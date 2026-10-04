<script setup lang="ts">
/**
 * A button with a panel anchored to it (legacy .sv-pop, .sv-pop-btn, .sv-pop-panel).
 * The parent decides which popover is open, so only one is; a click anywhere else closes it.
 */
import Icon from '../design/Icon.vue';
import type { FaIconName } from '../design/icons.ts';

withDefaults(defineProps<{
    id: string;
    open: boolean;
    icon: FaIconName;
    label: string;
    title: string;
    /** Show the label beside the icon. Without it the label is the button's accessible name. */
    showLabel?: boolean;
    /** Open upward (for controls at the bottom of the stage). */
    up?: boolean;
    /** Align the panel to the button's left edge instead of its right. */
    start?: boolean;
}>(), { showLabel: true, up: false, start: false });

defineEmits<{ toggle: []; close: [] }>();
</script>

<template>
  <div class="orbit-pop" :class="{ 'is-up': up, 'is-start': start }">
    <button
      type="button"
      class="orbit-btn orbit-pop-btn"
      :class="{ 'is-icon': !showLabel }"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="id"
      :aria-label="showLabel ? undefined : label"
      :title="title"
      @click="$emit('toggle')"
    >
      <Icon :name="icon" :size="13" />
      <span v-if="showLabel">{{ label }}</span>
    </button>
    <div v-if="open" class="orbit-pop-backdrop" @click="$emit('close')"></div>
    <div v-show="open" :id="id" class="orbit-pop-panel" role="group" :aria-label="label">
      <slot />
    </div>
  </div>
</template>

<style>
.orbit-pop {
  position: relative;
  flex: 0 0 auto;
}

.orbit-pop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 6;
}

.orbit-pop-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 7;
  box-sizing: border-box;
  width: max-content;
  max-width: min(420px, 80vw);
  padding: 12px 14px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-4);
  background: var(--stage-head);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13px/1.5 var(--font-text);
}

.orbit-pop.is-start .orbit-pop-panel {
  right: auto;
  left: 0;
}

.orbit-pop.is-up .orbit-pop-panel {
  top: auto;
  bottom: calc(100% + 6px);
}

.orbit-pop-panel p {
  margin: 0 0 var(--sp-2);
}

.orbit-pop-note {
  color: var(--text-muted);
  font-size: 12px;
}
</style>

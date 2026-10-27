<script setup lang="ts">
/**
 * The round "Save image" control among a view's floating controls (streams/D.md DP1): the chart's
 * corner beside the map's help, the system map's and the world surface's frames. The host places
 * it; this file holds its look, the map help button's (workspace/MapHelp.vue), in tokens.
 */
import Icon from '../design/Icon.vue';

withDefaults(defineProps<{ title?: string }>(), { title: 'Save an image' });
const emit = defineEmits<{ (e: 'click'): void }>();
</script>

<template>
  <button type="button" class="save-img-btn" aria-label="Save image" :title="title" data-save-image-ask @click="emit('click')">
    <Icon name="file-export" :size="16" />
  </button>
</template>

<style>
.save-img-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--control-line);
  border-radius: 50%;
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.save-img-btn:hover {
  border-color: var(--signal);
  color: var(--signal);
}

.save-img-btn:focus-visible {
  outline: 1px solid var(--signal);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .save-img-btn {
    transition: none;
  }
}
</style>

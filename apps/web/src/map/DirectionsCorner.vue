<script setup lang="ts">
/**
 * Directions in the chart's corner, beside Save image and How to use the map (CU47).
 * The same look as those two. The word is the label; the glyph is the route.
 */
import Icon from '../design/Icon.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="dir-corner"
    :aria-pressed="open ? 'true' : 'false'"
    aria-label="Directions"
    title="Directions"
    data-directions-ask
    @click="emit('click')"
  >
    <Icon name="route" :size="16" />
  </button>
</template>

<style>
.dir-corner {
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

.dir-corner:hover,
.dir-corner[aria-pressed="true"] {
  border-color: var(--signal);
  color: var(--signal);
}

.dir-corner:focus-visible {
  outline: 1px solid var(--signal);
  outline-offset: 2px;
}

/* On a phone the corner control is a 44 px target. Above 599 px it stays 40. */
@media (max-width: 599px) {
  .dir-corner {
    width: 44px;
    height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dir-corner {
    transition: none;
  }
}
</style>

<script setup lang="ts">
/**
 * The app's one spinner, for work in flight: a ring with a gap at the size of an icon, so it can
 * stand in an icon's place without moving anything. Under reduced motion it stands still; the
 * words beside it carry the state. Decorative: what is happening is always said in words next to it.
 * Used by Build (workspace/build/) and the toast strip (shell/ToastStrip.vue).
 */
withDefaults(defineProps<{ size?: number }>(), { size: 13 });
</script>

<template>
  <svg class="ui-spin" :width="size" :height="size" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle class="ui-spin-track" cx="8" cy="8" r="6.25" />
    <circle class="ui-spin-arc" cx="8" cy="8" r="6.25" />
  </svg>
</template>

<style>
.ui-spin {
  flex: none;
  overflow: visible;
}

.ui-spin circle {
  fill: none;
  stroke-width: 2.25;
}

.ui-spin-track {
  stroke: currentColor;
  opacity: 0.25;
}

/* A quarter of the ring, turning. */
.ui-spin-arc {
  stroke: currentColor;
  stroke-dasharray: 10 40;
  stroke-linecap: round;
  transform-origin: 8px 8px;
  animation: ui-spin-turn 0.85s linear infinite;
}

@keyframes ui-spin-turn {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-spin-arc {
    animation: none;
  }
}
</style>

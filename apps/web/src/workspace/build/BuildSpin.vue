<script setup lang="ts">
/**
 * The spinner for work in flight (prompts/d_generate_feedback.md part 1). The app had none: this
 * is the one Build uses, a ring with a gap at the size of an icon, so it can stand in an icon's
 * place without moving anything. Under reduced motion it stands still; the words beside it carry
 * the state. Decorative: what is happening is always said in words next to it.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 13 });
</script>

<template>
  <svg class="build-spin" :width="size" :height="size" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle class="build-spin-track" cx="8" cy="8" r="6.25" />
    <circle class="build-spin-arc" cx="8" cy="8" r="6.25" />
  </svg>
</template>

<style>
.build-spin {
  flex: none;
  overflow: visible;
}

.build-spin circle {
  fill: none;
  stroke-width: 2.25;
}

.build-spin-track {
  stroke: currentColor;
  opacity: 0.25;
}

/* A quarter of the ring, turning. */
.build-spin-arc {
  stroke: currentColor;
  stroke-dasharray: 10 40;
  stroke-linecap: round;
  transform-origin: 8px 8px;
  animation: build-spin-turn 0.85s linear infinite;
}

@keyframes build-spin-turn {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .build-spin-arc {
    animation: none;
  }
}
</style>

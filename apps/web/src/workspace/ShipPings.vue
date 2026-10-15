<script setup lang="ts">
/**
 * Other people's ships, alive on the chart (Johnny, 2026-10-14: "we really want these ship blips
 * to sing on the map"). A slow sonar ping spreads from each hex of public ships and fades. Each
 * hex keeps its own beat, taken from its key, so the map twinkles rather than blinks at once. The
 * rings are CSS on the compositor: the chart is not redrawn for them. Reduced motion: no rings.
 * Laid over the chart's canvas, in its pixels; it takes no pointer.
 */
defineProps<{ pings: readonly { key: string; x: number; y: number }[] }>();

/** A beat in [0, 1) from the key, so a hex keeps its place in the rhythm while the map moves. */
function beat(key: string): number {
    let hash = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
}
</script>

<template>
  <div class="ship-pings" aria-hidden="true">
    <span
      v-for="ping in pings"
      :key="ping.key"
      class="ship-ping"
      :style="{ transform: 'translate(' + ping.x + 'px, ' + ping.y + 'px)', '--ping-beat': String(beat(ping.key)) }"
    ><i></i><i></i></span>
  </div>
</template>

<style>
.ship-pings {
  position: absolute;
  top: 0;
  left: var(--rail-width);
  width: calc(100% - var(--rail-width));
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.ship-ping {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
}

/* Two rings a half beat apart: one spreading as the other fades. */
.ship-ping i {
  position: absolute;
  left: calc(var(--ship-ping-reach) / -2);
  top: calc(var(--ship-ping-reach) / -2);
  width: var(--ship-ping-reach);
  height: var(--ship-ping-reach);
  box-sizing: border-box;
  border: 1.5px solid var(--chart-public);
  border-radius: 50%;
  opacity: 0;
  animation: ship-ping var(--ship-ping) var(--ease-out) infinite;
  animation-delay: calc(var(--ship-ping) * var(--ping-beat) * -1);
}

.ship-ping i + i {
  animation-delay: calc(var(--ship-ping) * (var(--ping-beat) + 0.5) * -1);
}

@keyframes ship-ping {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }
  12% {
    opacity: 0.7;
  }
  60% {
    opacity: 0;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ship-pings {
    display: none;
  }
}
</style>

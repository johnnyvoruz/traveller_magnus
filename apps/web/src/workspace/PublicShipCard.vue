<script setup lang="ts">
/**
 * Other people's ships on the chart (prompts/d_public_ships_map.md): hovering a ship's mark, or
 * tapping it on a phone, shows its name and who is aboard. Laid over the chart's canvas, in its
 * pixels. Not a control: it takes no pointer and has nothing to press.
 */
import { computed } from 'vue';
import { shipCardHeight, shipCardLines, shipCardPlace, type ShipCardBox, type ShipCardShip } from './public_ship_card.ts';

const props = defineProps<{
    card: { ships: readonly ShipCardShip[]; more: number; place: ShipCardBox } | null;
    width: number;
    height: number;
}>();

const lines = computed(() => (props.card ? shipCardLines(props.card.ships, props.card.more) : null));
const place = computed(() => (props.card && lines.value ? shipCardPlace(props.card.place, props.width, props.height, shipCardHeight(lines.value)) : null));
</script>

<template>
  <div class="pship-layer">
    <div
      v-if="lines && place"
      class="pship-card"
      role="tooltip"
      data-public-ship-card
      :style="{ left: place.left + 'px', top: place.top + 'px', maxWidth: place.width + 'px' }"
    >
      <div v-for="(line, i) in lines.ships" :key="i" class="pship-one">
        <p class="pship-name">{{ line.ship }}</p>
        <p v-if="line.aboard" class="pship-aboard"><span>Aboard:</span> {{ line.aboard }}</p>
      </div>
      <p v-if="lines.rest" class="pship-rest">{{ lines.rest }}</p>
    </div>
  </div>
</template>

<style>
/* Laid exactly over the chart's canvas, as Build's marks are. */
.pship-layer {
  position: absolute;
  top: 0;
  left: var(--rail-width);
  width: calc(100% - var(--rail-width));
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.pship-card {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  width: max-content;
  padding: 8px 12px 9px;
  border: 1px solid color-mix(in srgb, var(--chart-public) 45%, var(--line-1));
  border-radius: var(--r-3);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13px/1.4 var(--font-text);
  animation: pship-in var(--t-fast) var(--ease-out);
}

.pship-card p {
  margin: 0;
}

.pship-one {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* A ship's name in italics, in the colour of its mark. */
.pship-card .pship-name {
  color: var(--chart-public);
  font-style: italic;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.pship-card .pship-aboard {
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.pship-card .pship-aboard span,
.pship-card .pship-rest {
  color: var(--text-muted);
}

@keyframes pship-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pship-card {
    animation: none;
  }
}
</style>

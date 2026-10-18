<script setup lang="ts">
/**
 * The zoomed-out map's hover (streams/D.md DF8): a ring on the thing under the mouse that a click acts
 * on (a world, a track, the party's or a vessel's marker) and a small data block beside it saying what
 * the click opens. Its own layer over the chart: the map view moves it with show(), at most once a
 * frame, and the chart never redraws for it. Like Build's hover (BuildMarks.vue), it is set directly,
 * not re-rendered. Never on touch: the map view only calls it for a mouse.
 */
import { ref } from 'vue';
import type { ChartHoverMark } from '../map/hover_hit.ts';

const ringEl = ref<HTMLElement | null>(null);
const chipEl = ref<HTMLElement | null>(null);
const titleEl = ref<HTMLElement | null>(null);
const lineEl = ref<HTMLElement | null>(null);

/** The data block's gap from the ring, and the room it keeps from the canvas's right edge. */
const GAP = 8;
const CHIP_ROOM = 220;

let shownKey = '';

defineExpose({
    /** The mark under the mouse, in canvas pixels, and the canvas width; null clears it. */
    show: (mark: ChartHoverMark | null, width: number) => {
        const ring = ringEl.value;
        const chip = chipEl.value;
        const title = titleEl.value;
        const line = lineEl.value;
        if (!ring || !chip || !title || !line) return;
        if (!mark) {
            if (!shownKey) return;
            shownKey = '';
            ring.hidden = true;
            chip.hidden = true;
            return;
        }
        ring.hidden = false;
        chip.hidden = false;
        ring.style.translate = (mark.x - mark.r) + 'px ' + (mark.y - mark.r) + 'px';
        ring.style.width = mark.r * 2 + 'px';
        ring.style.height = mark.r * 2 + 'px';
        // Right of the ring, or left of it near the canvas's right edge.
        const left = mark.x + mark.r + GAP + CHIP_ROOM > width;
        chip.dataset.side = left ? 'left' : 'right';
        chip.style.translate = (left ? mark.x - mark.r - GAP : mark.x + mark.r + GAP) + 'px ' + mark.y + 'px';
        const key = mark.title + '\n' + mark.line;
        if (key !== shownKey) {
            shownKey = key;
            title.textContent = mark.title;
            line.textContent = mark.line;
            line.hidden = mark.line === '';
        }
    },
});
</script>

<template>
  <div class="chart-hover" aria-hidden="true">
    <span ref="ringEl" class="chart-hover-ring" hidden></span>
    <p ref="chipEl" class="chart-hover-chip" data-side="right" hidden>
      <b ref="titleEl"></b>
      <span ref="lineEl"></span>
    </p>
  </div>
</template>

<style>
.chart-hover {
  position: absolute;
  inset: 0 0 0 var(--rail-width);
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}

.chart-hover-ring {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  border: 2px solid var(--signal);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--frame-glow);
}

.chart-hover-chip {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  max-width: 260px;
  margin: 0;
  padding: 4px 9px 4px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  white-space: nowrap;
  transform: translateY(-50%);
}

.chart-hover-chip[data-side="left"] {
  transform: translate(-100%, -50%);
}

.chart-hover-chip b {
  overflow: hidden;
  color: var(--text-0);
  font: 700 11px/1.4 var(--font-display);
  letter-spacing: 0.1em;
  text-overflow: ellipsis;
  text-transform: uppercase;
}

.chart-hover-chip span {
  color: var(--text-muted);
  font: 400 11.5px/1.4 var(--font-text);
}

.chart-hover [hidden] {
  display: none;
}
</style>

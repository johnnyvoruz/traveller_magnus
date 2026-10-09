<script setup lang="ts">
/**
 * The build marks over the chart: every selected hex washed and outlined, the dashed hex of
 * a preview, the faint dashed hex of a removed system, and the box being dragged. Drawn in
 * the chart's own units inside one group; the map view moves that group with the camera
 * (`place`), so nothing here is recomputed while panning. It takes no pointer.
 */
import { computed, ref } from 'vue';
import type { Camera, Viewport } from '../../map/camera.ts';
import { cameraTransform, hexPoints, type SectorPlace } from './marks.ts';

const props = defineProps<{
    many: string[];
    preview: string;
    removed: string[];
    sectorOf: (slug: string) => SectorPlace | null;
    box: { x0: number; y0: number; x1: number; y1: number } | null;
}>();

const group = ref<SVGGElement | null>(null);

const points = (keys: string[]): { key: string; at: string }[] =>
    keys.map((key) => ({ key, at: hexPoints(key, props.sectorOf) })).filter((item) => item.at !== '');
const manyAt = computed(() => points(props.many));
const removedAt = computed(() => points(props.removed));
const previewAt = computed(() => (props.preview ? hexPoints(props.preview, props.sectorOf) : ''));

defineExpose({
    place: (cam: Camera, vp: Viewport) => {
        if (group.value) group.value.setAttribute('transform', cameraTransform(cam, vp));
    },
});
</script>

<template>
  <svg class="build-marks" aria-hidden="true">
    <g ref="group">
      <polygon v-for="item in removedAt" :key="'r' + item.key" class="build-mark-removed" :points="item.at" />
      <polygon v-for="item in manyAt" :key="'m' + item.key" class="build-mark-many" :points="item.at" />
      <polygon v-if="previewAt" class="build-mark-preview" :points="previewAt" />
    </g>
    <rect
      v-if="box"
      class="build-mark-box"
      :x="Math.min(box.x0, box.x1)"
      :y="Math.min(box.y0, box.y1)"
      :width="Math.abs(box.x1 - box.x0)"
      :height="Math.abs(box.y1 - box.y0)"
    />
  </svg>
</template>

<style>
/* Laid exactly over the chart's canvas. */
.build-marks {
  position: absolute;
  top: 0;
  left: var(--rail-width);
  width: calc(100% - var(--rail-width));
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.build-marks polygon,
.build-mark-box {
  vector-effect: non-scaling-stroke;
}

.build-mark-many {
  fill: var(--wash-faint);
  stroke: var(--chart-selected);
  stroke-width: 2;
}

.build-mark-preview {
  fill: none;
  stroke: var(--chart-selected);
  stroke-width: 2;
  stroke-dasharray: 6 5;
}

.build-mark-removed {
  fill: none;
  stroke: var(--text-faint);
  stroke-width: 1.5;
  stroke-dasharray: 3 5;
}

.build-mark-box {
  fill: var(--wash-faint);
  stroke: var(--signal);
  stroke-width: 1;
  stroke-dasharray: 4 3;
}
</style>

<script setup lang="ts">
import BodyGlyph from './BodyGlyph.vue';
import type { StellarLine } from './model.ts';

defineProps<{ lines: StellarLine[] }>();
</script>

<template>
  <div v-if="lines.length" class="doss-stellar">
    <h3 class="ui-heading">Stellar configuration</h3>
    <p v-for="(line, index) in lines" :key="index" class="doss-star">
      <BodyGlyph :glyph="line.glyph" :size="16" />
      <span>{{ line.text }}</span>
    </p>
  </div>
</template>

<style>
.doss-star {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
}
</style>

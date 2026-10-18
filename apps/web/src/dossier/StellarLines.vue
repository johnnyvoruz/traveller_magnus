<script setup lang="ts">
import BodyGlyph from './BodyGlyph.vue';
import CodeNote from './CodeNote.vue';
import { stellarWords } from './code_words.ts';
import type { StellarLine } from './model.ts';

defineProps<{ lines: StellarLine[] }>();
</script>

<template>
  <div v-if="lines.length" class="doss-stellar">
    <h3 class="ui-heading ui-kicker">Stellar configuration</h3>
    <p v-for="(line, index) in lines" :key="index" class="doss-star">
      <BodyGlyph :glyph="line.glyph" :size="16" />
      <CodeNote v-if="stellarWords(line.text)" :text="stellarWords(line.text) || ''" code="stellar">{{ line.text }}</CodeNote>
      <span v-else>{{ line.text }}</span>
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

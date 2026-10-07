<script setup lang="ts">
import { computed } from 'vue';
import type { Ribbon } from './model.ts';

const props = defineProps<{ ribbon: Ribbon }>();

const label = computed(() => {
    if (props.ribbon.kind === 'plain') return 'UWP ' + props.ribbon.text;
    const digits = props.ribbon.cells.map((cell) => cell.digit);
    return 'UWP ' + digits.slice(0, 7).join('') + props.ribbon.dash + digits[7];
});
</script>

<template>
  <div v-if="ribbon.kind === 'cells'" class="doss-ribbon" role="img" :aria-label="label" :title="label">
    <template v-for="(cell, index) in ribbon.cells" :key="cell.label">
      <span v-if="index === 7" class="doss-dash">{{ ribbon.dash }}</span>
      <span class="doss-cell">
        <b>{{ cell.digit }}</b>
        <small>{{ cell.label }}</small>
      </span>
    </template>
  </div>
  <p v-else class="doss-uwp-plain">{{ ribbon.text }}</p>
</template>

<style>
/* Legacy .atlas-uwp-ribbon: the UWP string with a label under each digit.
   A cell keeps the width of its caption. In a narrow column the row wraps
   instead of letting the captions paint over each other. */
.doss-ribbon {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  align-content: flex-start;
  width: 100%;
  max-width: 100%;
  gap: 2px;
  margin: 4px 0 14px;
}

.doss-cell {
  display: grid;
  justify-items: center;
  flex: 1 1 0;
  min-width: min-content;
  padding: 6px 1px 5px;
  border-radius: var(--r-2);
  background: var(--wash-faint);
}

.doss-cell b {
  color: var(--signal);
  font: 700 20px/1.1 var(--font-code);
}

.doss-cell small {
  color: var(--text-muted);
  font-size: 9.5px;
  letter-spacing: 0;
  line-height: 1.2;
  text-transform: uppercase;
  white-space: nowrap;
}

.doss-dash {
  flex: 0 0 auto;
  align-self: center;
  padding: 0 1px;
  color: var(--text-muted);
  font: 700 18px/1 var(--font-code);
}

.doss-uwp-plain {
  margin: 4px 0 14px;
  color: var(--signal);
  font: 400 24px/1.2 var(--font-code);
  letter-spacing: 2px;
}
</style>

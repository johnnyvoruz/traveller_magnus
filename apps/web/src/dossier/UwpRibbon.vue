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
/* Legacy .atlas-uwp-ribbon: the UWP string with a label under each digit, across the full width. */
.doss-ribbon {
  display: flex;
  align-items: stretch;
  gap: 3px;
  margin: 4px 0 14px;
}

.doss-cell {
  display: grid;
  justify-items: center;
  flex: 1 1 0;
  min-width: 0;
  padding: 6px 0 5px;
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
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.doss-dash {
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

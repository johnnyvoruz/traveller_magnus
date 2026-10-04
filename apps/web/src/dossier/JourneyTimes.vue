<script setup lang="ts">
import type { JourneyTime } from './model.ts';

defineProps<{ journey: JourneyTime[] }>();
</script>

<template>
  <section class="doss-section">
    <h3 class="ui-heading">100D Jump Travel Times</h3>
    <dl class="doss-journey">
      <div v-for="item in journey" :key="item.g">
        <dt>{{ item.g }}G</dt>
        <dd>{{ item.hours }}</dd>
      </div>
    </dl>
  </section>
</template>

<style>
/* Six figures, three across, using the fact-tile type and the section heading. */
.doss-journey {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}

.doss-journey dt {
  margin: 0;
  color: var(--text-muted);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.doss-journey dd {
  margin: 2px 0 0;
  color: var(--text-1);
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: var(--tabular);
  line-height: 1.3;
}
</style>

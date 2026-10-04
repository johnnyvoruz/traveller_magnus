<script setup lang="ts">
import type { JourneyTime } from './model.ts';

defineProps<{ journey: JourneyTime[] }>();

/** "24.34h" as its figure and its unit, so the unit can sit small beside the number. */
function parts(text: string): { figure: string; unit: string } {
    const matched = /^([\d.,\u2212-]+)\s*([^\d\s].*)$/.exec(text.trim());
    return matched ? { figure: matched[1] || text, unit: matched[2] || '' } : { figure: text, unit: '' };
}
</script>

<template>
  <section class="doss-section doss-journey-section">
    <h3 class="ui-heading">100D Jump Travel Times</h3>
    <dl class="doss-journey">
      <div v-for="item in journey" :key="item.g" class="doss-fact doss-journey-tile">
        <dt><b>{{ item.g }}</b>G</dt>
        <dd>
          {{ parts(item.hours).figure }}<span v-if="parts(item.hours).unit" class="doss-journey-unit">{{ parts(item.hours).unit }}</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style>
/* The headline-fact tiles again (.doss-fact), six of them: three across, six when there is room. */
.doss-journey {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.doss-journey .doss-journey-tile {
  flex: 1 1 30%;
}

.doss-body[data-span="half"] .doss-journey .doss-journey-tile,
.doss-body[data-span="full"] .doss-journey .doss-journey-tile {
  flex-basis: 14%;
}

.doss-journey-tile {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.doss-journey-tile dt {
  flex: 0 0 auto;
  color: var(--signal);
  font: 700 11px/1.3 var(--font-code);
  letter-spacing: 0.04em;
}

.doss-journey-tile dt b {
  font-size: 14px;
}

.doss-journey-tile dd {
  margin: 0;
  white-space: nowrap;
}

.doss-journey-unit {
  margin-left: 3px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
}
</style>

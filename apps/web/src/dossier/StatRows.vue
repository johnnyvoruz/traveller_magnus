<script setup lang="ts">
import { tempLines } from '../design/units.ts';
import type { StatRow } from './model.ts';

defineProps<{ rows: StatRow[] }>();
</script>

<template>
  <dl v-if="rows.length" class="doss-stats">
    <div v-for="row in rows" :key="row.label" class="doss-stat" :class="row.zone ? 'is-' + row.zone : ''">
      <dt>{{ row.label }}</dt>
      <dd v-if="row.chips" class="doss-chips">
        <span v-for="(chip, index) in row.chips" :key="chip.code + chip.name + index" class="ui-chip">
          <b v-if="chip.code">{{ chip.code }}</b>
          {{ chip.name }}
        </span>
      </dd>
      <template v-else-if="row.code">
        <dd class="ui-code doss-code" :class="{ 'is-solo': !row.name }">{{ row.code }}</dd>
        <dd v-if="row.name" class="doss-name">{{ row.name }}</dd>
      </template>
      <dd v-else-if="tempLines(row.text)" class="doss-value doss-value-lines">
        <span v-for="line in tempLines(row.text)" :key="line">{{ line }}</span>
      </dd>
      <dd v-else class="doss-value">{{ row.text }}</dd>
    </div>
  </dl>
</template>

<style>
/* Legacy .atlas-stats: label over name at the left, the code as a badge at the right. */
.doss-stats {
  display: flex;
  flex-direction: column;
  margin: 12px 0 18px;
  border-top: 1px solid var(--line-1);
}

.doss-section > .doss-stats {
  margin-top: 0;
}

.doss-stat {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 14px;
  row-gap: 4px;
  align-items: center;
  padding: 7px 0 8px;
  border-bottom: 1px solid var(--line-soft);
}

.doss-stat dt {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
}

.doss-stat dd {
  margin: 0;
}

.doss-name,
.doss-value,
.doss-chips {
  min-width: 0;
}

.doss-code,
.doss-value {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  text-align: right;
}

.doss-code {
  grid-row: 1 / span 2;
  align-self: center;
}

.doss-code.is-solo {
  grid-row: 1;
}

.doss-name {
  grid-column: 1;
  grid-row: 2;
  color: var(--text-1);
  font-size: 13.5px;
  line-height: 1.4;
  text-wrap: pretty;
}

.doss-value {
  font-variant-numeric: var(--tabular);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

/* A value of several figures (a temperature in three scales): one per line, the first the headline. */
.doss-value-lines span {
  display: block;
}

.doss-value-lines span + span {
  color: var(--text-muted);
  font-size: 12px;
}

.doss-chips {
  grid-column: 1 / -1;
  grid-row: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.doss-stat.is-green { --zone-colour: var(--zone-green); --zone-wash: var(--zone-green-wash); }
.doss-stat.is-amber { --zone-colour: var(--zone-amber); --zone-wash: var(--zone-amber-wash); }
.doss-stat.is-red { --zone-colour: var(--zone-red); --zone-wash: var(--zone-red-wash); }

.doss-stat:is(.is-green, .is-amber, .is-red) .doss-code {
  background: var(--zone-wash);
  color: var(--zone-colour);
}

.doss-stat:is(.is-green, .is-amber, .is-red) .doss-name {
  color: var(--zone-colour);
}
</style>

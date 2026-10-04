<script setup lang="ts">
import { tempLines } from '../design/units.ts';
import type { FactTile } from './model.ts';

defineProps<{ facts: FactTile[] }>();

/** A temperature's three figures stack: the first is the headline, the others sit under it. */
function lines(fact: FactTile): string[] {
    return tempLines(fact.value) ?? [fact.value];
}
</script>

<template>
  <dl v-if="facts.length" class="doss-facts">
    <div v-for="fact in facts" :key="fact.label" class="doss-fact">
      <dt>{{ fact.label }}</dt>
      <dd>
        {{ lines(fact)[0] }}
        <small v-for="line in lines(fact).slice(1)" :key="line">{{ line }}</small>
        <small v-if="fact.note">{{ fact.note }}</small>
      </dd>
    </div>
  </dl>
</template>

<style>
/* Legacy .atlas-facts: headline numbers as tiles. */
.doss-facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 6px;
  margin: 0 0 6px;
}

.doss-fact {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.doss-fact dt {
  margin: 0;
  color: var(--text-muted);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.doss-fact dd {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: var(--tabular);
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.doss-fact dd small {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
}
</style>

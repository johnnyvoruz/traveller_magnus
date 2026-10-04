<script setup lang="ts">
import { tempLines } from '../design/units.ts';
import type { FactTile } from './model.ts';

const props = defineProps<{
    facts: FactTile[];
    /** A tile's words restated by the view, by its label: the headline, then one note to a line. */
    restated?: Record<string, { value: string; notes: string[] }>;
}>();

/** What a world is, before how its time runs: these three lead, the rest follow in a row of their own. */
const PHYSICAL = ['Diameter', 'Gravity', 'Mean temp.'];

function groups(facts: FactTile[]): FactTile[][] {
    const lead = facts.filter((fact) => PHYSICAL.includes(fact.label));
    // A star's tiles, or any set without all three, stay as one row.
    if (lead.length !== PHYSICAL.length) return [facts];
    return [lead, facts.filter((fact) => !PHYSICAL.includes(fact.label))].filter((group) => group.length);
}

/** A temperature's three figures stack: the first is the headline, the others sit under it. */
function lines(fact: FactTile): string[] {
    const again = props.restated ? props.restated[fact.label] : undefined;
    if (again) return [again.value, ...again.notes];
    return tempLines(fact.value) ?? [fact.value];
}
</script>

<template>
  <template v-if="facts.length">
    <dl v-for="(group, index) in groups(facts)" :key="index" class="doss-facts" :class="{ 'is-grouped': groups(facts).length > 1 }">
      <div v-for="fact in group" :key="fact.label" class="doss-fact">
        <dt>{{ fact.label }}</dt>
        <dd>
          {{ lines(fact)[0] }}
          <small v-for="line in lines(fact).slice(1)" :key="line">{{ line }}</small>
          <small v-if="fact.note">{{ fact.note }}</small>
        </dd>
      </div>
    </dl>
  </template>
</template>

<style>
/* Legacy .atlas-facts: headline numbers as tiles. They flex: each row's tiles share its width. */
.doss-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 6px;
}

.doss-fact {
  flex: 1 1 104px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

/* A world's tiles: what it is (size, gravity, temperature) in a row of three, then how its time runs. */
.doss-facts.is-grouped .doss-fact {
  flex-basis: 30%;
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

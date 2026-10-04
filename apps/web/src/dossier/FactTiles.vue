<script setup lang="ts">
import { tempLines } from '../design/units.ts';
import type { FactTile } from './model.ts';

/** One line of a restated tile: a figure, and to its right what it counts, one note to a line. */
export type FactRow = { value: string; notes: string[] };

const props = defineProps<{
    facts: FactTile[];
    /** A tile's words restated by the view, by its label: one row per figure. */
    restated?: Record<string, FactRow[]>;
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
    return tempLines(fact.value) ?? [fact.value];
}

/** The rows the view restated this tile as, or null for a tile shown as the model gives it. */
function rows(fact: FactTile): FactRow[] | null {
    const again = props.restated ? props.restated[fact.label] : undefined;
    return again && again.length ? again : null;
}
</script>

<template>
  <template v-if="facts.length">
    <dl v-for="(group, index) in groups(facts)" :key="index" class="doss-facts" :class="{ 'is-grouped': groups(facts).length > 1 }">
      <div v-for="fact in group" :key="fact.label" class="doss-fact">
        <dt>{{ fact.label }}</dt>
        <dd v-if="rows(fact)" class="doss-fact-rows">
          <span v-for="row in rows(fact)" :key="row.value + row.notes.join()" class="doss-fact-row">
            <b>{{ row.value }}</b>
            <span class="doss-fact-side"><small v-for="note in row.notes" :key="note">{{ note }}</small></span>
          </span>
        </dd>
        <dd v-else>
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

/* A restated tile: each figure with what it counts to its right, the figure centred on its notes. */
.doss-fact-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

/* A tile with rows needs the width for its words, so it takes a double share of its row. */
.doss-facts.is-grouped .doss-fact:has(.doss-fact-rows) {
  flex: 2 1 36%;
}

.doss-facts.is-grouped:has(.doss-fact-rows) .doss-fact:not(:has(.doss-fact-rows)) {
  flex-basis: 22%;
}

.doss-fact-row + .doss-fact-row {
  margin-top: 3px;
}

.doss-fact-row b {
  flex: 0 0 auto;
  font-weight: 600;
}

.doss-fact-side {
  flex: 1 1 auto;
  min-width: 0;
}
</style>

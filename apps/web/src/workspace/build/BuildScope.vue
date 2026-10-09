<script setup lang="ts">
/**
 * The pane's body in Build when what is selected is a sector or a subsector
 * (findings/builder_system_design.md §5). A sector shows its sixteen subsectors as the way
 * down; both then show the many-hex pane over their own hexes, so generating a subsector is
 * the same sheet and the same acts as for hexes picked by hand. Mounted by the panel host
 * when the address is a sector or a subsector and Build is on.
 */
import { computed } from 'vue';
import { placeNames } from './acts.ts';
import BuildPane from './BuildPane.vue';
import { scopeKeys, subsectorCells } from './scope.ts';

const props = defineProps<{
    slug: string;
    /** Null is the whole sector. */
    letter: string | null;
    span?: 'column' | 'half' | 'full';
}>();

defineEmits<{
    /** A subsector of this sector was chosen. */
    subsector: [letter: string];
    /** One hex of the list was chosen. */
    open: [hexKey: string];
}>();

const keys = computed(() => scopeKeys({ slug: props.slug, letter: props.letter }));
const cells = computed(() => subsectorCells(props.slug, (hexKey) => placeNames(hexKey).subsector));
</script>

<template>
  <div class="build-scope">
    <nav v-if="letter === null" class="build-subs" aria-label="Subsectors">
      <h3 class="ui-heading">Subsectors</h3>
      <div class="build-subs-grid">
        <button v-for="cell in cells" :key="cell.letter" type="button" @click="$emit('subsector', cell.letter)">
          <b>{{ cell.letter }}</b><span>{{ cell.name }}</span>
        </button>
      </div>
    </nav>
    <BuildPane mode="many" :keys="keys" :span="span" @open="$emit('open', $event)" />
  </div>
</template>

<style>
.build-subs {
  padding: 14px 16px 0;
}

.build-subs > .ui-heading {
  margin-top: 0;
}

/* Four across, as the subsectors lie on the chart. */
.build-subs-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}

.build-subs-grid button {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--panel-raised);
  color: var(--signal);
  font: 400 12px/1.35 var(--font-text);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.build-subs-grid button:hover {
  border-color: var(--signal);
  background: var(--row-active);
}

.build-subs-grid b {
  color: var(--text-muted);
  font: 700 11px/1.2 var(--font-code);
}

.build-subs-grid span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .build-subs-grid button {
    transition: none;
  }
}
</style>

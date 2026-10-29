<script setup lang="ts">
/**
 * The Paint rail of the large surface map (DW2): the palette the referee paints with, in the
 * colours and the order of `hybrid/codes.ts` (the 19 terrains, the 3 accents, the features, then
 * Clear hex), the count of painted hexes with Clear map, and Keep and Discard as Build's draft.
 * It holds nothing: the stage owns the draft and tells it what to show.
 */
import { computed } from 'vue';
import Icon from '../design/Icon.vue';
import type { RGB } from './hybrid/codes.ts';
import { paintedWords, paletteGroups, swatchKey, type Swatch } from './paint_edits.ts';

const props = defineProps<{
    swatch: Swatch;
    count: number;
    dirty: boolean;
    busy: boolean;
    /** A line to say: the world changed since the map was painted, or the store's refusal. */
    note: string;
}>();

const emit = defineEmits<{
    pick: [swatch: Swatch];
    clear: [];
    keep: [];
    discard: [];
}>();

const groups = paletteGroups();
const current = computed(() => swatchKey(props.swatch));

function cssOf(rgb: RGB): string {
    return 'rgb(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ')';
}
</script>

<template>
  <aside class="paint-rail" data-paint-rail aria-label="Paint">
    <div class="paint-head">
      <p class="paint-count" data-paint-count role="status">{{ paintedWords(count) }}</p>
      <button type="button" class="ui-btn paint-clear-map" data-paint-clear-map :disabled="count === 0 || busy" title="Every hex back to the generated map. Undo is in the message that follows" @click="emit('clear')">Clear map</button>
    </div>
    <p v-if="note" class="paint-note" role="status" data-paint-note>{{ note }}</p>
    <div class="paint-groups">
      <section v-for="group in groups" :key="group.name || 'clear'" class="paint-group">
        <h3 v-if="group.name" class="paint-group-head">{{ group.name }}</h3>
        <div class="paint-swatches" role="radiogroup" :aria-label="group.name || 'Clear'">
          <button
            v-for="row in group.rows"
            :key="swatchKey(row.swatch)"
            type="button"
            class="paint-swatch"
            :class="{ 'is-current': swatchKey(row.swatch) === current }"
            role="radio"
            :aria-checked="swatchKey(row.swatch) === current ? 'true' : 'false'"
            :data-swatch="swatchKey(row.swatch)"
            :title="row.row ? row.name : 'Back to the generated hex'"
            @click="emit('pick', row.swatch)"
          >
            <span class="paint-chip" :class="{ 'is-clear': !row.row }" :style="row.row ? { background: cssOf(row.row.rgb) } : undefined" aria-hidden="true"></span>
            <span class="paint-name">{{ row.name }}</span>
          </button>
        </div>
      </section>
    </div>
    <div class="paint-foot">
      <button type="button" class="ui-btn" data-paint-discard :disabled="!dirty || busy" @click="emit('discard')">Discard</button>
      <button type="button" class="ui-btn is-primary" data-paint-keep :disabled="!dirty || busy" :aria-busy="busy ? 'true' : undefined" title="Keep the painted map for everyone in this universe" @click="emit('keep')">
        <Icon name="check" :size="13" />{{ busy ? 'Keeping…' : 'Keep' }}
      </button>
    </div>
  </aside>
</template>

<style>
.paint-rail {
  display: flex;
  flex: 0 0 236px;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  border-left: 1px solid var(--line-1);
  background: var(--bg-1);
  color: var(--text-1);
  font: 400 12px/16px var(--font-text);
}

.paint-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--sp-2);
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-1);
}

.paint-count {
  flex: 1 1 auto;
  margin: 0;
  color: var(--text-1);
  font: 600 12px/16px var(--font-text);
  white-space: nowrap;
}

.paint-note {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line-1);
  color: var(--text-muted);
}

.paint-groups {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 6px 8px 8px;
}

.paint-group-head {
  margin: 8px 4px 4px;
  color: var(--text-muted);
  font: 600 11px/14px var(--font-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.paint-group:first-child .paint-group-head {
  margin-top: 2px;
}

.paint-swatches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
}

.paint-swatch {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 28px;
  margin: 0;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--text-1);
  font: 400 12px/16px var(--font-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
}

.paint-swatch:hover {
  background: var(--surface-2);
}

.paint-swatch.is-current {
  border-color: var(--signal);
  background: var(--row-active);
}

.paint-swatch:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.paint-chip {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 1px solid var(--surface-outline-dark);
  border-radius: 3px;
}

.paint-chip.is-clear {
  border: 1px dashed var(--control-line);
  background: transparent;
}

.paint-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paint-foot {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: var(--sp-2);
  padding: 10px 12px;
  border-top: 1px solid var(--line-1);
}

@media (max-width: 1023px) {
  .paint-rail {
    flex: 0 0 auto;
    width: 100%;
    max-height: none;
    border-left: 0;
    border-top: 1px solid var(--line-1);
  }

  .paint-swatches {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}

@media (pointer: coarse) {
  .paint-swatch {
    min-height: 44px;
  }
}
</style>

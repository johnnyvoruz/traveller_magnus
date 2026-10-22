<script setup lang="ts">
/**
 * Markets nearby (DT4a; backlog T4a): the worlds within 2, 4 or 6 parsecs of a world (the referee picks;
 * the pick is kept on this device). On the vessel a section; in the dossier a fold, like the dossier's
 * own, that reads the chart only when opened.
 */
import { ref } from 'vue';
import { MARKET_RANGES, type MarketRange } from '../campaign/markets.ts';
import WorldSection from '../dossier/WorldSection.vue';
import { storageGet, storageSet } from '../platform/browser.ts';
import MarketsRows from './MarketsRows.vue';

const props = defineProps<{
    /** The world the markets are measured from; null under way or with no place. */
    hexKey: string | null;
    /** In the dossier: a fold, closed until opened. */
    fold?: boolean;
    /** Said instead of the list when there is no world to measure from. */
    noPlace?: string;
}>();

const RANGE_KEY = 'voyage.markets.range';

function rememberedRange(): MarketRange {
    const said = Number(storageGet(RANGE_KEY));
    return (MARKET_RANGES as readonly number[]).includes(said) ? (said as MarketRange) : 2;
}

const range = ref<MarketRange>(rememberedRange());
const open = ref(!props.fold);
const count = ref(0);

function pick(next: MarketRange): void {
    range.value = next;
    storageSet(RANGE_KEY, String(next));
}
</script>

<template>
  <WorldSection
    v-if="fold"
    class="mkt is-fold"
    data-markets
    title="Markets nearby"
    :open="open"
    body-id="mkt-fold-body"
    :summary="'Worlds within ' + range + ' parsecs'"
    @toggle="open = !open"
  >
    <template #tools>
      <div v-if="open && hexKey" class="mkt-range" role="group" aria-label="Distance">
        <button v-for="value in MARKET_RANGES" :key="value" type="button" class="mkt-range-btn" :aria-pressed="range === value ? 'true' : 'false'" :data-markets-range="value" @click="pick(value)">{{ value }} pc</button>
      </div>
    </template>
    <MarketsRows :hex-key="hexKey" :range="range" :no-place="noPlace" />
  </WorldSection>
  <section v-else class="mkt ui-frame" data-markets aria-labelledby="mkt-h">
    <div class="mkt-head">
      <h3 id="mkt-h" class="ui-frame-label">Markets <span v-if="hexKey && count" class="ui-frame-count">{{ count }}</span></h3>
      <div v-if="hexKey" class="mkt-range" role="group" aria-label="Distance">
        <button v-for="value in MARKET_RANGES" :key="value" type="button" class="mkt-range-btn" :aria-pressed="range === value ? 'true' : 'false'" :data-markets-range="value" @click="pick(value)">{{ value }} pc</button>
      </div>
    </div>
    <MarketsRows :hex-key="hexKey" :range="range" :no-place="noPlace" @count="count = $event" />
  </section>
</template>

<style>
.mkt-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2) var(--sp-3);
}

.mkt-head .ui-frame-label {
  margin-bottom: var(--sp-2);
}

.mkt-range {
  display: inline-flex;
  margin-left: auto;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  overflow: hidden;
}

.mkt-range-btn {
  min-width: 44px;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: 700 11px/1.3 var(--font-code);
  font-variant-numeric: var(--tabular);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.mkt-range-btn + .mkt-range-btn {
  border-left: 1px solid var(--control-line);
}

.mkt-range-btn:hover {
  color: var(--text-0);
}

.mkt-range-btn[aria-pressed="true"] {
  background: var(--row-active);
  color: var(--signal);
}
</style>

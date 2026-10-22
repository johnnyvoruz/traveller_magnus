<script setup lang="ts">
/**
 * The Markets list (DT4a): the worlds within `range` parsecs of `hexKey`, nearest first. Each row opens the
 * world; Locate draws the line to it on the map (the signature). Starport, trade codes and population from
 * the index, WTN from the world's tree as it arrives. No pairing and no price (T4b).
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { MarketRange, MarketRow } from '../campaign/markets.ts';
import Icon from '../design/Icon.vue';
import { dossierPath } from '../orbit/bodies.ts';
import { atPane } from '../shell/pane.ts';
import { locating, startLocate, stopLocate, systemSubject } from './locate.ts';
import { marketsAround, marketsChart, startMarkets } from './markets_near.ts';
import { parseHexKey } from './places.ts';
import { vWorldCard } from './world_card.ts';

const props = defineProps<{
    /** The world the markets are measured from; null under way or with no place. */
    hexKey: string | null;
    range: MarketRange;
    /** Said instead of the list when there is no world to measure from. */
    noPlace?: string;
}>();

const emit = defineEmits<{ count: [n: number] }>();

const route = useRoute();
const router = useRouter();
const listEl = ref<HTMLElement | null>(null);
const onMap = computed(() => !route.path.includes('/orbit'));

watch(() => props.hexKey, (key) => { if (key) void startMarkets(); }, { immediate: true });

const found = computed(() => (props.hexKey ? marketsAround(props.hexKey, props.range) : { rows: [] as MarketRow[], waiting: false }));
const rows = computed(() => found.value.rows);
watch(() => rows.value.length, (n) => emit('count', n), { immediate: true });

function parsecWords(parsecs: number): string {
    return parsecs === 0 ? 'Here' : parsecs + ' pc';
}

/** "Starport A · Ri Pa Ph · WTN 5 · Pop 8": what the index and the tree say, nothing guessed. */
function facts(row: MarketRow): string {
    const parts = ['Starport ' + (row.starport || '?')];
    if (row.tradeCodes.length) parts.push(row.tradeCodes.join(' '));
    if (row.wtn !== null) parts.push('WTN ' + row.wtn);
    if (row.population) parts.push('Pop ' + row.population);
    return parts.join(' · ');
}

function openWorld(row: MarketRow): void {
    const place = parseHexKey(row.hexKey);
    if (place) void router.push(atPane(dossierPath(place.slug, place.hex), route.query, { kind: 'dossier' }));
}

function originY(hexKey: string): number | null {
    const el = listEl.value ? listEl.value.querySelector<HTMLElement>('.mkt-locate[data-hex="' + hexKey + '"]') : null;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return box.height > 0 ? box.top + box.height / 2 : null;
}

function isLocating(row: MarketRow): boolean {
    return locating.recordId === systemSubject(row.hexKey);
}

function locate(row: MarketRow): void {
    if (isLocating(row)) {
        stopLocate();
        return;
    }
    startLocate(systemSubject(row.hexKey), row.hexKey, () => originY(row.hexKey));
}
</script>

<template>
  <div class="mkt-body" data-markets-rows>
    <p v-if="!hexKey" class="mkt-note">{{ noPlace || 'No world to measure from.' }}</p>
    <p v-else-if="marketsChart.failed" class="mkt-note">The chart could not be read.</p>
    <p v-else-if="!rows.length && found.waiting" class="mkt-note" role="status">Reading the chart…</p>
    <p v-else-if="!rows.length" class="mkt-note">No worlds within {{ range }} parsecs.</p>
    <template v-else>
      <p class="mkt-note">Worlds within {{ range }} parsecs, nearest first.</p>
      <ul ref="listEl" class="mkt-rows">
        <li v-for="row in rows" :key="row.hexKey" :class="{ 'has-locate': onMap }" :data-market="row.hexKey">
          <button v-world-card="row.hexKey" type="button" class="mkt-row" @click="openWorld(row)">
            <span class="mkt-row-top">
              <b class="mkt-name">{{ row.name || row.hexKey }}</b>
              <span class="mkt-pc">{{ parsecWords(row.parsecs) }}</span>
            </span>
            <span class="mkt-facts">{{ facts(row) }}</span>
          </button>
          <button
            v-if="onMap"
            type="button"
            class="mkt-locate"
            :data-hex="row.hexKey"
            :aria-pressed="isLocating(row) ? 'true' : 'false'"
            :aria-label="'Locate ' + (row.name || row.hexKey)"
            :title="'Locate ' + (row.name || row.hexKey)"
            @click="locate(row)"
          >
            <Icon name="location-crosshairs" :size="13" />
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style>
.mkt-note {
  margin: 0 0 var(--sp-2);
  color: var(--text-muted);
  font: 400 12.5px/1.4 var(--font-text);
}

.mkt-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--panel-raised);
}

.mkt-rows li {
  position: relative;
}

.mkt-rows li + li {
  border-top: 1px solid var(--line-soft);
}

.mkt-rows li.has-locate .mkt-row {
  padding-right: 46px;
}

.mkt-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font: 400 13.5px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out);
}

.mkt-row:hover {
  background: var(--surface-1);
}

.mkt-row:focus-visible {
  outline-offset: -2px;
}

.mkt-row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  min-width: 0;
}

.mkt-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-0);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkt-pc {
  flex: 0 0 auto;
  color: var(--signal);
  font: 700 11px/1.3 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.mkt-facts {
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: var(--tabular);
  overflow-wrap: anywhere;
}

.mkt-locate {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: -14px 0 0;
  padding: 0;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--signal);
  cursor: pointer;
}

.mkt-locate:hover,
.mkt-locate[aria-pressed="true"] {
  border-color: var(--signal);
}

.mkt-locate[aria-pressed="true"] {
  background: var(--row-active);
}
</style>

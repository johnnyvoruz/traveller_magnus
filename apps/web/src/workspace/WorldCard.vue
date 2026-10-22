<script setup lang="ts">
/**
 * The world hover card (DW1), mounted once beside the record card: the world's name and hex, its UWP,
 * bases, zone and trade codes, and the campaign's records there, with Open (the world's dossier). It
 * follows world_card.ts, which the links drive. The world comes from Build's row, else the map's chart,
 * else the chart Markets read; the records from the campaign already in memory.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SectorHex } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import { dossierPath } from '../orbit/bodies.ts';
import { baseMarks } from '../map/uwp.ts';
import { atPane } from '../shell/pane.ts';
import { truthAt } from './build/acts.ts';
import { buildStore } from './build/seam.ts';
import { chartEntry } from './markets_near.ts';
import { hexWords, parseHexKey, recordsHere } from './places.ts';
import { cardPlace, cardTies, recordCard } from './record_card.ts';
import { baseWords, closeWorldCard, keepWorldCard, leaveWorldCard, WORLD_CARD_ID, worldCard, zoneWords } from './world_card.ts';

const router = useRouter();
const route = useRoute();
const cardEl = ref<HTMLElement | null>(null);
/** Null until the card has been measured, so it never shows in the wrong place first. */
const at = ref<{ left: number; top: number } | null>(null);

/** The world there; 'empty' when the hex has none (Build removed it, or the chart has none); null while unread. */
const look = computed((): SectorHex | 'empty' | null => {
    const hexKey = worldCard.hexKey;
    if (!hexKey) return null;
    const store = buildStore();
    if (store) void store.tick();
    const row = store ? store.row(hexKey) : null;
    if (row) return row.state === 'removed' || !row.entry || !row.entry.uwp ? 'empty' : row.entry;
    return truthAt(hexKey) ?? chartEntry(hexKey);
});
const entry = computed(() => (look.value && look.value !== 'empty' ? look.value : null));
/** The world's name over its hex in words; a hex with no named world is its hex alone. */
const name = computed(() => (entry.value && entry.value.name) || (worldCard.hexKey ? hexWords(worldCard.hexKey) : ''));
const named = computed(() => !!(entry.value && entry.value.name));
const facts = computed(() => {
    const now = entry.value;
    if (!now) return { uwp: '', bases: '', zone: '', codes: '' };
    return { uwp: now.uwp, bases: baseWords(baseMarks(now.bases || '')), zone: zoneWords(now.zone), codes: now.tradeCodes.join(' ') };
});
const SMALL_COUNTS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "one more" through nine; a numeral from 10. */
function moreWords(count: number): string {
    return (count < 10 ? SMALL_COUNTS[count - 1] : String(count)) + ' more';
}

/** Up to three of the campaign's records there, by name. */
const here = computed(() => {
    const hexKey = worldCard.hexKey;
    if (!hexKey || campaign.status !== 'ready') return { shown: [] as string[], more: 0 };
    void campaign.seq;
    return cardTies(recordsHere(campaign.records, hexKey, null).map((record) => record.name));
});

// The record card opening closes this one: one card at a time.
watch(() => recordCard.id, (id) => { if (id) closeWorldCard(); });

watch(() => [worldCard.hexKey, worldCard.rect] as const, async () => {
    at.value = null;
    if (!worldCard.hexKey || !worldCard.rect) return;
    await nextTick();
    const el = cardEl.value;
    const rect = worldCard.rect;
    if (!el || !rect) return;
    const root = document.documentElement;
    at.value = cardPlace(rect, { width: el.offsetWidth, height: el.offsetHeight }, { width: root.clientWidth, height: root.clientHeight });
});

function open(): void {
    const place = worldCard.hexKey ? parseHexKey(worldCard.hexKey) : null;
    closeWorldCard();
    if (place) void router.push(atPane(dossierPath(place.slug, place.hex), route.query, { kind: 'dossier' }));
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="worldCard.hexKey"
      :id="WORLD_CARD_ID"
      ref="cardEl"
      class="wcard"
      role="tooltip"
      data-world-card
      :style="at ? { left: at.left + 'px', top: at.top + 'px' } : { visibility: 'hidden' }"
      @pointerenter="keepWorldCard"
      @pointerleave="leaveWorldCard"
    >
      <div class="wcard-names">
        <b>{{ name }}</b>
        <span v-if="named" class="wcard-hex">{{ hexWords(worldCard.hexKey) }}</span>
      </div>
      <template v-if="entry">
        <p class="wcard-uwp">{{ facts.uwp }}<span v-if="facts.codes" class="wcard-codes">{{ facts.codes }}</span></p>
        <p v-if="facts.bases || facts.zone" class="wcard-line">
          <span v-if="facts.bases">{{ facts.bases }}</span>
          <span v-if="facts.bases && facts.zone" aria-hidden="true"> · </span>
          <span v-if="facts.zone" class="wcard-zone" :class="'is-' + entry.zone">{{ facts.zone }}</span>
        </p>
      </template>
      <p v-else-if="look === 'empty'" class="wcard-line wcard-muted">No world in this hex.</p>
      <p v-else class="wcard-line wcard-muted" role="status">Reading the chart…</p>
      <p v-if="here.shown.length" class="wcard-here">
        <span class="wcard-muted">Here:</span> {{ here.shown.join(', ') }}<template v-if="here.more">, and {{ moreWords(here.more) }}</template>
      </p>
      <button type="button" class="ui-btn wcard-open" tabindex="-1" @click="open">Open</button>
    </div>
  </Teleport>
</template>

<style>
.wcard {
  position: fixed;
  z-index: 42;
  box-sizing: border-box;
  width: 280px;
  max-width: calc(100vw - 16px);
  padding: 12px 14px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-3);
  background: var(--bg-1);
  box-shadow: var(--shadow-pop);
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
  pointer-events: auto;
  animation: wcard-in var(--t-fast) var(--ease-out) both;
}

@keyframes wcard-in {
  from { opacity: 0; }
}

.wcard-names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.wcard-names b {
  color: var(--text-0);
  font: 700 14.5px/1.3 var(--font-text);
  overflow-wrap: anywhere;
}

.wcard-hex {
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-text);
}

.wcard-uwp {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: 8px 0 0;
  color: var(--text-0);
  font: 600 13px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.wcard-codes {
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-code);
}

.wcard-line {
  margin: 4px 0 0;
  font-size: 12.5px;
}

.wcard-muted {
  color: var(--text-muted);
}

.wcard-zone.is-A {
  color: var(--attention);
}

.wcard-zone.is-R {
  color: var(--danger);
}

.wcard-here {
  margin: 8px 0 0;
  padding: 6px 0 0;
  border-top: 1px solid var(--line-soft);
  font-size: 12.5px;
}

.ui-btn.wcard-open {
  margin-top: 10px;
  height: 26px;
  padding: 0 10px;
  font-size: 12.5px;
}

@media (prefers-reduced-motion: reduce) {
  .wcard {
    animation: none;
  }
}
</style>

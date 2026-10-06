<script setup lang="ts">
/**
 * "Your records here" in a dossier (design §4): the campaign's records at this system, or on
 * the one body shown, and a button that makes a new one anchored there. Signed out it is not
 * there at all: no section and no invitation. It reads the campaign already in memory and
 * never fetches.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CampaignRecordType } from '@voyage/shared';
import { session } from '../account/session.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { isOnline, onOnlineChange } from '../platform/browser.ts';
import { createRecord } from './actions.ts';
import AddButton from './AddButton.vue';
import { thumbUrl } from './images.ts';
import { locating, startLocate, stopLocate } from './locate.ts';
import { openFailed } from './opening.ts';
import { hexKeyOf, liveById, recordsHere, resolvePlace, systemAnchor, withinSystem } from './places.ts';
import { typeInfo } from './records.ts';

const props = defineProps<{
    slug: string;
    hex: string;
    /** The system's name, kept on an anchor that names no body. */
    systemName: string;
    /** The body shown, or null for the whole system. */
    bodyKey: string | null;
    /** That body's name, kept on the anchor beside its key. */
    bodyName: string;
}>();

const emit = defineEmits<{ retry: [] }>();

const route = useRoute();
const router = useRouter();
/** Offline, what was loaded is shown and nothing can be added (design J10). */
const online = ref(true);
let stopOnline: (() => void) | null = null;

onMounted(() => {
    online.value = isOnline();
    stopOnline = onOnlineChange((now) => { online.value = now; });
});

onBeforeUnmount(() => { if (stopOnline) stopOnline(); });

const hexKey = computed(() => hexKeyOf(props.slug, props.hex));
/** Locate draws on the map; beside the orbit view there is none. */
const onMap = computed(() => !route.path.includes('/orbit'));
const listEl = ref<HTMLElement | null>(null);

function locate(id: string): void {
    if (locating.recordId === id) {
        stopLocate();
        return;
    }
    startLocate(id, hexKey.value, () => {
        if (!listEl.value) return null;
        for (const el of listEl.value.querySelectorAll<HTMLElement>('.here-locate')) {
            if (el.dataset.id !== id) continue;
            const box = el.getBoundingClientRect();
            return box.height > 0 ? box.top + box.height / 2 : null;
        }
        return null;
    });
}
const state = computed(() => {
    if (!session.user) return 'hidden';
    if (openFailed.value || campaign.status === 'error') return 'error';
    return campaign.status === 'ready' ? 'ready' : 'loading';
});
const rows = computed(() => {
    if (state.value !== 'ready') return [];
    const live = liveById(campaign.records);
    return recordsHere(campaign.records, hexKey.value, props.bodyKey).map((record) => {
        const place = resolvePlace(record.id, live);
        const host = record.anchor && record.anchor.kind === 'record' ? live[record.anchor.id] : undefined;
        const where = place ? withinSystem(place, props.systemName) : '';
        return { record, info: typeInfo(record.type), where: host ? where + ' · aboard ' + host.name : where };
    });
});
const title = computed(() => (props.bodyKey ? 'Your records on this world' : 'Your records here'));

/** A record's page is the Campaign panel's; from the orbit view its date does not go along. */
function pathQuery(): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {};
    for (const key of ['x', 'y', 'z']) {
        const value = route.query[key];
        if (typeof value === 'string') query[key] = value;
    }
    return query;
}

function open(id: string): void {
    void router.push({ path: '/campaign/r/' + encodeURIComponent(id), query: pathQuery() });
}

function add(type: CampaignRecordType): void {
    if (!online.value || state.value !== 'ready') return;
    const body = props.bodyKey ? { key: props.bodyKey, name: props.bodyName } : null;
    open(createRecord(type, systemAnchor(hexKey.value, props.systemName, body)));
}
</script>

<template>
  <section v-if="state !== 'hidden'" class="here" :data-state="state">
    <div class="here-head">
      <h3 class="ui-heading">{{ title }} <span v-if="state === 'ready'" class="ui-count">{{ rows.length }}</span></h3>
      <AddButton
        quiet
        type="person"
        label="Add here"
        :menu-label="bodyKey ? 'Add a record on this world' : 'Add a record here'"
        :disabled="!online || state !== 'ready'"
        @add="add"
      />
    </div>
    <p v-if="state === 'loading'" class="here-note" role="status">Loading your records.</p>
    <p v-else-if="state === 'error'" class="here-note" role="alert">
      Your records could not be loaded.
      <button type="button" class="ui-btn" @click="emit('retry')">Try again</button>
    </p>
    <p v-else-if="!rows.length" class="here-note">Nothing of yours here yet.</p>
    <ul v-else ref="listEl" class="here-rows">
      <li v-for="row in rows" :key="row.record.id" :class="{ 'has-locate': onMap }">
        <button type="button" class="here-row" :data-id="row.record.id" @click="open(row.record.id)">
          <img v-if="thumbUrl(campaign.universeId, row.record)" class="here-glyph is-thumb" :src="thumbUrl(campaign.universeId, row.record) || ''" alt="" loading="lazy">
          <span v-else class="here-glyph" aria-hidden="true"><Icon :name="row.info.icon" :size="13" /></span>
          <span class="here-text">
            <b>{{ row.record.name }}</b>
            <small>{{ row.info.one }} · {{ row.where }}</small>
          </span>
          <Icon name="chevron-right" :size="11" />
        </button>
        <button
          v-if="onMap"
          type="button"
          class="here-locate"
          :data-id="row.record.id"
          :aria-pressed="locating.recordId === row.record.id ? 'true' : 'false'"
          :aria-label="(locating.recordId === row.record.id ? 'Stop locating ' : 'Locate ') + row.record.name"
          :title="locating.recordId === row.record.id ? 'Stop locating' : 'Show on the map'"
          @click="locate(row.record.id)"
        >
          <Icon name="location-crosshairs" :size="13" />
        </button>
      </li>
    </ul>
  </section>
</template>

<style>
.here {
  margin: 18px 0 0;
}

.here-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 8px;
}

.here-head .ui-heading {
  flex: 1 1 auto;
  gap: 8px;
  margin: 0;
}

.here-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
}

.here-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--panel-raised);
}

.here-rows li {
  position: relative;
}

.here-rows li + li {
  border-top: 1px solid var(--line-soft);
}

.here-rows li.has-locate .here-row {
  padding-right: 46px;
}

.here-locate {
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

.here-locate:hover,
.here-locate[aria-pressed="true"] {
  border-color: var(--signal);
}

.here-locate[aria-pressed="true"] {
  background: var(--row-active);
}

.here-row {
  display: flex;
  align-items: center;
  gap: 10px;
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

.here-row:hover {
  background: var(--surface-1);
}

.here-row:focus-visible {
  outline-offset: -3px;
}

.here-row > .ui-icon {
  color: var(--text-muted);
}

.here-glyph.is-thumb {
  object-fit: cover;
}

.here-glyph {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-2);
  background: var(--wash-faint);
  color: var(--signal);
}

.here-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.here-text b {
  color: var(--text-0);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.here-text small {
  color: var(--text-muted);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .here-row {
    transition: none;
  }
}
</style>

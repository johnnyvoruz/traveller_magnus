<script setup lang="ts">
/**
 * The record list (design §2): search, Add, the type chips with their counts, the rows grouped
 * by type under headings that fold (kept per campaign on this device), the empty states, the
 * first-run card, and this session's deletes at the foot. Past VIRTUAL_FROM rows it draws only
 * the items near the view. It reads the
 * campaign from the store and asks the panel to open or create; it changes nothing itself
 * but a delete and a restore.
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CAMPAIGN_LIMITS, type CampaignRecordType } from '@voyage/shared';
import { campaign, renameCampaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { deleteRecord, recentlyDeleted, restoreRecord } from './actions.ts';
import AddButton from './AddButton.vue';
import { locating, startLocate, stopLocate } from './locate.ts';
import RecordAvatar from './RecordAvatar.vue';
import { handedQuery, listSort, recordFilter, recordQuery } from './list_state.ts';
import { publishAsk } from './market/command.ts';
import { canPublishRecords } from './market/record_publish.ts';
import { placeSource } from './place_source.ts';
import { commandScope, handleKey, registerCommand, setCommandScope } from '../shell/registry.ts';
import { showToast } from '../shell/toast.ts';
import { hexKeyOf, hexWords, liveById, resolvePlace, type Resolved } from './places.ts';
import { placeNow } from './place_now.ts';
import { RECORD_TYPES, filterRecords, liveRecords, typeCounts, typeInfo } from './records.ts';
import { vRecordCard } from './record_card.ts';
import { HEAD_GUESS, ROW_GUESS, VIRTUAL_FROM, groupItems, readFolded, windowOf, writeFolded } from './record_groups.ts';

const props = defineProps<{
    /** The record open beside the list (full width), or null. */
    selected: string | null;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
    /** The first-run card is up, so this list does not also say that nothing is here. */
    hideEmpty?: boolean;
    /** A player's list (P6): what is shared with them, with no Add and no Publish. */
    player?: boolean;
}>();

const emit = defineEmits<{
    open: [id: string];
    create: [type: CampaignRecordType];
    /** The map has to be seen (a locate): the panel gives way when it covers it. */
    map: [];
    timeline: [];
}>();

/** Publish records (contract F18), loaded when first opened. */
const RecordsPublish = defineAsyncComponent(() => import('./market/RecordsPublish.vue'));

const query = recordQuery;
const filter = recordFilter;
const searchEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const nameDraft = ref('');

const all = computed(() => liveRecords(campaign.records));
const counts = computed(() => typeCounts(all.value));
/** The system selected or last opened on the map, for the "At Regina 1910" chip (design J6). */
const here = ref<{ hexKey: string; label: string } | null>(null);
const atHere = ref(false);
const rows = computed(() => filterRecords(
    all.value,
    { type: filter.value, query: query.value, hexKey: atHere.value && here.value ? here.value.hexKey : undefined, sort: listSort.value },
    campaign.records,
));

/** The types folded in this campaign, kept on this device. */
const folded = ref<Set<CampaignRecordType>>(readFolded(campaign.universeId));
watch(() => campaign.universeId, (id) => { folded.value = readFolded(id); });
/** "All" groups the rows by type; a chosen type is one group, so it needs no heading. */
const grouped = computed(() => filter.value === 'all');
/** A typed search unfolds every group: a match is never hidden. */
const items = computed(() => groupItems(rows.value, grouped.value, folded.value, !!query.value.trim()));

function toggleGroup(type: CampaignRecordType): void {
    const next = new Set(folded.value);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    folded.value = next;
    writeFolded(campaign.universeId, next);
}

/* The window a long list draws. Heights are measured as items are drawn; until then a guess. */
const virtual = computed(() => rows.value.length >= VIRTUAL_FROM);
const known = new Map<string, number>();
const sizes = ref(0);
const scrollTop = ref(0);
const viewHeight = ref(0);
const listTop = ref(0);
let scrollEl: HTMLElement | null = null;

const heights = computed(() => {
    void sizes.value;
    return items.value.map((item) => known.get(item.key) ?? (item.kind === 'head' ? HEAD_GUESS : ROW_GUESS));
});
const win = computed(() => (virtual.value
    ? windowOf(heights.value, scrollTop.value - listTop.value, viewHeight.value || 640)
    : { start: 0, end: items.value.length, padBefore: 0, padAfter: 0 }));
const shownItems = computed(() => items.value.slice(win.value.start, win.value.end));

function readScroll(): void {
    if (!scrollEl) return;
    scrollTop.value = scrollEl.scrollTop;
    viewHeight.value = scrollEl.clientHeight;
    const list = listEl.value;
    if (!list) return;
    listTop.value = list.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
    let changed = false;
    for (const el of list.querySelectorAll<HTMLElement>(':scope > li[data-key]')) {
        const key = el.dataset.key;
        const height = el.getBoundingClientRect().height;
        if (!key || !(height > 0)) continue;
        const had = known.get(key);
        if (had === undefined || Math.abs(had - height) > 0.5) {
            known.set(key, height);
            changed = true;
        }
    }
    if (changed) sizes.value += 1;
}

function bindScroll(): void {
    const list = listEl.value;
    const next = list ? list.closest<HTMLElement>('.panel-body') : null;
    if (next !== scrollEl) {
        if (scrollEl) scrollEl.removeEventListener('scroll', readScroll);
        scrollEl = next;
        if (scrollEl) scrollEl.addEventListener('scroll', readScroll, { passive: true });
    }
    readScroll();
}

watch(shownItems, () => { void nextTick(bindScroll); });
onBeforeUnmount(() => {
    releaseListKeys();
    if (scrollEl) scrollEl.removeEventListener('scroll', readScroll);
});

/** Brings item `index` into the view, drawing it if the window had left it out, then focuses it. */
function focusItem(index: number): void {
    const item = items.value[index];
    if (!item) return;
    const scroller = scrollEl;
    if (scroller && virtual.value) {
        let top = listTop.value;
        for (let i = 0; i < index; i++) top += heights.value[i] ?? ROW_GUESS;
        const bottom = top + (heights.value[index] ?? ROW_GUESS);
        if (top < scroller.scrollTop) scroller.scrollTop = top;
        else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
        readScroll();
    }
    void nextTick(() => {
        const el = listEl.value ? listEl.value.querySelector<HTMLElement>('li[data-key="' + item.key + '"] > button') : null;
        if (el) el.focus();
    });
}

function readHere(): void {
    const source = placeSource();
    const now = source ? source.current() : null;
    here.value = now ? { hexKey: hexKeyOf(now.slug, now.hex), label: 'At ' + (now.name ? now.name + ' ' + now.hex : hexWords(hexKeyOf(now.slug, now.hex))) } : null;
    if (!here.value) atHere.value = false;
}

onMounted(() => {
    bindKeys();
    readHere();
    void nextTick(bindScroll);
    // A search handed over by the omnibox ("All 12 matches") is applied once.
    if (handedQuery.value) {
        query.value = handedQuery.value;
        handedQuery.value = '';
    }
});
watch(handedQuery, (text) => {
    if (!text) return;
    query.value = text;
    handedQuery.value = '';
});
const addType = computed((): CampaignRecordType => filter.value === 'all' ? 'person' : filter.value);
/** Where each record shown is, for its Locate button; a record that is nowhere has none. */
const places = computed(() => {
    const live = liveById(campaign.records);
    const found = new Map<string, Resolved>();
    for (const record of rows.value) {
        const place = resolvePlace(record.id, live);
        if (place) found.set(record.id, place);
    }
    return found;
});
const first = computed(() => all.value.length === 0);
/** Publish records: offered to the campaign's owner, signed in and online, once there is a record. */
const canPublish = computed(() => canPublishRecords(props.readOnly, all.value.length));
const publishing = ref(false);
/** The rows the list shows are chosen when the list is narrowed (a type, a search, here); the whole list starts with none. */
const publishStart = computed(() => (filter.value !== 'all' || query.value || atHere.value ? rows.value.map((record) => record.id) : []));

/** "Publish records" from the command palette (market/command.ts): opened here once the campaign is open. */
watch(() => [publishAsk.records, campaign.status] as const, ([asked, status]) => {
    if (!asked || props.readOnly || status === 'loading' || status === 'signed-out') return;
    publishAsk.records = false;
    if (canPublish.value) publishing.value = true;
    else showToast(all.value.length ? 'You can publish only from a campaign you made.' : 'Add a record first: a person, a ship, or an organization.');
}, { immediate: true });
const campaignName = computed(() => {
    const found = campaign.universes.find((item) => item.id === campaign.universeId);
    return found ? found.name : '';
});

function add(type: CampaignRecordType): void {
    if (props.readOnly) return;
    emit('create', type);
}

/** Locate: the map flies to the record's hex and the line runs from this row. Pressed again, it ends. */
function locateRow(id: string): void {
    const place = places.value.get(id);
    if (!place) return;
    if (locating.recordId === id) {
        stopLocate();
        return;
    }
    emit('map');
    startLocate(id, place.hexKey, () => {
        if (!listEl.value) return null;
        for (const el of listEl.value.querySelectorAll<HTMLElement>('.camp-locate')) {
            if (el.dataset.id !== id) continue;
            const box = el.getBoundingClientRect();
            return box.height > 0 ? box.top + box.height / 2 : null;
        }
        return null;
    });
}

function rowButtons(): HTMLElement[] {
    return listEl.value ? Array.from(listEl.value.querySelectorAll<HTMLElement>('.camp-row, .camp-group-head')) : [];
}

/**
 * Up and Down walk the rows and the group headings, drawing what a long list had left out; on a
 * row, L locates it and Delete deletes it and moves focus to its neighbour.
 */
const LIST_SCOPE = 'campaign-list';
let releaseKeys: (() => void)[] = [];
let replay = false;

function replayRow(key: string): void {
    const target = document.activeElement;
    if (!(target instanceof HTMLElement) || !listEl.value) return;
    const button = target.closest<HTMLElement>('.camp-row, .camp-group-head');
    if (!button || !listEl.value.contains(button)) return;
    const id = button.classList.contains('camp-row') ? (button.dataset.id || null) : null;
    replay = true;
    onRowKey({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        currentTarget: button,
        preventDefault() {},
        stopPropagation() {},
    }, id);
}

function rowFocused(): boolean {
    const target = document.activeElement;
    return target instanceof HTMLElement && !!listEl.value?.contains(target) && !!target.closest('.camp-row, .camp-group-head');
}

function bindKeys(): void {
    setCommandScope(LIST_SCOPE);
    const key = (id: string, name: string, keys: string[], run: () => void, live: () => boolean) => registerCommand({
        id, name, keys, scope: LIST_SCOPE, runnable: live, run,
    });
    releaseKeys = [
        key('campaign-list-next', 'Next row (Down)', ['ArrowDown'], () => replayRow('ArrowDown'), rowFocused),
        key('campaign-list-prev', 'Previous row (Up)', ['ArrowUp'], () => replayRow('ArrowUp'), rowFocused),
        key('campaign-list-locate', 'Locate (L)', ['l', 'L'], () => replayRow('l'), rowFocused),
        key('campaign-list-delete', 'Delete (Delete)', ['Delete'], () => replayRow('Delete'), rowFocused),
        key('campaign-list-search', 'Search this list (/)', ['/'], () => { if (searchEl.value) searchEl.value.focus(); }, () => {
            const target = document.activeElement;
            return target instanceof HTMLElement && !!target.closest('.campaign-root');
        }),
    ];
}

function releaseListKeys(): void {
    for (const release of releaseKeys) release();
    releaseKeys = [];
    if (commandScope() === LIST_SCOPE) setCommandScope(null);
}

function onRowKey(event: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    currentTarget: EventTarget | null;
    preventDefault(): void;
    stopPropagation(): void;
}, id: string | null): void {
    if (!replay && handleKey(event as unknown as KeyboardEvent)) {
        event.stopPropagation();
        return;
    }
    replay = false;
    const buttons = rowButtons();
    const at = buttons.indexOf(event.currentTarget as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        event.preventDefault();
        event.stopPropagation();
        const key = (event.currentTarget as HTMLElement).closest<HTMLElement>('li')?.dataset.key;
        const index = items.value.findIndex((item) => item.key === key);
        if (index >= 0 && items.value[index + step]) focusItem(index + step);
        else if (step < 0 && searchEl.value) searchEl.value.focus();
        return;
    }
    if (!id) return;
    if ((event.key === 'l' || event.key === 'L') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!places.value.has(id)) return;
        event.preventDefault();
        event.stopPropagation();
        locateRow(id);
        return;
    }
    if (event.key === 'Delete' && !props.readOnly) {
        event.preventDefault();
        event.stopPropagation();
        deleteRecord(id);
        void nextTick(() => {
            const left = rowButtons();
            const next = left[Math.min(at, left.length - 1)];
            if (next) next.focus();
            else if (searchEl.value) searchEl.value.focus();
        });
    }
}

/** Keys typed in the search field are the field's; Down goes into the list, Esc clears it first. */
function onSearchKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
        const buttons = rowButtons();
        if (buttons[0]) {
            event.preventDefault();
            buttons[0].focus();
        }
        event.stopPropagation();
        return;
    }
    if (event.key === 'Escape') {
        if (query.value) {
            event.preventDefault();
            event.stopPropagation();
            query.value = '';
        }
        return;
    }
    event.stopPropagation();
}

async function saveName(): Promise<void> {
    const name = nameDraft.value.replace(/\s+/g, ' ').trim().slice(0, CAMPAIGN_LIMITS.name);
    if (!name || name === campaignName.value || !campaign.universeId || props.readOnly) return;
    await renameCampaign(campaign.universeId, name);
    nameDraft.value = '';
}

defineExpose({ focusSearch: () => { if (searchEl.value) searchEl.value.focus(); } });
</script>

<template>
  <div class="camp-list">
    <p v-if="first && player" class="camp-first-player" data-player-empty>No records here yet.</p>
    <div v-else-if="first && !query && !hideEmpty" class="camp-first ui-ground">
      <span class="camp-glyph is-large" aria-hidden="true"><Icon name="book-sparkles" :size="22" /></span>
      <h2>Your campaign starts here</h2>
      <p>It is private to you. Nothing you add changes the map.</p>
      <div class="camp-first-starts">
        <button type="button" class="ui-btn is-primary" :disabled="readOnly" @click="add('person')">
          <Icon name="user" :size="13" />Add a person
        </button>
        <button type="button" class="ui-btn" :disabled="readOnly" @click="add('place')">
          <Icon name="location-dot" :size="13" />Add a place
        </button>
        <button type="button" class="ui-btn" :disabled="readOnly" @click="add('vessel')">
          <Icon name="shuttle-space" :size="13" />Add the ship
        </button>
      </div>
      <label class="camp-namer">
        <span>Name it <em>optional</em></span>
        <input
          v-model="nameDraft"
          type="text"
          class="camp-input"
          :placeholder="campaignName || 'My campaign'"
          :maxlength="CAMPAIGN_LIMITS.name"
          :disabled="readOnly"
          @keydown.enter.prevent.stop="saveName"
          @keydown.stop
          @blur="saveName"
        >
      </label>
    </div>

    <template v-else>
      <div class="camp-tool">
        <label class="camp-search">
          <Icon name="search" :size="14" />
          <input
            ref="searchEl"
            v-model="query"
            type="search"
            placeholder="Search records"
            aria-label="Search records"
            @keydown="onSearchKey"
          >
        </label>
        <button type="button" class="ui-btn" @click="emit('timeline')">Timeline</button>
        <button v-if="canPublish" type="button" class="ui-btn camp-publish" title="Publish records to the Marketplace" data-publish-records @click="publishing = true">
          <Icon name="store" :size="13" />Publish
        </button>
        <AddButton v-if="!player" :type="addType" :disabled="readOnly" @add="add" />
      </div>

      <div class="camp-types" role="radiogroup" aria-label="Type">
        <button
          v-if="here"
          type="button"
          role="checkbox"
          class="camp-type camp-here"
          :aria-checked="atHere ? 'true' : 'false'"
          :title="atHere ? 'Every record, wherever it is' : 'Only the records at this system'"
          @click="atHere = !atHere"
        >
          <Icon name="location-dot" :size="11" />{{ here.label }}
        </button>
        <button type="button" role="radio" class="camp-type" :aria-checked="filter === 'all' ? 'true' : 'false'" @click="filter = 'all'">
          All <b>{{ counts.all }}</b>
        </button>
        <button
          v-for="info in RECORD_TYPES"
          :key="info.type"
          type="button"
          role="radio"
          class="camp-type"
          :aria-checked="filter === info.type ? 'true' : 'false'"
          @click="filter = info.type"
        >
          <Icon :name="info.icon" :size="11" />{{ info.many }} <b>{{ counts[info.type] }}</b>
        </button>
        <label class="camp-sort">
          <span class="rec-sr">Order</span>
          <select v-model="listSort" title="The list's order" @keydown.stop>
            <option value="name">By name</option>
            <option value="changed">Recently changed</option>
          </select>
        </label>
      </div>

      <ul v-if="rows.length" ref="listEl" class="camp-rows" :class="{ 'is-grouped': grouped }" aria-label="Records">
        <li v-if="win.padBefore > 0" class="camp-pad" aria-hidden="true" :style="{ height: win.padBefore + 'px' }"></li>
        <template v-for="item in shownItems" :key="item.key">
          <li v-if="item.kind === 'head'" class="camp-group" :data-key="item.key">
            <button
              type="button"
              class="camp-group-head"
              :aria-expanded="item.folded ? 'false' : 'true'"
              :title="item.folded ? 'Show the ' + typeInfo(item.type).many.toLowerCase() : 'Hide the ' + typeInfo(item.type).many.toLowerCase()"
              @click="toggleGroup(item.type)"
              @keydown="onRowKey($event, null)"
            >
              <Icon name="chevron-right" :size="11" />
              <span class="ui-kicker">{{ typeInfo(item.type).many }}</span>
              <span class="ui-count">{{ item.count }}</span>
            </button>
          </li>
          <li v-else :data-key="item.key" :class="{ 'has-locate': places.has(item.record.id) }">
            <button
              v-record-card="item.record.id"
              type="button"
              class="camp-row"
              :data-id="item.record.id"
              :class="{ 'is-on': item.record.id === selected }"
              :aria-current="item.record.id === selected ? 'true' : undefined"
              @click="emit('open', item.record.id)"
              @keydown="onRowKey($event, item.record.id)"
            >
              <RecordAvatar :record="item.record" :universe-id="campaign.universeId" size="row" />
              <span class="camp-row-text">
                <b>{{ item.record.name }}</b>
                <span v-if="item.record.summary" class="camp-row-sum">{{ item.record.summary }}</span>
                <span class="camp-row-meta">{{ typeInfo(item.record.type).one }} · {{ placeNow(item.record) }}</span>
                <span v-if="item.record.tags.length" class="camp-row-tags">
                  <span v-for="tag in item.record.tags" :key="tag" class="ui-chip">{{ tag }}</span>
                </span>
              </span>
            </button>
            <button
              v-if="places.has(item.record.id)"
              type="button"
              class="camp-locate"
              :data-id="item.record.id"
              :aria-pressed="locating.recordId === item.record.id ? 'true' : 'false'"
              :aria-label="(locating.recordId === item.record.id ? 'Stop locating ' : 'Locate ') + item.record.name"
              :title="locating.recordId === item.record.id ? 'Stop locating' : 'Show on the map (L)'"
              @click="locateRow(item.record.id)"
            >
              <Icon name="location-crosshairs" :size="14" />
            </button>
          </li>
        </template>
        <li v-if="win.padAfter > 0" class="camp-pad" aria-hidden="true" :style="{ height: win.padAfter + 'px' }"></li>
      </ul>
      <div v-else-if="query" class="camp-first ui-ground">
        <span class="camp-glyph is-large" aria-hidden="true"><Icon name="search" :size="22" /></span>
        <h2>No records match</h2>
        <p>Nothing matches “{{ query }}”{{ atHere && here ? ' ' + here.label.replace(/^At/, 'at') : '' }}.</p>
        <div class="camp-first-starts">
          <button type="button" class="ui-btn" @click="query = ''">Clear the search</button>
        </div>
      </div>
      <div v-else-if="atHere && here" class="camp-first ui-ground">
        <span class="camp-glyph is-large" aria-hidden="true"><Icon name="location-dot" :size="22" /></span>
        <h2>Nothing of yours here</h2>
        <p>Nothing of yours {{ here.label.replace(/^At/, 'at') }}.</p>
        <div class="camp-first-starts">
          <button type="button" class="ui-btn" @click="atHere = false">Show every record</button>
        </div>
      </div>
      <div v-else-if="!hideEmpty" class="camp-first ui-ground">
        <span class="camp-glyph is-large" aria-hidden="true"><Icon name="book-sparkles" :size="22" /></span>
        <h2>No {{ typeInfo(addType).many.toLowerCase() }} yet</h2>
        <p>Add one. It stays in your campaign.</p>
        <div class="camp-first-starts">
          <button type="button" class="ui-btn is-primary" :disabled="readOnly" @click="add(addType)">
            <Icon name="plus" :size="13" />Add {{ typeInfo(addType).a }}
          </button>
        </div>
      </div>
    </template>

    <RecordsPublish v-if="publishing" :start="publishStart" @close="publishing = false" />

    <details v-if="recentlyDeleted.length" class="camp-gone">
      <summary>Recently deleted <span class="ui-count">{{ recentlyDeleted.length }}</span></summary>
      <ul>
        <li v-for="gone in recentlyDeleted" :key="gone.id">
          <Icon :name="typeInfo(gone.type).icon" :size="13" />
          <span>{{ gone.name }}</span>
          <button type="button" class="ui-btn" :disabled="readOnly" @click="restoreRecord(gone.id)">
            <Icon name="rotate-left" :size="12" />Restore
          </button>
        </li>
      </ul>
      <p>Kept until you leave or reload this page.</p>
    </details>
  </div>
</template>

<style>
.camp-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* On a narrow panel the buttons go under the search rather than squeeze it. */
.camp-tool {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.camp-search {
  flex: 1 1 200px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-muted);
}

.camp-search:focus-within {
  border-color: var(--signal);
}

.camp-search input {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
}

.camp-search input::placeholder {
  color: var(--text-muted);
}

.camp-search input:focus-visible {
  outline: none;
}

/* Type chips: one on at a time, each with its count. */
.camp-types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.camp-type {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 4px 10px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-pill);
  background: var(--panel-raised);
  color: var(--text-1);
  font: 400 12.5px/1.35 var(--font-text);
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.camp-type .ui-icon {
  color: var(--text-muted);
}

.camp-type b {
  color: var(--text-muted);
  font: 700 12px/1 var(--font-code);
}

.camp-type:hover {
  border-color: var(--signal-dim);
}

.camp-type[aria-checked="true"] {
  border-color: var(--signal-dim);
  background: var(--row-active);
  color: var(--signal);
}

.camp-type[aria-checked="true"] b,
.camp-type[aria-checked="true"] .ui-icon {
  color: var(--signal);
}

/* The order, at the chips' right. */
.camp-sort {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
}

.camp-sort select {
  margin: 0;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-muted);
  font: 400 12.5px/1.35 var(--font-text);
  cursor: pointer;
}

.camp-sort select:hover,
.camp-sort select:focus-visible {
  border-color: var(--line-1);
  background: var(--panel-raised);
  color: var(--text-1);
}

.camp-sort option {
  background: var(--bg-1);
  color: var(--text-1);
}

.camp-type.camp-here[aria-checked="true"] {
  border-color: var(--signal-dim);
  background: var(--row-active);
  color: var(--signal);
}

.camp-type.camp-here[aria-checked="true"] .ui-icon {
  color: var(--signal);
}

/* Rows: the legacy record row. A mark, the name, a line of summary, a muted line of type and place. */
/* The rows sit in a frame (the version-video look): the records list and the journal. */
.camp-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line-2);
  border-radius: var(--r-4);
  overflow: hidden;
  background: var(--bg-0);
  box-shadow: 0 0 24px var(--frame-glow);
}

.camp-rows li {
  position: relative;
}

.camp-rows li + li {
  border-top: 1px solid var(--line-soft);
}

/* The space standing in for the items a long list leaves undrawn. */
.camp-rows li.camp-pad {
  border-top: 0;
}

/* A type's heading in the grouped list: its name, its count, and the fold. */
.camp-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 9px 12px 7px;
  border: 0;
  background: var(--wash-faint);
  color: var(--text-muted);
  text-align: left;
  cursor: pointer;
}

.camp-group-head:hover {
  background: var(--surface-1);
}

.camp-group-head:focus-visible {
  outline-offset: -3px;
}

.camp-group-head .ui-icon {
  transition: transform var(--t-fast) var(--ease-out);
}

.camp-group-head[aria-expanded="true"] .ui-icon {
  transform: rotate(90deg);
}

.camp-group-head .ui-count {
  margin-left: auto;
  padding: 0;
  background: none;
  color: var(--signal);
  font: 700 13px/1 var(--font-display);
}

@media (prefers-reduced-motion: reduce) {
  .camp-group-head .ui-icon {
    transition: none;
  }
}

/* Locate sits at the row's right end, a button of its own beside the row's. */
.camp-rows li.has-locate .camp-row {
  padding-right: 52px;
}

.camp-locate {
  position: absolute;
  top: 50%;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: -16px 0 0;
  padding: 0;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--signal);
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.camp-locate:hover {
  border-color: var(--signal);
}

.camp-locate[aria-pressed="true"] {
  border-color: var(--signal);
  background: var(--row-active);
}

/* The row being located keeps a teal edge, as the legacy tracked row does. */
.camp-rows li:has(.camp-locate[aria-pressed="true"]) .camp-row {
  box-shadow: inset 3px 0 0 var(--signal);
}

.camp-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font: 400 13.5px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out);
}

.camp-row:hover {
  background: var(--surface-1);
}

.camp-row.is-on {
  background: var(--row-active);
  box-shadow: inset 3px 0 0 var(--signal);
}

.camp-row:focus-visible {
  outline-offset: -3px;
}

.camp-row-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.camp-row-text b {
  color: var(--text-0);
  font: 700 14.5px/1.35 var(--font-text);
  overflow-wrap: anywhere;
}

.camp-row-sum {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.camp-row-meta {
  color: var(--text-muted);
  font-size: 12px;
}

/* Tags show where there is room for them: half and full width. */
.camp-row-tags {
  display: none;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}

.camp[data-span="half"] .camp-row-tags,
.camp[data-span="half"] .camp-row-sum {
  display: flex;
  white-space: normal;
}

.camp[data-span="half"] .camp-row-sum {
  display: block;
}

.camp-glyph {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-2);
  background: var(--wash-faint);
  color: var(--signal);
}

.camp-glyph.is-thumb {
  object-fit: cover;
  background: var(--bg-0);
}

.camp-glyph.is-large {
  width: 52px;
  height: 52px;
}

/* The first visit: what this is, and three ways to start. */
.camp-first-player {
  margin: 16px 0;
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
}

.camp-first {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  max-width: 620px;
  padding: 24px 22px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.camp-first h2 {
  margin: 0;
  color: var(--text-0);
  font: 700 21px/1.25 var(--font-text);
}

.camp-first p {
  margin: 0;
  color: var(--text-1);
  font-size: 14.5px;
}

/*
 * A first visit on the ground (the version-video look): the records here, and the journal and the
 * party, whose cards add .ui-ground too. The card sets its own background, so it names the ground's.
 */
.camp-first.ui-ground {
  border-color: var(--line-2);
  border-radius: var(--r-4);
  background: var(--ground-fill);
  box-shadow: 0 0 24px var(--frame-glow);
  overflow: hidden;
}

.camp-first.ui-ground h2 {
  font: 700 19px/1.3 var(--font-display);
  letter-spacing: 0.02em;
}

.camp-first.ui-ground > .camp-glyph {
  width: 56px;
  height: 50px;
  border: 0;
  border-radius: 0;
  background: var(--wash);
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
}

.camp-first-starts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.camp-first-starts .ui-btn {
  min-height: 36px;
  padding: 0 12px;
}

.camp-namer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 360px;
  margin-top: 4px;
  color: var(--text-1);
  font: 600 12.5px/1.3 var(--font-text);
}

.camp-namer em {
  color: var(--text-muted);
  font-style: normal;
  font-weight: 400;
}

.camp-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
}

.camp-input::placeholder {
  color: var(--text-muted);
}

.camp-input:focus-visible {
  outline: none;
  border-color: var(--signal);
  box-shadow: 0 0 0 2px var(--signal-glow);
}

/* This session's deletes, at the foot of the list. */
.camp-gone {
  color: var(--text-muted);
  font: 400 13px/1.4 var(--font-text);
}

.camp-gone summary {
  display: inline-flex;
  align-items: center;
  padding: 4px 2px;
  border-radius: var(--r-1);
  cursor: pointer;
}

.camp-gone ul {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
}

.camp-gone li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  color: var(--text-1);
}

.camp-gone li + li {
  border-top: 1px solid var(--line-soft);
}

.camp-gone li span {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.camp-gone p {
  margin: 6px 2px 0;
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .camp-type,
  .camp-row {
    transition: none;
  }
}
</style>

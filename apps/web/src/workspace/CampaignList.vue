<script setup lang="ts">
/**
 * The record list (design §2): search, Add, the type chips with their counts, the rows, the
 * empty states, the first-run card, and this session's deletes at the foot. It reads the
 * campaign from the store and asks the panel to open or create; it changes nothing itself
 * but a delete and a restore.
 */
import { computed, nextTick, ref } from 'vue';
import { CAMPAIGN_LIMITS, type CampaignRecordType } from '@voyage/shared';
import { campaign, renameCampaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { deleteRecord, recentlyDeleted, restoreRecord } from './actions.ts';
import { RECORD_TYPES, filterRecords, liveRecords, placeLine, typeCounts, typeInfo, type TypeFilter } from './records.ts';

const props = defineProps<{
    /** The record open beside the list (full width), or null. */
    selected: string | null;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const emit = defineEmits<{
    open: [id: string];
    create: [type: CampaignRecordType];
}>();

const query = ref('');
const filter = ref<TypeFilter>('all');
const addOpen = ref(false);
const searchEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const addMenu = ref<HTMLElement | null>(null);
const nameDraft = ref('');

const all = computed(() => liveRecords(campaign.records));
const counts = computed(() => typeCounts(all.value));
const rows = computed(() => filterRecords(all.value, { type: filter.value, query: query.value }));
const addType = computed((): CampaignRecordType => filter.value === 'all' ? 'person' : filter.value);
const first = computed(() => all.value.length === 0);
const campaignName = computed(() => {
    const found = campaign.universes.find((item) => item.id === campaign.universeId);
    return found ? found.name : '';
});

function add(type: CampaignRecordType): void {
    addOpen.value = false;
    if (props.readOnly) return;
    emit('create', type);
}

function toggleAdd(): void {
    addOpen.value = !addOpen.value;
    if (addOpen.value) void nextTick(() => {
        const item = addMenu.value ? addMenu.value.querySelector<HTMLElement>('[role="menuitem"]') : null;
        if (item) item.focus();
    });
}

function rowButtons(): HTMLElement[] {
    return listEl.value ? Array.from(listEl.value.querySelectorAll<HTMLElement>('.camp-row')) : [];
}

/** Up and Down walk the rows; Delete deletes the row in focus and moves focus to its neighbour. */
function onRowKey(event: KeyboardEvent, id: string): void {
    const buttons = rowButtons();
    const at = buttons.indexOf(event.currentTarget as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const next = buttons[at + (event.key === 'ArrowDown' ? 1 : -1)];
        event.preventDefault();
        event.stopPropagation();
        if (next) next.focus();
        else if (event.key === 'ArrowUp' && searchEl.value) searchEl.value.focus();
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

function onMenuKey(event: KeyboardEvent): void {
    const items = addMenu.value ? Array.from(addMenu.value.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
    const at = items.indexOf(event.target as HTMLElement);
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        addOpen.value = false;
        return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    const next = items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    if (next) next.focus();
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
    <div v-if="first && !query" class="camp-first">
      <span class="camp-glyph is-large" aria-hidden="true"><Icon name="book-sparkles" :size="22" /></span>
      <h2>Your campaign starts here</h2>
      <p>It is private to you and sits on top of the released map. Nothing you add changes the map.</p>
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
        <div class="camp-add">
          <button type="button" class="ui-btn is-primary camp-add-main" :disabled="readOnly" :title="'Add ' + typeInfo(addType).a" @click="add(addType)">
            <Icon name="plus" :size="13" />Add
          </button>
          <button
            type="button"
            class="ui-btn is-primary camp-add-more"
            aria-label="Add a record of another type"
            title="Add a record of another type"
            aria-haspopup="true"
            :aria-expanded="addOpen ? 'true' : 'false'"
            :disabled="readOnly"
            @click="toggleAdd"
          >
            <Icon name="caret-down" :size="12" />
          </button>
          <div v-if="addOpen" class="camp-add-backdrop" @click="addOpen = false"></div>
          <div v-if="addOpen" ref="addMenu" class="camp-add-menu" role="menu" aria-label="Add a record" @keydown="onMenuKey">
            <button v-for="info in RECORD_TYPES" :key="info.type" type="button" role="menuitem" @click="add(info.type)">
              <Icon :name="info.icon" :size="14" /><span>{{ info.one }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="camp-types" role="radiogroup" aria-label="Type">
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
      </div>

      <ul v-if="rows.length" ref="listEl" class="camp-rows" aria-label="Records">
        <li v-for="record in rows" :key="record.id">
          <button
            type="button"
            class="camp-row"
            :data-id="record.id"
            :class="{ 'is-on': record.id === selected }"
            :aria-current="record.id === selected ? 'true' : undefined"
            @click="emit('open', record.id)"
            @keydown="onRowKey($event, record.id)"
          >
            <span class="camp-glyph" aria-hidden="true"><Icon :name="typeInfo(record.type).icon" :size="16" /></span>
            <span class="camp-row-text">
              <b>{{ record.name }}</b>
              <span v-if="record.summary" class="camp-row-sum">{{ record.summary }}</span>
              <span class="camp-row-meta">{{ typeInfo(record.type).one }} · {{ placeLine(record) }}</span>
              <span v-if="record.tags.length" class="camp-row-tags">
                <span v-for="tag in record.tags" :key="tag" class="ui-chip">{{ tag }}</span>
              </span>
            </span>
          </button>
        </li>
      </ul>
      <div v-else-if="query" class="camp-empty">
        <p>No records match “{{ query }}”.</p>
        <button type="button" class="ui-btn" @click="query = ''">Clear the search</button>
      </div>
      <div v-else class="camp-empty">
        <p>No {{ typeInfo(addType).many.toLowerCase() }} yet.</p>
        <button type="button" class="ui-btn is-primary" :disabled="readOnly" @click="add(addType)">
          <Icon name="plus" :size="13" />Add {{ typeInfo(addType).a }}
        </button>
      </div>
    </template>

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

.camp-tool {
  display: flex;
  gap: 8px;
}

.camp-search {
  flex: 1 1 auto;
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

/* Add: the button adds the type in view; its caret offers the nine. */
.camp-add {
  position: relative;
  display: flex;
  flex: 0 0 auto;
}

.camp-add .ui-btn {
  height: 36px;
  font-size: 14px;
}

.camp-add-main {
  border-radius: var(--r-2) 0 0 var(--r-2);
}

.camp-add-more {
  padding: 0 9px;
  border-left-color: var(--on-signal);
  border-radius: 0 var(--r-2) var(--r-2) 0;
}

.camp-add-backdrop {
  position: fixed;
  inset: 0;
  z-index: 6;
}

.camp-add-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 190px;
  padding: 6px;
  border: 1px solid var(--signal-dim);
  border-radius: var(--r-3);
  background: var(--chrome-bg);
  box-shadow: var(--shadow-pop);
}

.camp-add-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 400 14px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.camp-add-menu button:hover,
.camp-add-menu button:focus-visible {
  background: var(--row-active);
}

.camp-add-menu button:focus-visible {
  outline-offset: -2px;
}

.camp-add-menu .ui-icon {
  flex: 0 0 16px;
  color: var(--signal);
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

/* Rows: the legacy record row. A mark, the name, a line of summary, a muted line of type and place. */
.camp-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  overflow: hidden;
  background: var(--panel-raised);
}

.camp-rows li + li {
  border-top: 1px solid var(--line-soft);
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

.camp-glyph.is-large {
  width: 52px;
  height: 52px;
}

.camp-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 22px 16px;
  border: 1px dashed var(--line-2);
  border-radius: var(--r-3);
  color: var(--text-muted);
}

.camp-empty p {
  margin: 0;
}

/* The first visit: what this is, and three ways to start. */
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

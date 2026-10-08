<script setup lang="ts">
/**
 * The journal list (journal design §2). Newest first is the store's order. The kind chips
 * are a radio: Left and Right move, Space chooses. Search matches the stored title and body, and a token's label.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { CampaignEntryKind } from '@voyage/shared';
import { campaign } from '../../campaign/store.ts';
import { deleteEntry, entriesAtHex, entriesNewestFirst } from '../../campaign/journal.ts';
import Icon from '../../design/Icon.vue';
import { locating, startLocate, stopLocate } from '../locate.ts';
import { placeSource } from '../place_source.ts';
import { hexKeyOf, hexWords } from '../places.ts';
import { resolveAnchor } from '../party.ts';
import { emptyKind, filterEntries, filterWord, kindCounts, KIND_ORDER, rowFace, type KindFilter } from './list.ts';

const props = defineProps<{
    selected: string | null;
    /** Full width: Up and Down open the row they land on. */
    follow: boolean;
    readOnly: boolean;
}>();

const emit = defineEmits<{
    open: [id: string | null];
    create: [kind: CampaignEntryKind];
    map: [];
}>();

const query = ref('');
const filter = ref<KindFilter>('all');
const menuOpen = ref(false);
const searchEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const typesEl = ref<HTMLElement | null>(null);
const here = ref<{ hexKey: string; label: string; name: string } | null>(null);
const atHere = ref(false);

const all = computed(() => {
    void campaign.seq;
    void campaign.journal;
    return entriesNewestFirst();
});
const counts = computed(() => kindCounts(all.value));
const hexIds = computed(() => {
    if (!atHere.value || !here.value) return null;
    void campaign.seq;
    return new Set(entriesAtHex(here.value.hexKey).map((entry) => entry.id));
});
/** A token with no written label: the record's name, or the open system's name when the hex is that system. */
function nameOf(target: string): string | null {
    if (target.startsWith('cr_')) {
        const host = campaign.records[target];
        return host && !host.deleted && host.name.trim() ? host.name.trim() : null;
    }
    if (target.startsWith('hex:') && here.value && target.slice(4) === here.value.hexKey) {
        const name = here.value.name.trim();
        return name || null;
    }
    return null;
}

const rows = computed(() => filterEntries(all.value, { kind: filter.value, query: query.value, hexIds: hexIds.value, nameOf }));
const faces = computed(() => {
    const records = campaign.records;
    return rows.value.map((entry) => rowFace(entry, records, nameOf));
});
const places = computed(() => {
    const found = new Map<string, string>();
    for (const entry of rows.value) {
        const place = resolveAnchor(entry.anchor, campaign.records);
        if (place) found.set(entry.id, place.hexKey);
    }
    return found;
});

function readHere(): void {
    const source = placeSource();
    const now = source ? source.current() : null;
    here.value = now ? { hexKey: hexKeyOf(now.slug, now.hex), name: now.name, label: 'At ' + (now.name ? now.name + ' ' + now.hex : hexWords(hexKeyOf(now.slug, now.hex))) } : null;
    if (!here.value) atHere.value = false;
}

onMounted(readHere);
watch(() => campaign.seq, readHere);

const first = computed(() => all.value.length === 0);
const kindEmpty = computed(() => (rows.value.length === 0 && !query.value.trim() ? emptyKind(filter.value) : null));

function make(kind: CampaignEntryKind): void {
    if (props.readOnly) return;
    emit('create', kind);
}

function locateRow(id: string): void {
    const hexKey = places.value.get(id);
    if (!hexKey) return;
    if (locating.recordId === id) {
        stopLocate();
        return;
    }
    emit('map');
    startLocate(id, hexKey, () => {
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
    return listEl.value ? Array.from(listEl.value.querySelectorAll<HTMLElement>('.camp-row')) : [];
}

function focusUndo(): void {
    void nextTick(() => {
        const undo = document.querySelector<HTMLElement>('.toast-act');
        if (undo) undo.focus();
    });
}

function onRowKey(event: KeyboardEvent, id: string): void {
    const buttons = rowButtons();
    const at = buttons.indexOf(event.currentTarget as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const next = buttons[at + (event.key === 'ArrowDown' ? 1 : -1)];
        event.preventDefault();
        event.stopPropagation();
        if (next) {
            next.focus();
            if (props.follow && next.dataset.id) emit('open', next.dataset.id);
        } else if (event.key === 'ArrowUp' && searchEl.value) searchEl.value.focus();
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        emit('open', id);
        return;
    }
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
        if (!deleteEntry(id)) return;
        if (props.selected === id) emit('open', null);
        focusUndo();
    }
}

function onListKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    const target = event.target;
    const tag = target instanceof HTMLElement ? target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!props.selected) return;
    event.preventDefault();
    event.stopPropagation();
    emit('open', null);
}

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
    if (event.key === 'Escape' && query.value) {
        event.preventDefault();
        event.stopPropagation();
        query.value = '';
        return;
    }
    event.stopPropagation();
}

const FILTERS: KindFilter[] = ['all', ...KIND_ORDER];

function onTypesKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== ' ') return;
    const buttons = typesEl.value ? Array.from(typesEl.value.querySelectorAll<HTMLElement>('[role="radio"]')) : [];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    if (event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        const kind = FILTERS[at];
        if (kind) filter.value = kind;
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const next = buttons[at + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) next.focus();
}

defineExpose({ focusSearch: () => { if (searchEl.value) searchEl.value.focus(); } });
</script>

<template>
  <div class="camp-list" @keydown="onListKey">
    <div v-if="first" class="camp-first">
      <span class="camp-glyph is-large" aria-hidden="true"><Icon name="book-atlas" :size="22" /></span>
      <h2>Sessions, notes, handouts and rumours land here.</h2>
      <p>A session takes the campaign date and where the party is. A note waits until you date it.</p>
      <div class="camp-first-starts">
        <button type="button" class="ui-btn is-primary" data-command="journal-new-session" :disabled="readOnly" @click="make('session')">
          <Icon name="plus" :size="13" />New session
        </button>
        <button type="button" class="ui-btn" data-command="journal-new-note" :disabled="readOnly" @click="make('note')">New note</button>
      </div>
    </div>

    <template v-else>
      <div class="camp-tool">
        <label class="camp-search">
          <Icon name="search" :size="14" />
          <input
            ref="searchEl"
            v-model="query"
            type="search"
            placeholder="Search the journal"
            aria-label="Search the journal"
            @keydown="onSearchKey"
          >
        </label>
        <button type="button" class="ui-btn is-primary" data-command="journal-new-session" :disabled="readOnly" @click="make('session')">
          <Icon name="plus" :size="13" />New session
        </button>
        <button type="button" class="ui-btn" data-command="journal-new-note" :disabled="readOnly" @click="make('note')">New note</button>
        <span class="jn-more">
          <button type="button" class="ui-btn is-icon" data-command="journal-new-handout" aria-label="Handout or rumour" aria-haspopup="menu" :disabled="readOnly" @click="menuOpen = !menuOpen">
            <Icon name="caret-down" :size="12" />
          </button>
          <span v-if="menuOpen" class="camp-add-backdrop" @click="menuOpen = false"></span>
          <span v-if="menuOpen" class="camp-add-menu" role="menu" aria-label="Handout or rumour">
            <button type="button" role="menuitem" data-command="journal-new-handout" @click="menuOpen = false; make('handout')">
              <Icon name="book-atlas" :size="14" /><span>Handout</span>
            </button>
            <button type="button" role="menuitem" data-command="journal-new-rumour" @click="menuOpen = false; make('rumor')">
              <Icon name="radar" :size="14" /><span>Rumour</span>
            </button>
          </span>
        </span>
      </div>

      <div ref="typesEl" class="camp-types" role="radiogroup" aria-label="Kind" @keydown="onTypesKey">
        <button
          v-if="here"
          type="button"
          role="checkbox"
          class="camp-type camp-here"
          :aria-checked="atHere ? 'true' : 'false'"
          @click="atHere = !atHere"
        >
          <Icon name="location-dot" :size="11" />{{ here.label }}
        </button>
        <button type="button" role="radio" class="camp-type" :aria-checked="filter === 'all' ? 'true' : 'false'" @click="filter = 'all'">
          All <b>{{ counts.all }}</b>
        </button>
        <button
          v-for="kind in KIND_ORDER"
          :key="kind"
          type="button"
          role="radio"
          class="camp-type"
          :aria-checked="filter === kind ? 'true' : 'false'"
          @click="filter = kind"
        >
          {{ filterWord(kind) }} <b>{{ counts[kind] }}</b>
        </button>
      </div>

      <p v-if="query.trim() && rows.length === 0" class="jn-none">
        No entries match "{{ query.trim() }}".
        <button type="button" class="ui-btn" @click="query = ''">Clear the search</button>
      </p>
      <p v-else-if="kindEmpty" class="jn-none">
        {{ kindEmpty.line }}
        <button type="button" class="ui-btn" :disabled="readOnly" @click="make(kindEmpty.make)">{{ kindEmpty.action }}</button>
      </p>
      <p v-else-if="rows.length === 0" class="jn-none">No entries here.</p>

      <ul v-else ref="listEl" class="camp-rows" aria-label="Journal">
        <li v-for="face in faces" :key="face.id" :class="{ 'has-locate': places.has(face.id) }">
          <button
            type="button"
            class="camp-row"
            :class="{ 'is-on': face.id === selected }"
            :data-id="face.id"
            @click="emit('open', face.id)"
            @keydown="onRowKey($event, face.id)"
          >
            <span class="camp-glyph" aria-hidden="true"><Icon :name="face.icon" :size="16" /></span>
            <span class="camp-row-text">
              <span class="jn-name">
                <b v-if="face.number" class="jn-num">{{ face.number }}</b>
                <b :class="{ 'is-soft': face.soft }">{{ face.name }}</b>
                <span class="ui-chip jn-kind">{{ face.chip }}</span>
              </span>
              <span v-if="face.summary" class="camp-row-sum">{{ face.summary }}</span>
              <span class="camp-row-meta">{{ face.meta }}</span>
            </span>
          </button>
          <button
            v-if="places.has(face.id)"
            type="button"
            class="camp-locate"
            :data-id="face.id"
            :aria-pressed="locating.recordId === face.id ? 'true' : 'false'"
            aria-label="Locate"
            @click="locateRow(face.id)"
          >
            <Icon name="location-crosshairs" :size="13" />
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style>
.jn-more {
  position: relative;
  display: inline-flex;
}

.jn-name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.jn-name b.is-soft {
  font-weight: 500;
}

.jn-num {
  color: var(--signal);
  font: 700 14px/1.2 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.jn-kind {
  flex: 0 0 auto;
  margin-left: auto;
}

.jn-none {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  color: var(--text-1);
}
</style>

<script setup lang="ts">
/**
 * The journal list (journal design §2). Newest first is the store's order. The kind chips
 * are a radio: Left and Right move, Space chooses. Search matches the stored title and body, and a token's label.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CampaignEntryKind } from '@voyage/shared';
import { campaign } from '../../campaign/store.ts';
import { deleteEntry, entriesAtHex, entriesNewestFirst } from '../../campaign/journal.ts';
import Icon from '../../design/Icon.vue';
import { saveBlob } from '../../platform/browser.ts';
import { commandScope, handleKey, registerCommand, setCommandScope } from '../../shell/registry.ts';
import { showToast } from '../../shell/toast.ts';
import RecordAvatar from '../RecordAvatar.vue';
import { journalFilter, journalQuery } from '../list_state.ts';
import { locating, startLocate, stopLocate } from '../locate.ts';
import { placeSource } from '../place_source.ts';
import { hexKeyOf, hexWords } from '../places.ts';
import { resolveAnchor } from '../party.ts';
import AskModal from '../../shell/AskModal.vue';
import { emptyKind, filterEntries, filterWord, kindCounts, KIND_ORDER, rowFace, visibleRange, type KindFilter } from './list.ts';
import { replyWords } from './replies.ts';

/** How long a search waits before the list is filtered again. */
const SEARCH_WAIT = 150;
/** A row's height before one has been measured. The window corrects on the next scroll. */
const ROW_FALLBACK = 72;

const props = defineProps<{
    selected: string | null;
    /** Full width: Up and Down open the row they land on. */
    follow: boolean;
    readOnly: boolean;
    /** A player's journal (P6): what is shared with them, and one way to write, Add a note. */
    player?: boolean;
}>();

const emit = defineEmits<{
    open: [id: string | null];
    create: [kind: CampaignEntryKind];
    map: [];
}>();

const packAsk = ref<string | null>(null);
const packBusy = ref(false);
const query = ref(journalQuery.value);
/** The query the list is filtered by. Typing updates it after SEARCH_WAIT. */
const needle = ref(journalQuery.value);
const filter = journalFilter;
const menuOpen = ref(false);
const searchEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const typesEl = ref<HTMLElement | null>(null);
const here = ref<{ hexKey: string; label: string; name: string } | null>(null);
const atHere = ref(false);
const scrollTop = ref(0);
const viewHeight = ref(0);
const listTop = ref(0);
const rowHeight = ref(ROW_FALLBACK);

let searchWait: ReturnType<typeof setTimeout> | null = null;
let scrollEl: HTMLElement | null = null;

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

const rows = computed(() => filterEntries(all.value, { kind: filter.value, query: needle.value, hexIds: hexIds.value, nameOf }));
const faces = computed(() => {
    const records = campaign.records;
    return rows.value.map((entry) => rowFace(entry, records, nameOf, campaign.authorNames[entry.id] ?? null));
});
const range = computed(() => visibleRange(
    faces.value.length,
    scrollTop.value - listTop.value,
    viewHeight.value || 640,
    rowHeight.value,
));
const shown = computed(() => faces.value.slice(range.value.start, range.value.end));
const padBefore = computed(() => range.value.start * rowHeight.value);
const padAfter = computed(() => Math.max(0, (faces.value.length - range.value.end) * rowHeight.value));

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

onMounted(() => {
    bindKeys();
    readHere();
    void nextTick(bindScroll);
});
onBeforeUnmount(() => {
    releaseListKeys();
    if (searchWait) clearTimeout(searchWait);
    if (scrollEl) scrollEl.removeEventListener('scroll', readScroll);
});
watch(() => campaign.seq, readHere);
watch(rows, () => { void nextTick(bindScroll); });

const first = computed(() => all.value.length === 0);
const kindEmpty = computed(() => (rows.value.length === 0 && !needle.value.trim() ? emptyKind(filter.value) : null));

function readScroll(): void {
    if (!scrollEl) return;
    scrollTop.value = scrollEl.scrollTop;
    viewHeight.value = scrollEl.clientHeight;
    const list = listEl.value;
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    listTop.value = listRect.top - scrollRect.top + scrollEl.scrollTop;
    const row = list.querySelector<HTMLElement>(':scope > li:not(.jn-pad)');
    if (row) {
        const height = row.getBoundingClientRect().height;
        if (height > 0 && Math.abs(height - rowHeight.value) > 1) rowHeight.value = height;
    }
}

function bindScroll(): void {
    const list = listEl.value;
    const next = list ? list.closest<HTMLElement>('.panel-body') : null;
    if (next === scrollEl) {
        readScroll();
        return;
    }
    if (scrollEl) scrollEl.removeEventListener('scroll', readScroll);
    scrollEl = next;
    if (scrollEl) scrollEl.addEventListener('scroll', readScroll, { passive: true });
    readScroll();
}

watch(query, (value) => {
    if (searchWait) clearTimeout(searchWait);
    searchWait = null;
    if (!value.trim()) {
        needle.value = '';
        journalQuery.value = '';
        return;
    }
    searchWait = setTimeout(() => {
        searchWait = null;
        needle.value = value;
        journalQuery.value = value;
    }, SEARCH_WAIT);
});

watch(shown, () => { void nextTick(readScroll); });

function make(kind: CampaignEntryKind): void {
    if (props.readOnly) return;
    emit('create', kind);
}

function reveal(index: number): void {
    const scroller = scrollEl;
    const list = listEl.value;
    if (!scroller || !list || index < 0) return;
    const top = listTop.value + index * rowHeight.value;
    const bottom = top + rowHeight.value;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
    readScroll();
}

function locateRow(id: string): void {
    const hexKey = places.value.get(id);
    if (!hexKey) return;
    if (locating.recordId === id) {
        stopLocate();
        return;
    }
    emit('map');
    reveal(faces.value.findIndex((face) => face.id === id));
    void nextTick(() => startLocate(id, hexKey, () => {
        if (!listEl.value) return null;
        for (const el of listEl.value.querySelectorAll<HTMLElement>('.camp-locate')) {
            if (el.dataset.id !== id) continue;
            const box = el.getBoundingClientRect();
            return box.height > 0 ? box.top + box.height / 2 : null;
        }
        return null;
    }));
}

function focusUndo(): void {
    void nextTick(() => {
        const undo = document.querySelector<HTMLElement>('.toast-act');
        if (undo) undo.focus();
    });
}

function focusRow(index: number): void {
    if (index < 0) {
        if (searchEl.value) searchEl.value.focus();
        return;
    }
    const face = faces.value[index];
    if (!face) return;
    reveal(index);
    void nextTick(() => {
        const button = listEl.value?.querySelector<HTMLElement>('.camp-row[data-id="' + face.id + '"]');
        if (button) button.focus();
        if (props.follow) emit('open', face.id);
    });
}

const LIST_SCOPE = 'journal-list';
let releaseKeys: (() => void)[] = [];
let replay = false;

function inPanel(): boolean {
    const target = document.activeElement;
    return target instanceof HTMLElement && !!target.closest('.campaign-root');
}

function rowFocused(): boolean {
    const target = document.activeElement;
    return target instanceof HTMLElement && !!listEl.value?.contains(target) && target.classList.contains('camp-row');
}

function replayRow(key: string): void {
    const target = document.activeElement;
    if (!(target instanceof HTMLElement) || !listEl.value?.contains(target)) return;
    const id = target.dataset.id;
    if (!id) return;
    replay = true;
    onRowKey({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault() {},
        stopPropagation() {},
    }, id);
}

function bindKeys(): void {
    setCommandScope(LIST_SCOPE);
    const key = (id: string, name: string, keys: string[], run: () => void, live: () => boolean) => registerCommand({
        id, name, keys, scope: LIST_SCOPE, runnable: live, run,
    });
    releaseKeys = [
        key('journal-list-next', 'Next row (Down)', ['ArrowDown'], () => replayRow('ArrowDown'), rowFocused),
        key('journal-list-prev', 'Previous row (Up)', ['ArrowUp'], () => replayRow('ArrowUp'), rowFocused),
        key('journal-list-open', 'Open (Enter)', ['Enter'], () => replayRow('Enter'), rowFocused),
        key('journal-list-locate', 'Locate (L)', ['l', 'L'], () => replayRow('l'), rowFocused),
        key('journal-list-delete', 'Delete (Delete)', ['Delete'], () => replayRow('Delete'), rowFocused),
        key('journal-list-search', 'Search this list (/)', ['/'], () => { if (searchEl.value) searchEl.value.focus(); }, inPanel),
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
    preventDefault(): void;
    stopPropagation(): void;
}, id: string): void {
    if (!replay && handleKey(event as unknown as KeyboardEvent)) {
        event.stopPropagation();
        return;
    }
    replay = false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        const at = faces.value.findIndex((face) => face.id === id);
        focusRow(at + (event.key === 'ArrowDown' ? 1 : -1));
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

function packInput() {
    const universe = campaign.universes.find((row) => row.id === campaign.universeId);
    return {
        name: universe && universe.name ? universe.name : 'Campaign',
        clockDays: campaign.clock ? campaign.clock.days : null,
        records: campaign.records,
        links: campaign.links,
        journal: campaign.journal,
        settings: campaign.settings,
    };
}

async function askPack(): Promise<void> {
    if (packBusy.value) return;
    packBusy.value = true;
    try {
        const pack = await import('../../pack/plan.ts');
        packAsk.value = pack.packConfirm(pack.planPack(packInput()));
    } catch {
        showToast('The Player Pack could not be built.');
    } finally {
        packBusy.value = false;
    }
}

async function savePack(): Promise<void> {
    if (packBusy.value) return;
    packBusy.value = true;
    try {
        const built = await import('../../pack/build.ts');
        const paint = await import('../../pack/paint.ts');
        const file = built.buildPlayerPack(packInput(), paint.readPackPaint());
        saveBlob(new Blob([file.html], { type: 'text/html;charset=utf-8' }), file.fileName);
        packAsk.value = null;
    } catch {
        showToast('The Player Pack could not be built.');
    } finally {
        packBusy.value = false;
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
        event.preventDefault();
        event.stopPropagation();
        focusRow(0);
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
  <div class="camp-list jn-list" @keydown="onListKey">
    <div v-if="!first && !player" class="jn-pack">
      <button type="button" class="ui-btn" data-command="journal-pack" :disabled="packBusy" @click="askPack">Download the Player Pack</button>
      <AskModal
        v-if="packAsk"
        title="Download the Player Pack?"
        :text="packAsk"
        confirm="Download"
        busy-text="Downloading…"
        :busy="packBusy"
        @confirm="savePack"
        @cancel="packAsk = null"
      />
    </div>
    <div v-if="first && player" class="camp-first ui-ground" data-player-journal-empty>
      <span class="camp-glyph is-large" aria-hidden="true"><Icon name="book-atlas" :size="22" /></span>
      <h2>Notes for the players land here.</h2>
      <p>Add a note for your group. The referee can read it too.</p>
      <div class="camp-first-starts">
        <button type="button" class="ui-btn is-primary" data-command="journal-new-note" :disabled="readOnly" @click="make('note')">
          <Icon name="plus" :size="13" />Add a note
        </button>
      </div>
    </div>
    <div v-else-if="first" class="camp-first ui-ground">
      <span class="camp-glyph is-large" aria-hidden="true"><Icon name="book-atlas" :size="22" /></span>
      <h2>Sessions, notes, handouts, and rumours land here.</h2>
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
        <button v-if="player" type="button" class="ui-btn is-primary" data-command="journal-new-note" data-player-add-note :disabled="readOnly" @click="make('note')">
          <Icon name="plus" :size="13" />Add a note
        </button>
        <template v-else>
        <button type="button" class="ui-btn is-primary" data-command="journal-new-session" :disabled="readOnly" @click="make('session')">
          <Icon name="plus" :size="13" />New session
        </button>
        <button type="button" class="ui-btn" data-command="journal-new-note" :disabled="readOnly" @click="make('note')">New note</button>
        <span class="jn-more">
          <button type="button" class="ui-btn is-icon" data-command="journal-new-handout" aria-label="Handout or rumour" title="Handout or rumour" aria-haspopup="menu" :disabled="readOnly" @click="menuOpen = !menuOpen">
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
        </template>
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

      <div v-if="needle.trim() && rows.length === 0" class="camp-first ui-ground">
        <span class="camp-glyph" aria-hidden="true"><Icon name="search" :size="22" /></span>
        <h2>No entries match</h2>
        <p>Nothing matches “{{ needle.trim() }}”{{ atHere && here ? ' ' + here.label.replace(/^At/, 'at') : '' }}.</p>
        <div class="camp-first-starts">
          <button type="button" class="ui-btn" @click="query = ''">Clear the search</button>
        </div>
      </div>
      <div v-else-if="kindEmpty" class="camp-first ui-ground">
        <span class="camp-glyph" aria-hidden="true"><Icon name="book-atlas" :size="22" /></span>
        <h2>{{ kindEmpty.line.replace(/\.$/, '') }}</h2>
        <p>Add one. It stays in your campaign.</p>
        <div class="camp-first-starts">
          <button v-if="!player || kindEmpty.make === 'note'" type="button" class="ui-btn is-primary" :disabled="readOnly" @click="make(kindEmpty.make)">{{ kindEmpty.action }}</button>
        </div>
      </div>
      <div v-else-if="rows.length === 0" class="camp-first ui-ground">
        <span class="camp-glyph" aria-hidden="true"><Icon name="location-dot" :size="22" /></span>
        <h2>Nothing of yours here</h2>
        <p>{{ here ? 'Nothing of yours ' + here.label.replace(/^At/, 'at') + '.' : 'No entries here.' }}</p>
        <div class="camp-first-starts">
          <button type="button" class="ui-btn" @click="atHere = false">Show every entry</button>
        </div>
      </div>

      <ul v-else ref="listEl" class="camp-rows" aria-label="Journal">
        <li v-if="padBefore > 0" class="jn-pad" aria-hidden="true" :style="{ height: padBefore + 'px' }"></li>
        <li v-for="face in shown" :key="face.id" :class="{ 'has-locate': places.has(face.id) }">
          <button
            type="button"
            class="camp-row"
            :class="{ 'is-on': face.id === selected }"
            :data-id="face.id"
            @click="emit('open', face.id)"
            @keydown="onRowKey($event, face.id)"
          >
            <RecordAvatar
              v-if="face.images && face.images.length"
              :record="{ name: face.name, type: 'note', images: face.images }"
              :universe-id="campaign.universeId"
              size="row"
              :icon="face.icon"
            />
            <span v-else class="camp-glyph" aria-hidden="true"><Icon :name="face.icon" :size="16" /></span>
            <span class="camp-row-text">
              <span class="ui-kicker is-signal jn-kind">{{ face.chip }}</span>
              <span class="jn-name">
                <b v-if="face.number" class="jn-num">{{ face.number }}</b>
                <b :class="{ 'is-soft': face.soft }">{{ face.name }}</b>
                <span v-if="face.public" class="ui-chip jn-public">Public</span>
                <span v-if="face.author" class="jn-by">Written by <span class="ui-chip">{{ face.author }}</span></span>
              </span>
              <span v-if="face.summary" class="camp-row-sum">{{ face.summary }}</span>
              <span class="camp-row-meta jn-meta"><span v-if="face.when" class="ui-date">{{ face.when }}</span><span v-if="face.metaRest">{{ face.metaRest }}</span><span v-if="face.replies" class="jn-replies-count">{{ replyWords(face.replies) }}</span></span>
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
        <li v-if="padAfter > 0" class="jn-pad" aria-hidden="true" :style="{ height: padAfter + 'px' }"></li>
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
  font: 700 14px/1.2 var(--font-display);
  font-variant-numeric: var(--tabular);
}

.jn-public {
  flex: 0 0 auto;
}

/* The version-video look (Lane M): the rows in a frame, the kind as a kicker over the name, hex glyphs, the date in its box. */
.jn-list .camp-rows {
  border-color: var(--line-2);
  border-radius: var(--r-4);
  background: var(--bg-0);
  box-shadow: 0 0 24px var(--frame-glow);
}

.jn-list .camp-row {
  align-items: flex-start;
  padding: 12px 14px;
}

.jn-list .camp-row-text {
  gap: 3px;
}

.jn-kind {
  letter-spacing: 0.24em;
}

.jn-list .camp-glyph {
  width: 40px;
  height: 36px;
  margin-top: 2px;
  border: 0;
  border-radius: 0;
  background: var(--wash);
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
}

/* On a narrow panel the buttons go under the search rather than squeeze it. */
.jn-list .camp-tool {
  flex-wrap: wrap;
}

.jn-list .camp-search {
  flex: 1 1 200px;
}

.jn-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 2px;
}

.jn-meta .ui-date {
  padding: 1px 6px 0;
}

.jn-replies-count {
  color: var(--signal);
  font-weight: 700;
}

.jn-pad {
  margin: 0;
  padding: 0;
  border: 0;
}

.jn-pack {
  margin: 0 0 12px;
}

</style>

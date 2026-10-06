<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { TruthManifest } from '@voyage/shared';
import {
    rankResults,
    sectorMatches,
    systemResults,
    type OmniResult,
    type SearchItem,
} from '../search/omni.ts';
import { atPane, withQuery } from '../shell/pane.ts';
import { commands, registerCommand } from '../shell/registry.ts';
import { session } from '../account/session.ts';
import { campaign } from '../campaign/store.ts';
import { createRecord } from '../workspace/actions.ts';
import { handedQuery } from '../workspace/list_state.ts';
import { campaignMatches } from '../workspace/omni_campaign.ts';
import { offerSystem, picking } from '../workspace/pick.ts';
import { hexKeyOf, systemAnchor } from '../workspace/places.ts';
import Icon from '../design/Icon.vue';

const props = withDefaults(defineProps<{
    version: string;
    manifest: TruthManifest | null;
    layer?: 'canonical' | 'all';
}>(), { layer: 'canonical' });

const emit = defineEmits<{ open: [open: boolean] }>();

const route = useRoute();
const router = useRouter();
const inputEl = ref<HTMLInputElement | null>(null);
const query = ref('');
const open = ref(false);
const active = ref(-1);
const results = ref<OmniResult[]>([]);
const note = ref('');
/** On a system row, signed in: 0 opens it, 1 makes a person there, 2 a place there (Left and Right move). */
const action = ref(0);

/** The campaign's own records are offered once the campaign is in memory. */
const withCampaign = computed(() => session.user !== null && campaign.status === 'ready');

let timer = 0;
let controller: AbortController | null = null;
let generation = 0;
let unregister: (() => void) | null = null;
const cache = new Map<string, SearchItem[]>();

function commandResults(): OmniResult[] {
    const out: OmniResult[] = [];
    for (const command of commands()) {
        if (command.id === 'search') continue;
        out.push({ kind: 'command', name: command.name, detail: 'Command', id: command.id });
    }
    return out;
}

function remember(key: string, items: SearchItem[]): void {
    cache.delete(key);
    cache.set(key, items);
    while (cache.size > 20) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

async function loadSystems(text: string, signal: AbortSignal): Promise<SearchItem[]> {
    const key = text;
    const cached = cache.get(key);
    if (cached) {
        remember(key, cached);
        return cached;
    }
    const url = '/api/truth/search?q=' + encodeURIComponent(text) + '&version=' + encodeURIComponent(props.version);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('search');
    const body = await response.json() as { ok?: boolean; data?: { items?: SearchItem[] } };
    if (!body.ok || !body.data || !Array.isArray(body.data.items)) throw new Error('search');
    remember(key, body.data.items);
    return body.data.items;
}

async function search(): Promise<void> {
    const text = query.value;
    const localCommands = commandResults();
    if (text.trim() === '') {
        if (controller) controller.abort();
        results.value = localCommands;
        note.value = '';
        active.value = -1;
        open.value = true;
        return;
    }
    const sectors = props.manifest ? sectorMatches(text, props.manifest, props.layer) : [];
    const ticket = ++generation;
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    let systems: OmniResult[] = [];
    let failed = false;
    try {
        const items = await loadSystems(text, signal);
        if (props.manifest) systems = systemResults(items, props.manifest, props.layer);
    } catch {
        if (signal.aborted || ticket !== generation) return;
        failed = true;
    }
    if (ticket !== generation) return;
    note.value = failed ? 'Search is unavailable.' : '';
    const worlds = rankResults(text, [...systems, ...sectors, ...localCommands]);
    // The campaign group leads, at most five, then a row for the rest (design §6).
    const mine: OmniResult[] = [];
    if (withCampaign.value) {
        const found = campaignMatches(text, campaign.records, undefined, campaign.universeId);
        mine.push(...found.items);
        if (found.total > found.items.length) mine.push({ kind: 'more', name: 'All ' + found.total + ' matches', detail: 'Open the list with this search', query: text });
    }
    results.value = [...mine, ...worlds];
    active.value = -1;
    action.value = 0;
    open.value = true;
}

/** Where a group begins: the campaign's rows, then the worlds. */
function groupBefore(index: number): string {
    const result = results.value[index];
    const before = index > 0 ? results.value[index - 1] : null;
    const mine = (item: OmniResult | null): boolean => !!item && (item.kind === 'record' || item.kind === 'more');
    if (!result) return '';
    if (mine(result)) return index === 0 ? 'Your campaign' : '';
    if (before && mine(before)) return 'The chart';
    return '';
}

/** A record made at the system of a row, opened with its name ready to type. */
function makeHere(index: number, type: 'person' | 'place'): void {
    const result = results.value[index];
    if (!result || result.kind !== 'system' || !withCampaign.value) return;
    const id = createRecord(type, systemAnchor(hexKeyOf(result.sector, result.hex), result.name, null));
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: id }));
    query.value = '';
    closePopup();
    inputEl.value?.blur();
}

function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = 0;
        void search();
    }, 100);
}

function closePopup(): void {
    open.value = false;
    active.value = -1;
}

function openResult(index: number): void {
    const result = results.value[index];
    if (!result) return;
    if (result.kind === 'system') {
        if (action.value === 1 || action.value === 2) {
            makeHere(index, action.value === 1 ? 'person' : 'place');
            return;
        }
        // A record's place is being picked: the system goes to it, and the map stays where it is.
        if (offerSystem({ slug: result.sector, hex: result.hex, name: result.name })) query.value = '';
        else void router.push({ path: '/s/' + encodeURIComponent(result.sector) + '/' + result.hex, query: withQuery(route.query, {}) });
    } else if (result.kind === 'record') {
        void router.push(atPane(route.path, route.query, { kind: 'campaign', record: result.id }));
    } else if (result.kind === 'more') {
        handedQuery.value = result.query;
        void router.push(atPane(route.path, route.query, { kind: 'campaign', record: null }));
    } else if (result.kind === 'sector') {
        void router.push({ path: '/s/' + encodeURIComponent(result.sector), query: withQuery(route.query, {}) });
    } else {
        const command = commands().find((item) => item.id === result.id);
        if (command) command.run();
    }
    closePopup();
    inputEl.value?.blur();
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (open.value) closePopup();
        else inputEl.value?.blur();
        return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        if (!open.value) void search();
        if (!results.value.length) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = active.value < 0 && step < 0 ? results.value.length - 1 : active.value + step;
        active.value = (next + results.value.length) % results.value.length;
        action.value = 0;
        return;
    }
    // On a system row, Right and Left move between opening it and making a person or a place there.
    if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && open.value && withCampaign.value) {
        const current = results.value[active.value];
        if (!current || current.kind !== 'system') return;
        event.preventDefault();
        event.stopPropagation();
        action.value = (action.value + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        openResult(active.value < 0 ? 0 : active.value);
    }
}

watch(open, (value) => { emit('open', value); });

onMounted(() => {
    unregister = registerCommand({
        id: 'search',
        name: 'Search',
        keys: ['/', 'Ctrl+K'],
        run: () => { inputEl.value?.focus(); },
    });
});

onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
    if (controller) controller.abort();
    if (unregister) unregister();
});
</script>

<template>
  <div class="omni">
    <div class="omni-field">
      <Icon name="search" :size="22" />
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        role="combobox"
        :placeholder="picking ? 'Search for the system' : 'Search'"
        aria-label="Search"
        aria-autocomplete="list"
        :aria-expanded="open ? 'true' : 'false'"
        aria-controls="omni-list"
        :aria-activedescendant="open && active >= 0 ? 'omni-opt-' + active : undefined"
        autocomplete="off"
        spellcheck="false"
        @input="schedule"
        @focus="search"
        @keydown="onKeydown"
      >
      <span class="omni-reserve" aria-hidden="true"></span>
    </div>
    <div v-show="open" class="omni-popup">
      <p class="omni-note" role="status">{{ note }}</p>
      <div id="omni-list" role="listbox" aria-label="Search results">
        <template v-for="(result, index) in results" :key="result.kind + result.name + index">
          <div v-if="groupBefore(index)" class="omni-group" role="presentation">{{ groupBefore(index) }}</div>
          <div
            :id="'omni-opt-' + index"
            role="option"
            :class="{ 'is-mine': result.kind === 'record' || result.kind === 'more' }"
            :aria-selected="index === active ? 'true' : 'false'"
            @mousedown.prevent
            @click="action = 0; openResult(index)"
          >
            <span class="omni-line">
              <img v-if="result.kind === 'record' && result.thumb" class="omni-thumb" :src="result.thumb" alt="" loading="lazy">
              <strong>{{ result.name }}</strong>
              <span class="omni-kind">{{ result.kind === 'record' ? 'yours' : result.kind === 'more' ? 'list' : result.kind }}</span>
            </span>
            <span class="omni-detail">{{ result.detail }}</span>
            <span v-if="result.kind === 'system' && withCampaign" class="omni-new" aria-label="Make a record here">
              <button type="button" class="omni-new-btn" :class="{ 'is-on': index === active && action === 1 }" tabindex="-1" @mousedown.prevent @click.stop="makeHere(index, 'person')">
                <Icon name="plus" :size="10" />Person here
              </button>
              <button type="button" class="omni-new-btn" :class="{ 'is-on': index === active && action === 2 }" tabindex="-1" @mousedown.prevent @click.stop="makeHere(index, 'place')">
                <Icon name="plus" :size="10" />Place here
              </button>
            </span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style>
/*
 * The legacy omnibox (style.css #omni-search, .omni-search-field, #omni-search-popup): first
 * item of the chrome row, on the same left edge as the panel below it.
 */
.omni {
  position: absolute;
  top: var(--chrome-top);
  left: calc(var(--rail-width) + var(--chrome-inset));
  z-index: 4;
  width: min(440px, calc(100% - var(--rail-width) - 2 * var(--chrome-inset)));
  color: var(--text-1);
  font: 400 14px/1.4 var(--font-text);
  transition: left var(--t-rail) ease;
}

.omni-field {
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  height: var(--chrome-height);
  padding: 0 14px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-4);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  transition: border-color var(--t-fast) var(--ease-out);
}

.omni-field:focus-within {
  border-color: var(--signal);
}

.omni-field .ui-icon {
  color: var(--text-muted);
}

.omni-field input {
  flex: 1;
  min-width: 0;
  padding: 8px 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

.omni-field input::placeholder {
  color: var(--text-2);
  opacity: 1;
}

.omni-reserve {
  flex: none;
  width: var(--sp-2);
}

.omni-popup {
  margin-top: 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-4);
  background: var(--chrome-bg);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}

/* Nothing to list and nothing to say: no empty card. */
.omni-popup:not(:has([role="option"])):has(.omni-note:empty) {
  display: none;
}

.omni-note {
  margin: 0;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line-1);
  color: var(--text-muted);
  font-size: 12px;
}

.omni-note:empty {
  display: none;
}

#omni-list {
  max-height: min(460px, calc(100dvh - 150px));
  overflow-y: auto;
}

.omni-popup [role="option"] {
  display: grid;
  gap: 5px;
  padding: 12px 14px;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.omni-popup [role="option"]:hover,
.omni-popup [role="option"][aria-selected="true"] {
  background: var(--row-active);
  color: var(--signal-active);
}

/* On the selected row the muted second line would fall to 4.7:1; it takes the body colour. */
.omni-popup [role="option"]:hover .omni-kind,
.omni-popup [role="option"]:hover .omni-detail,
.omni-popup [role="option"][aria-selected="true"] .omni-kind,
.omni-popup [role="option"][aria-selected="true"] .omni-detail {
  color: var(--text-1);
}

/* Group labels between the campaign's rows and the chart's. */
.omni-group {
  padding: 8px 14px 2px;
  color: var(--text-muted);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.omni-group + [role="option"] {
  padding-top: 8px;
}

/* On a system row, signed in: make a person or a place there. Right and Left reach them. */
.omni-new {
  display: flex;
  gap: 6px;
}

.omni-new-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 2px 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--bg-2);
  color: var(--text-1);
  font: 600 11px/1.4 var(--font-text);
  cursor: pointer;
}

.omni-new-btn .ui-icon {
  color: var(--signal);
}

.omni-new-btn:hover,
.omni-new-btn.is-on {
  border-color: var(--signal);
  color: var(--signal);
}

.omni-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.omni-thumb {
  flex: 0 0 auto;
  align-self: center;
  width: 28px;
  height: 28px;
  margin: -4px 0;
  border: 1px solid var(--line-1);
  border-radius: var(--r-1);
  object-fit: cover;
  background: var(--bg-0);
}

.omni-line strong {
  min-width: 0;
  font-weight: 700;
}

.omni-kind {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.omni-detail {
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: var(--tabular);
}

@media (prefers-reduced-motion: reduce) {
  .omni,
  .omni-field {
    transition: none;
  }
}
</style>

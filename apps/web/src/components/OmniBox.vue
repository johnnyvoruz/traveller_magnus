<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { TruthManifest } from '@voyage/shared';
import {
    entryResults,
    groupOf,
    packageResults,
    rankResults,
    sectorMatches,
    systemResults,
    type OmniResult,
    type SearchItem,
} from '../search/omni.ts';
import { chartNow, ensureChart } from '../search/chart_hold.ts';
import { paletteOpen } from '../search/palette_state.ts';
import { recentResults, rememberRecent } from '../search/recent.ts';
import { onPageKeyDown } from '../platform/browser.ts';
import { atPane, withQuery } from '../shell/pane.ts';
import { keysWords } from '../shell/key_help.ts';
import { commands, handleKey, onCommandsChanged, registerCommand } from '../shell/registry.ts';
import { keptPackages } from '../workspace/market/catalogue_memory.ts';
import { session } from '../account/session.ts';
import { campaign } from '../campaign/store.ts';
import { createRecord } from '../workspace/actions.ts';
import { build } from '../workspace/build/state.ts';
import { handedQuery } from '../workspace/list_state.ts';
import { campaignMatches } from '../workspace/omni_campaign.ts';
import { offerSystem, picking } from '../workspace/pick.ts';
import { hexKeyOf, systemAnchor } from '../workspace/places.ts';
import Icon from '../design/Icon.vue';

const props = withDefaults(defineProps<{
    version: string;
    manifest: TruthManifest | null;
    layer?: 'canonical' | 'all';
    /** The one palette for the page. A design sample passes false and does not take keys. */
    live?: boolean;
}>(), { layer: 'canonical', live: true });

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
/** Keyboard shortcuts (DU13): `?` opens the sheet the registry fills. */
const KeyHelp = defineAsyncComponent(() => import('../workspace/KeyHelp.vue'));
const keysOpen = ref(false);
let unregisterKeys: (() => void) | null = null;
let stopKeys: (() => void) | null = null;
const cache = new Map<string, SearchItem[]>();
/** Rows at the front of an empty search that were opened earlier this session. */
const recentShown = ref(0);

/** Shown until the person types, after anything opened earlier this session. */
const EXAMPLES: OmniResult[] = [
    { kind: 'example', name: 'Regina', detail: 'A world' },
    { kind: 'example', name: 'Spinward Marches', detail: 'A sector' },
    { kind: 'example', name: 'Jewell subsector', detail: 'A subsector' },
];

/** Signed out, the rail shows these switched off. The palette lists only what can run. */
const SIGNED_OUT_HIDDEN = new Set(['campaign', 'build']);

function commandListed(command: { id: string; runnable?: () => boolean }): boolean {
    if (command.id === 'search') return false;
    if (session.user === null && SIGNED_OUT_HIDDEN.has(command.id)) return false;
    return command.runnable ? command.runnable() : true;
}

function commandResults(): OmniResult[] {
    const out: OmniResult[] = [];
    for (const command of commands()) {
        if (!commandListed(command)) continue;
        // The key beside the command (DU13), read from the registry like everything else here.
        const keys = keysWords(command.keys);
        out.push({ kind: 'command', name: command.name, detail: keys ? 'Command · ' + keys : 'Command', id: command.id });
    }
    return out;
}

/**
 * Re-reads every command while the palette can be open. `commands()` is a plain array, so the
 * stamp also reads the fields that register or unregister commands (the session, the campaign,
 * whether Build is on) and the route, which is what moves the one selected hex.
 */
const commandsTick = ref(0);

const commandStamp = computed(() => {
    const bits = [
        String(commandsTick.value),
        session.user ? '1' : '0',
        campaign.status,
        campaign.universeId ?? '',
        build.on ? '1' : '0',
        route.fullPath,
    ];
    for (const command of commands()) {
        if (command.id === 'search') continue;
        bits.push(command.id + (command.runnable ? (command.runnable() ? '1' : '0') : 'a'));
    }
    return bits.join('\n');
});

function remember(key: string, items: SearchItem[]): void {
    cache.delete(key);
    cache.set(key, items);
    while (cache.size > 20) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

async function loadSystems(text: string, version: string, signal: AbortSignal): Promise<SearchItem[]> {
    const key = version + '\n' + text;
    const cached = cache.get(key);
    if (cached) {
        remember(key, cached);
        return cached;
    }
    const url = '/api/truth/search?q=' + encodeURIComponent(text) + '&version=' + encodeURIComponent(version);
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
        const recent = recentResults();
        recentShown.value = recent.length;
        results.value = [...recent, ...EXAMPLES, ...localCommands];
        note.value = 'Try a world, a sector, or a subsector.';
        active.value = -1;
        open.value = true;
        return;
    }
    recentShown.value = 0;
    let version = props.version;
    let manifest = props.manifest;
    let failed = false;
    if (props.live && (!version || !manifest)) {
        try {
            await ensureChart();
            const held = chartNow();
            version = held.version || version;
            manifest = held.manifest ?? manifest;
        } catch {
            failed = true;
        }
    }
    const sectors = manifest ? sectorMatches(text, manifest, props.layer) : [];
    const ticket = ++generation;
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    let systems: OmniResult[] = [];
    if (version) {
        try {
            const items = await loadSystems(text, version, signal);
            if (manifest) systems = systemResults(items, manifest, props.layer);
        } catch {
            if (signal.aborted || ticket !== generation) return;
            failed = true;
        }
    } else if (!props.live) {
        failed = text.trim() !== '';
    }
    if (ticket !== generation) return;
    const worlds = rankResults(text, [...systems, ...sectors]);
    const mine: OmniResult[] = [];
    const entries: OmniResult[] = [];
    if (withCampaign.value) {
        const found = campaignMatches(text, campaign.records, undefined, campaign.universeId);
        mine.push(...found.items);
        if (found.total > found.items.length) mine.push({ kind: 'more', name: 'All ' + found.total + ' matches', detail: 'Open the list with this search', query: text });
        entries.push(...rankResults(text, entryResults(Object.values(campaign.journal), text)).slice(0, 5));
    }
    const commandHits = rankResults(text, localCommands);
    const packages = rankResults(text, packageResults(keptPackages())).slice(0, 5);
    const listed = [...worlds, ...mine, ...entries, ...commandHits, ...packages];
    results.value = listed;
    if (failed) note.value = 'Search is unavailable.';
    else if (listed.length === 0) note.value = 'No results match your search.';
    else note.value = '';
    active.value = -1;
    action.value = 0;
    open.value = true;
}

/** Worlds, then records, entries, commands and packages. Recent rows lead an empty field. */
function groupBefore(index: number): string {
    const result = results.value[index];
    if (!result) return '';
    const name = index < recentShown.value ? 'Recent' : groupOf(result);
    if (index === 0) return name;
    const previous = results.value[index - 1];
    if (!previous) return name;
    const before = index - 1 < recentShown.value ? 'Recent' : groupOf(previous);
    return name === before ? '' : name;
}

/** A chosen place drops the camera query, so the map flies to that place. */
function placeQuery(): Record<string, string> {
    return withQuery(route.query, { x: null, y: null, z: null });
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
    if (result.kind === 'example') {
        query.value = result.name;
        void search();
        return;
    }
    if (result.kind !== 'more' && result.kind !== 'command') rememberRecent(result);
    if (result.kind === 'system') {
        if (action.value === 1 || action.value === 2) {
            makeHere(index, action.value === 1 ? 'person' : 'place');
            return;
        }
        // A record's place is being picked: the system goes to it, and the map stays where it is.
        if (offerSystem({ slug: result.sector, hex: result.hex, name: result.name })) query.value = '';
        else void router.push({ path: '/s/' + encodeURIComponent(result.sector) + '/' + result.hex, query: placeQuery() });
    } else if (result.kind === 'record') {
        void router.push(atPane(route.path, route.query, { kind: 'campaign', record: result.id }));
    } else if (result.kind === 'entry') {
        void router.push(atPane(route.path, route.query, { kind: 'journal', entry: result.id }));
    } else if (result.kind === 'package') {
        void router.push({ path: '/packages/' + encodeURIComponent(result.id) });
    } else if (result.kind === 'more') {
        handedQuery.value = result.query;
        void router.push(atPane(route.path, route.query, { kind: 'campaign', record: null }));
    } else if (result.kind === 'sector') {
        void router.push({ path: '/s/' + encodeURIComponent(result.sector), query: placeQuery() });
    } else {
        const command = commands().find((item) => item.id === result.id);
        if (command && commandListed(command)) command.run();
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

watch(open, (value) => {
    emit('open', value);
    if (props.live) paletteOpen.value = value;
});

watch(commandStamp, () => {
    if (open.value) void search();
});

let stopCommands: (() => void) | null = null;

onMounted(() => {
    stopCommands = onCommandsChanged(() => { commandsTick.value += 1; });
    // The page listener is what Ctrl+K uses on screens that do not call handleKey themselves.
    if (!props.live) return;
    stopKeys = onPageKeyDown((event) => {
        if (event.defaultPrevented) return;
        handleKey(event);
    });
    unregister = registerCommand({
        id: 'search',
        name: 'Search',
        keys: ['/', 'Ctrl+K'],
        run: () => { inputEl.value?.focus(); },
    });
    unregisterKeys = registerCommand({
        id: 'keyboard-help',
        name: 'Keyboard shortcuts',
        keys: ['?'],
        run: () => { keysOpen.value = true; },
    });
});

onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
    if (controller) controller.abort();
    if (stopCommands) stopCommands();
    if (stopKeys) stopKeys();
    if (unregister) unregister();
    if (unregisterKeys) unregisterKeys();
    if (props.live) paletteOpen.value = false;
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
              <span class="omni-kind">{{ result.kind === 'record' ? 'yours' : result.kind === 'more' ? 'list' : result.kind === 'example' ? 'try' : result.kind }}</span>
            </span>
            <span class="omni-detail">
              <template v-if="'mark' in result && result.mark">{{ result.mark.before }}<mark class="omni-hit">{{ result.mark.word }}</mark>{{ result.mark.after }}</template>
              <template v-else>{{ result.detail }}</template>
            </span>
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
    <KeyHelp v-if="keysOpen" @close="keysOpen = false" />
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
  /* A field's edge is held to 3:1 (WCAG 1.4.11): --line-2 is 2.15:1 on this glass, --control-line 3.43:1. */
  border: 1px solid var(--control-line);
  border-radius: var(--r-4);
  background: var(--chrome-glass);
  /* The version videos' frame: a thin edge and a faint teal halo (design/base.css .ui-frame). */
  box-shadow: var(--shadow-chrome), 0 0 24px var(--frame-glow);
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
  box-shadow: var(--shadow-pop), 0 0 24px var(--frame-glow);
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

/* Group labels between the campaign's rows and the chart's: the videos' kickers (.ui-kicker), a size down. */
.omni-group {
  padding: 10px 14px 2px;
  color: var(--signal-dim);
  font: 700 12px/1.4 var(--font-display);
  letter-spacing: 0.3em;
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
  font: 700 10px/1.4 var(--font-display);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.omni-detail {
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: var(--tabular);
}

.omni-hit {
  color: var(--text-0);
  background: color-mix(in srgb, var(--signal) 28%, transparent);
  border-radius: var(--r-1);
}

/* The store's own bar starts at the top of the page. Leave the chrome row clear. */
.app:has(.mk-app) .mk-page {
  padding-top: calc(var(--chrome-top) + var(--chrome-height) + 8px);
}

@media (prefers-reduced-motion: reduce) {
  .omni,
  .omni-field {
    transition: none;
  }
}
</style>

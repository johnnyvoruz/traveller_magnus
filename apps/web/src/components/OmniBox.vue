<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { TruthManifest } from '@voyage/shared';
import {
    rankResults,
    sectorMatches,
    systemResults,
    type OmniResult,
    type SearchItem,
} from '../search/omni.ts';
import { commands, registerCommand } from '../shell/registry.ts';
import Icon from '../design/Icon.vue';

const props = withDefaults(defineProps<{
    version: string;
    manifest: TruthManifest | null;
    layer?: 'canonical' | 'all';
}>(), { layer: 'canonical' });

const emit = defineEmits<{ open: [open: boolean] }>();

const router = useRouter();
const inputEl = ref<HTMLInputElement | null>(null);
const query = ref('');
const open = ref(false);
const active = ref(-1);
const results = ref<OmniResult[]>([]);
const note = ref('');

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
        if (props.manifest) systems = systemResults(items, props.manifest);
    } catch {
        if (signal.aborted || ticket !== generation) return;
        failed = true;
    }
    if (ticket !== generation) return;
    note.value = failed ? 'Search is unavailable.' : '';
    results.value = rankResults(text, [...systems, ...sectors, ...localCommands]);
    active.value = -1;
    open.value = true;
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
        void router.push('/s/' + encodeURIComponent(result.sector) + '/' + result.hex);
    } else if (result.kind === 'sector') {
        void router.push('/s/' + encodeURIComponent(result.sector));
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
        placeholder="Search"
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
        <div
          v-for="(result, index) in results"
          :id="'omni-opt-' + index"
          :key="result.kind + result.name + index"
          role="option"
          :aria-selected="index === active ? 'true' : 'false'"
          @mousedown.prevent
          @click="openResult(index)"
        >
          <span class="omni-line">
            <strong>{{ result.name }}</strong>
            <span class="omni-kind">{{ result.kind }}</span>
          </span>
          <span class="omni-detail">{{ result.detail }}</span>
        </div>
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

.omni-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
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

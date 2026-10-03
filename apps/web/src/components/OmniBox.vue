<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
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

const props = withDefaults(defineProps<{
    version: string;
    manifest: TruthManifest | null;
    layer?: 'canonical' | 'all';
}>(), { layer: 'canonical' });

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
          <span class="omni-kind">{{ result.kind }}</span>
          <strong>{{ result.name }}</strong>
          <span class="omni-detail">{{ result.detail }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.omni {
  position: absolute;
  top: var(--sp-3);
  left: 50%;
  transform: translateX(-50%);
  width: min(32rem, calc(100% - var(--sp-8)));
  z-index: 2;
}
.omni-field {
  display: flex;
  align-items: stretch;
  background: var(--bg-1);
  border: 1px solid var(--line-2);
}
.omni-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font-family: var(--font-text);
  font-size: 14px;
  padding: var(--sp-2) var(--sp-3);
}
.omni-field input:focus {
  outline: 1px solid var(--signal);
  outline-offset: -1px;
}
.omni-reserve {
  width: var(--sp-8);
  flex: none;
}
.omni-popup {
  background: var(--bg-1);
  border: 1px solid var(--line-2);
  margin-top: var(--sp-1);
  max-height: 50vh;
  overflow: auto;
}
.omni-note {
  margin: 0;
  padding: var(--sp-2) var(--sp-3) 0;
  color: var(--text-muted);
  font-family: var(--font-text);
  font-size: 12px;
}
.omni-note:empty {
  display: none;
}
.omni-popup [role="option"] {
  display: flex;
  gap: var(--sp-2);
  align-items: baseline;
  padding: var(--sp-2) var(--sp-3);
  color: var(--text-1);
  font-family: var(--font-text);
  cursor: pointer;
}
.omni-popup [role="option"]:hover,
.omni-popup [role="option"][aria-selected="true"] {
  background: var(--surface-2);
}
.omni-kind {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
}
.omni-detail {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: 12px;
}
</style>

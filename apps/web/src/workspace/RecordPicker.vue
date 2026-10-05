<script setup lang="ts">
/**
 * Picks one record from the campaign (design §3: the record picker behind "Add a
 * connection" and "Aboard"): a search over the records held in memory and a list to choose
 * from. Down and Up move, Enter chooses, Esc gives up.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import type { CampaignRecord } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { pickRecords } from './links.ts';
import { placeLine, typeInfo } from './records.ts';

const props = withDefaults(defineProps<{
    /** The record the picker is for: never offered. */
    exclude: string;
    /** Only these types; all when empty. */
    types?: readonly string[];
    placeholder?: string;
    /** A line said when nothing can be offered. */
    none?: string;
}>(), { types: () => [], placeholder: 'Search your records', none: 'Nothing to choose from yet.' });

const emit = defineEmits<{ pick: [record: CampaignRecord]; cancel: [] }>();

const query = ref('');
const active = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const results = computed(() => pickRecords(campaign.records, query.value, {
    exclude: props.exclude,
    types: props.types.length ? props.types : undefined,
}));
const any = computed(() => pickRecords(campaign.records, '', { exclude: props.exclude, types: props.types.length ? props.types : undefined, cap: 1 }).length > 0);

function showActive(): void {
    void nextTick(() => {
        const el = listEl.value ? listEl.value.querySelector<HTMLElement>('[aria-selected="true"]') : null;
        if (el) el.scrollIntoView({ block: 'nearest' });
    });
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        emit('cancel');
        return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        const count = results.value.length;
        if (!count) return;
        active.value = (active.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
        showActive();
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        const chosen = results.value[active.value];
        if (chosen) emit('pick', chosen);
        return;
    }
    event.stopPropagation();
}

onMounted(() => { if (inputEl.value) inputEl.value.focus(); });
</script>

<template>
  <div class="picker">
    <label class="picker-field">
      <Icon name="search" :size="14" />
      <input
        ref="inputEl"
        v-model="query"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="picker-list"
        :aria-activedescendant="results.length ? 'picker-opt-' + active : undefined"
        :placeholder="placeholder"
        :aria-label="placeholder"
        autocomplete="off"
        @input="active = 0"
        @keydown="onKey"
      >
    </label>
    <div v-if="!any" class="picker-none">{{ none }}</div>
    <div v-else-if="!results.length" class="picker-none">No records match “{{ query }}”.</div>
    <div v-else id="picker-list" ref="listEl" class="picker-list" role="listbox" aria-label="Records">
      <div
        v-for="(record, index) in results"
        :id="'picker-opt-' + index"
        :key="record.id"
        role="option"
        class="picker-opt"
        :aria-selected="index === active ? 'true' : 'false'"
        @mousedown.prevent
        @mousemove="active = index"
        @click="emit('pick', record)"
      >
        <Icon :name="typeInfo(record.type).icon" :size="13" />
        <span class="picker-text">
          <b>{{ record.name }}</b>
          <small>{{ typeInfo(record.type).one }} · {{ placeLine(record, campaign.records) }}</small>
        </span>
      </div>
    </div>
  </div>
</template>

<style>
.picker-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-muted);
}

.picker-field:focus-within {
  border-color: var(--signal);
}

.picker-field input {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
}

.picker-field input::placeholder {
  color: var(--text-muted);
}

.picker-field input:focus-visible {
  outline: none;
}

.picker-none {
  margin: 8px 0 0;
  color: var(--text-muted);
  font: 400 13px/1.45 var(--font-text);
}

.picker-list {
  max-height: 232px;
  margin: 6px 0 0;
  overflow-y: auto;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--bg-1);
}

.picker-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  cursor: pointer;
}

.picker-opt + .picker-opt {
  border-top: 1px solid var(--line-soft);
}

.picker-opt .ui-icon {
  flex: 0 0 auto;
  color: var(--signal);
}

.picker-opt[aria-selected="true"] {
  background: var(--row-active);
}

.picker-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.picker-text b {
  color: var(--text-0);
  font: 600 13.5px/1.35 var(--font-text);
}

.picker-text small {
  color: var(--text-muted);
  font-size: 12px;
}

.picker-opt[aria-selected="true"] small {
  color: var(--text-1);
}
</style>

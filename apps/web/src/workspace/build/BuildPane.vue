<script setup lang="ts">
/**
 * What the pane shows in Build when the selection is not one system: an empty hex, a hex
 * the builder removed, or many hexes (findings/builder_system_design.md §1). One filled
 * button, and it never destroys.
 */
import { computed } from 'vue';
import Icon from '../../design/Icon.vue';
import { parseHexKey } from '../places.ts';
import { buildSettings, generateMany, hexName, hexState, previewAt, removeHexes, restorable, restoreHexes, stopBuild, tallyOf, truthAt } from './acts.ts';
import GenerateSheet from './GenerateSheet.vue';
import { build, choiceLine, plural, settingRows } from './state.ts';

const props = defineProps<{
    mode: 'empty' | 'removed' | 'many';
    /** The hexes acted on: one for empty and removed. */
    keys: string[];
    /** The panel's width: at half and full the list of many hexes stands beside the acts. */
    span?: 'column' | 'half' | 'full';
}>();

defineEmits<{ open: [hexKey: string] }>();

const one = computed(() => props.keys[0] || '');
const count = computed(() => tallyOf(props.keys));
const filled = computed(() => count.value.chart.length + count.value.yours.length);
const canRestore = computed(() => restorable(props.keys));
const chartRow = computed(() => (props.mode === 'removed' ? truthAt(one.value) : null));
const busy = computed(() => build.rolling !== '' || build.job !== null);
/** The list reads in hex order, whatever order the hexes were picked in. */
const rows = computed(() => [...props.keys].sort().slice(0, 200).map((key) => {
    const place = parseHexKey(key);
    const state = hexState(key);
    return { key, hex: place ? place.hex : key, state, name: state === 'empty' || state === 'removed' ? '' : hexName(key) };
}));

function names(keys: string[]): string {
    const shown = keys.slice(0, 4).map(hexName).join(', ');
    return keys.length > 4 ? shown + ' and ' + (keys.length - 4) + ' more' : shown;
}

function generate(): void {
    if (props.mode === 'many') generateMany(props.keys);
    else void previewAt(one.value);
}
</script>

<template>
  <div class="build-pane" :data-span="span" :data-mode="mode">
    <div v-if="build.job" class="build-prog" role="status">
      <div class="build-prog-line">
        <b>{{ build.job.label }}</b>
        <span>{{ build.job.done }} of {{ build.job.total }}<template v-if="build.job.failed.length"> · {{ build.job.failed.length }} failed</template></span>
        <button type="button" class="ui-btn" :disabled="build.job.state !== 'running'" @click="stopBuild()">{{ build.job.state === 'running' ? 'Stop' : 'Stopping…' }}<kbd class="build-key">X</kbd></button>
      </div>
      <div class="build-prog-bar"><i :style="{ width: (build.job.total ? 100 * build.job.done / build.job.total : 0) + '%' }"></i></div>
    </div>

    <GenerateSheet
      v-if="build.sheetOpen"
      :many="mode === 'many'"
      :empty="mode === 'many' ? count.empty.length : 1"
      :filled="mode === 'many' ? filled : 0"
      :settings="settingRows(buildSettings())"
      @go="generate"
      @cancel="build.sheetOpen = false"
    />

    <template v-else>
      <div class="build-main">
      <p v-if="mode === 'empty'" class="build-lead">Nothing is charted in this hex.</p>
      <p v-else-if="mode === 'removed'" class="build-lead">You removed {{ chartRow && chartRow.name ? chartRow.name : 'this system' }} from your map. The chart still holds it.</p>
      <ul v-else class="build-tally">
        <li><b>{{ count.empty.length }}</b>{{ count.empty.length === 1 ? 'empty hex' : 'empty hexes' }}</li>
        <li><b>{{ count.chart.length }}</b>{{ count.chart.length === 1 ? 'system as charted' : 'systems as charted' }}<em v-if="count.chart.length">{{ names(count.chart) }}</em></li>
        <li><b>{{ count.yours.length }}</b>{{ count.yours.length === 1 ? 'system of yours' : 'systems of yours' }}<em v-if="count.yours.length">{{ names(count.yours) }}</em></li>
        <li v-if="count.removed.length"><b>{{ count.removed.length }}</b>removed from your map</li>
      </ul>

      <div class="build-card">
        <div class="build-acts">
          <button
            v-if="mode === 'removed'"
            type="button"
            class="ui-btn is-primary build-big"
            data-build-first
            :disabled="busy"
            @click="restoreHexes(keys)"
          >
            <Icon name="rotate-left" :size="13" />Restore to the chart
          </button>
          <button
            v-if="mode !== 'many' || count.empty.length > 0"
            type="button"
            class="ui-btn build-big"
            :class="{ 'is-primary': mode !== 'removed' }"
            :data-build-first="mode !== 'removed' ? '' : undefined"
            :disabled="busy"
            :aria-busy="build.rolling ? 'true' : undefined"
            @click="generate"
          >
            <Icon name="wand-magic-sparkles" :size="13" />
            <template v-if="mode === 'many'">Generate the {{ plural(count.empty.length, 'empty hex', 'empty hexes') }}</template>
            <template v-else>{{ build.rolling ? 'Generating…' : 'Generate a system' }}</template>
            <kbd v-if="mode !== 'removed'" class="build-key">G</kbd>
          </button>
          <button v-if="mode === 'empty'" type="button" class="ui-btn build-big" disabled title="Next: with the system editor">
            <Icon name="plus" :size="13" />Blank system<span class="build-next">next</span>
          </button>
          <p v-if="mode === 'many' && count.empty.length === 0" class="build-fine">No hex here is empty.</p>
        </div>
        <p class="build-with">
          <Icon name="sliders" :size="12" />{{ choiceLine(build.choice) }} · this universe's settings ·
          <button type="button" class="build-link" :disabled="busy" @click="build.sheetOpen = true">Change…</button>
        </p>
        <p v-if="mode === 'removed' && chartRow" class="build-with">Chart: {{ chartRow.name || one }} · <code>{{ chartRow.uwp }}</code></p>
      </div>
      <p v-if="build.error" class="build-error" role="alert">{{ build.error }}</p>

      <div v-if="mode === 'many'" class="build-acts build-more">
        <button v-if="filled > 0" type="button" class="ui-btn" :disabled="busy" title="Choose the engine, then “Regenerate them too”" @click="build.sheetOpen = true">
          <Icon name="wand-magic-sparkles" :size="13" />Regenerate the {{ plural(filled, 'system', 'systems') }}…
        </button>
        <button v-if="canRestore.length > 0" type="button" class="ui-btn" :disabled="busy" @click="restoreHexes(keys)">
          <Icon name="rotate-left" :size="13" />Restore {{ canRestore.length }} to the chart
        </button>
        <button v-if="filled > 0" type="button" class="ui-btn is-danger" :disabled="busy" @click="removeHexes(keys)">
          <Icon name="trash" :size="13" />Remove the {{ plural(filled, 'system', 'systems') }}
        </button>
      </div>

      <p v-if="mode === 'empty'" class="build-fine">Generate shows the system first; nothing is kept until you say so.</p>
      <p v-else-if="mode === 'removed'" class="build-fine">A removed hex shows as a faint outline while Build is on, and not at all otherwise.</p>
      </div>
      <div v-if="mode === 'many'" class="build-side">
        <h3 class="ui-heading">Selected <span class="ui-count">{{ keys.length }}</span></h3>
        <ul class="build-list">
          <li v-for="row in rows" :key="row.key">
            <button type="button" @click="$emit('open', row.key)">
              <span class="ui-hex">{{ row.hex }}</span>
              <span class="build-list-name" :class="{ 'is-none': !row.name }">{{ row.name || (row.state === 'removed' ? 'Removed' : 'Empty') }}</span>
              <span v-if="row.state === 'truth'" class="build-tag is-chart">Chart</span>
              <span v-else-if="row.state === 'override' || row.state === 'own'" class="build-tag is-yours">Yours</span>
            </button>
          </li>
        </ul>
        <p v-if="keys.length > rows.length" class="build-fine">The first {{ rows.length }} of {{ keys.length }} are listed.</p>
      </div>
    </template>
  </div>
</template>

<style>
.build-pane {
  padding: 14px 16px 18px;
}

.build-pane > .ui-heading:first-child,
.build-sheet > .build-opts:first-child .ui-heading {
  margin-top: 0;
}

.build-lead {
  margin: 0;
  color: var(--text-1);
  font: 400 14.5px/1.5 var(--font-text);
}

.build-card {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.build-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.build-more {
  margin-top: 12px;
}

.build-big {
  min-height: 38px;
  padding: 0 14px;
  font-size: 14px;
}

.is-primary .build-key {
  border-color: color-mix(in srgb, var(--on-signal) 45%, transparent);
  color: var(--on-signal);
}

.build-next {
  margin-left: 2px;
  color: var(--text-muted);
  font: 700 10px/1.4 var(--font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ui-btn.is-danger {
  border-color: color-mix(in srgb, var(--danger) 60%, transparent);
  color: var(--danger);
}

.ui-btn.is-danger .ui-icon {
  color: var(--danger);
}

.build-with {
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.5;
}

.build-with .ui-icon {
  display: inline-block;
  margin-right: 6px;
  color: var(--signal);
  vertical-align: -1px;
}

.build-with code {
  font: 400 12px/1 var(--font-code);
  letter-spacing: 0.06em;
}

.build-link {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.build-link:disabled {
  opacity: 0.45;
  cursor: default;
}

.build-main > .build-fine {
  margin-top: 8px;
}

/* Half and full, many hexes: the count and the acts on the left, the list on the right. */
.build-pane[data-mode="many"]:is([data-span="half"], [data-span="full"]) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 24px;
  align-items: start;
}

.build-pane[data-mode="many"]:is([data-span="half"], [data-span="full"]) > :is(.build-prog, .build-sheet) {
  grid-column: 1 / -1;
}

.build-pane:is([data-span="half"], [data-span="full"]) .build-side > .ui-heading {
  margin-top: 0;
}

.build-error {
  margin: 10px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--danger);
  border-radius: var(--r-2);
  background: var(--panel-raised);
  color: var(--text-1);
  font-size: 13px;
}

.build-tally {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line-1);
  list-style: none;
}

.build-tally li {
  display: flex;
  white-space: nowrap;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 13.5px;
}

.build-tally b {
  min-width: 34px;
  color: var(--signal);
  font: 700 17px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: right;
}

.build-tally em {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.build-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  list-style: none;
}

.build-list li + li {
  border-top: 1px solid var(--line-soft);
}

.build-list button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  background: transparent;
  color: var(--text-0);
  font: 400 13.5px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.build-list button:hover {
  background: var(--row-active);
}

.build-list button:focus-visible {
  outline-offset: -2px;
}

.build-list-name {
  flex: 1 1 auto;
  min-width: 0;
}

.build-list-name.is-none {
  color: var(--text-muted);
}

.build-tag {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: var(--r-pill);
  font: 700 10px/1.4 var(--font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.build-tag.is-chart {
  background: var(--neutral-wash);
  color: var(--text-1);
}

.build-tag.is-yours {
  background: var(--wash);
  color: var(--signal);
}

.build-tag.is-preview {
  background: var(--attention);
  color: var(--on-signal);
}

.build-tag.is-removed {
  border: 1px dashed var(--text-faint);
  color: var(--text-muted);
}

/* The one thin bar: a title, a count the store gives, Stop. */
.build-prog {
  margin: -14px -16px 14px;
  padding: 9px 16px 11px;
  border-bottom: 1px solid var(--line-soft);
}

.build-prog-line {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.build-prog-line b {
  color: var(--text-0);
}

.build-prog-line span {
  margin-right: auto;
  color: var(--text-muted);
  font-variant-numeric: var(--tabular);
}

.build-prog-bar {
  height: 3px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: var(--r-pill);
  background: var(--scroll-track);
}

.build-prog-bar i {
  display: block;
  height: 100%;
  background: var(--signal);
  transition: width var(--t-fast) var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .build-prog-bar i {
    transition: none;
  }
}
</style>

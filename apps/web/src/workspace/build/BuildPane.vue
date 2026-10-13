<script setup lang="ts">
/**
 * What the pane shows in Build when the selection is not one system: an empty hex, a hex
 * the builder removed, or many hexes (findings/builder_system_design.md §1). One filled
 * button, and it never destroys.
 */
import { computed, nextTick, ref, watch } from 'vue';
import Icon from '../../design/Icon.vue';
import { parseHexKey } from '../places.ts';
import { buildSettings, hexName, hexState, placeWords, previewAt, removeHexes, restorable, restoreHexes, stopBuild, tallyOf, truthAt } from './acts.ts';
import { askDensity, runMany } from './density_ask.ts';
import DensityAsk from './DensityAsk.vue';
import { edit, openBlank } from './edit.ts';
import Spinner from '../../design/Spinner.vue';
import GenerateSheet from './GenerateSheet.vue';
import PublishForm from '../market/PublishForm.vue';
import { EMPTY_ALONE, marketUi } from '../market/market.ts';
import { generateGrowing, growUi } from './grow_acts.ts';
import { NAME_MAX, slotGroups, subsectorWords } from './sectors.ts';
import { build, choiceLine, JOB_HOLD, plural, settingRows } from './state.ts';

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
/** The job, or a stand-in of the same shape while none runs: the progress box keeps its size hidden. */
const shownJob = computed(() => build.job ?? { label: '', total: 0, done: 0, failed: [] as string[], state: 'running' as const, placed: undefined as string[] | undefined });
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

/** The empty slots the hexes reach into: generating there makes each slot's sector first (§18). */
const slots = computed(() => slotGroups(props.keys));
const inSlots = computed(() => slots.value.reduce((sum, group) => sum + group.count, 0));
const growLead = computed(() => {
    const sectors = slots.value.length === 1 ? 'a new sector' : slots.value.length + ' new sectors';
    if (props.keys.length === 1) return 'This hex is in an empty sector slot. Generating here creates ' + sectors + '.';
    const which = inSlots.value === props.keys.length ? 'These ' + props.keys.length + ' hexes are' : 'Of these ' + props.keys.length + ' hexes, ' + inSlots.value + ' are';
    return which + (slots.value.length === 1 ? ' in an empty sector slot' : ' in empty sector slots') + '. Generating here creates ' + sectors + '.';
});
const growBox = ref<HTMLElement | null>(null);

// A name is missing: the cursor goes to its box.
watch(() => [growUi.want, growUi.focus] as const, ([slug]) => {
    if (!slug) return;
    void nextTick(() => {
        const box = growBox.value ? growBox.value.querySelector<HTMLInputElement>('input[data-slot="' + slug + '"]') : null;
        if (box) box.focus();
    });
});

/** The pane's Generate: more than one hex asks how many to fill first; one hex generates as before. */
function generate(): void {
    if (props.keys.length > 1) askDensity(props.keys);
    else generateNow();
}

/** The full sheet has chosen the density already: it runs without asking again. */
function generateNow(): void {
    if (props.keys.length > 1) runMany(props.keys);
    else if (slots.value.length) generateGrowing(props.keys);
    else void previewAt(one.value);
}

/** The prompt's heading: what is selected ("80 empty hexes in Subsector C", "16 empty hexes in a new sector"). */
const askHeading = computed(() => {
    const empty = plural(count.value.empty.length, 'empty hex', 'empty hexes');
    if (slots.value.length) return empty + (slots.value.length === 1 ? ' in a new sector' : ' in ' + slots.value.length + ' new sectors');
    const place = placeWords(props.keys);
    return empty + (place ? ' in ' + place : '');
});
/** The prompt is open for these hexes. */
const asking = computed(() => {
    const keys = build.asking;
    if (!keys || keys.length !== props.keys.length) return false;
    const here = new Set(props.keys);
    return keys.every((key) => here.has(key));
});
</script>

<template>
  <div class="build-pane" :data-span="span" :data-mode="mode">
    <!-- A removed chart system goes in as a deleted hex; an empty hex alone has nothing to publish. -->
    <PublishForm v-if="marketUi.open && mode !== 'empty'" :keys="keys" />

    <GenerateSheet
      v-else-if="build.sheetOpen"
      :many="mode === 'many'"
      :empty="mode === 'many' ? count.empty.length : 1"
      :filled="mode === 'many' ? filled : 0"
      :settings="settingRows(buildSettings())"
      @go="generateNow"
      @cancel="build.sheetOpen = false"
    />

    <template v-else>
      <div class="build-main">
      <p v-if="mode === 'empty'" class="build-lead">This hex is empty.</p>
      <p v-else-if="mode === 'removed'" class="build-lead">You removed {{ chartRow && chartRow.name ? chartRow.name : 'this system' }} from your map. It’s still on the chart.</p>
      <ul v-else class="build-tally">
        <li><b>{{ count.empty.length }}</b>{{ count.empty.length === 1 ? 'empty hex' : 'empty hexes' }}</li>
        <li><b>{{ count.chart.length }}</b>{{ count.chart.length === 1 ? 'system as charted' : 'systems as charted' }}<em v-if="count.chart.length">{{ names(count.chart) }}</em></li>
        <li><b>{{ count.yours.length }}</b>{{ count.yours.length === 1 ? 'system of yours' : 'systems of yours' }}<em v-if="count.yours.length">{{ names(count.yours) }}</em></li>
        <li v-if="count.removed.length"><b>{{ count.removed.length }}</b>removed from your map</li>
      </ul>

      <div v-if="slots.length" ref="growBox" class="build-grow" role="group" aria-label="New sectors">
        <p class="build-grow-lead">{{ growLead }}</p>
        <label v-for="group in slots" :key="group.slug" class="build-grow-name">
          <span>{{ slots.length === 1 ? 'Name of the new sector' : 'Name of the sector for ' + group.count + (group.count === 1 ? ' hex' : ' hexes') }}</span>
          <input
            v-model="growUi.names[group.slug]"
            class="build-grow-box"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :maxlength="NAME_MAX"
            placeholder="Sector name"
            :data-slot="group.slug"
            :disabled="growUi.busy || busy"
            @keydown.enter.prevent="generate"
          />
          <small>{{ subsectorWords(group.letters) }}. The sector has 16 subsectors. To name a subsector after the sector is created, select the subsector, and then select Rename (F2).</small>
        </label>
      </div>

      <!-- More than one hex: how many to fill is asked here, in place of the card, before anything runs. -->
      <DensityAsk v-if="asking" :heading="askHeading" />
      <div v-else class="build-card">
        <div class="build-acts">
          <button
            v-if="mode === 'removed'"
            type="button"
            class="ui-btn is-primary build-big"
            data-build-first
            :disabled="busy"
            :title="build.job ? JOB_HOLD : undefined"
            @click="restoreHexes(keys)"
          >
            <Icon name="rotate-left" :size="13" />Restore to the chart
          </button>
          <button
            v-if="mode !== 'many' || count.empty.length > 0"
            type="button"
            class="ui-btn build-big"
            :class="{ 'is-primary': mode !== 'removed', 'is-grow': slots.length > 0 }"
            data-command="build-generate"
            :data-build-first="mode !== 'removed' ? '' : undefined"
            :disabled="busy"
            :title="build.job ? JOB_HOLD : undefined"
            :aria-busy="build.rolling || build.job || growUi.busy ? 'true' : undefined"
            @click="generate"
          >
            <Spinner v-if="build.rolling || build.job || growUi.busy" />
            <Icon v-else name="wand-magic-sparkles" :size="13" />
            <!-- Many hexes: the ellipsis says a choice follows (how many to fill); the count is in the prompt's heading. -->
            <template v-if="slots.length">{{ growUi.busy ? 'Creating…' : (slots.length === 1 ? 'Create the sector and generate' : 'Create ' + slots.length + ' sectors and generate') + (keys.length > 1 ? '…' : ' a system') }}</template>
            <template v-else-if="mode === 'many'">Generate…</template>
            <template v-else>{{ build.rolling ? 'Generating…' : 'Generate a system' }}</template>
            <kbd v-if="mode !== 'removed'" class="build-key">G</kbd>
          </button>
          <button
            v-if="mode === 'empty' && !slots.length"
            type="button"
            class="ui-btn build-big"
            data-command="build-blank"
            :disabled="busy || edit.opening"
            :aria-busy="edit.opening ? 'true' : undefined"
            :title="build.job ? JOB_HOLD : 'Creates an empty system and opens it in the designer. It has no stars or worlds, and nothing is rolled'"
            @click="openBlank(one)"
          >
            <Icon name="plus" :size="13" />{{ edit.opening ? 'Creating…' : 'Blank system' }}
          </button>
          <p v-if="mode === 'many' && count.empty.length === 0" class="build-fine">None of the selected hexes are empty.</p>
        </div>
        <!--
          Under the Generate button, the settings line and the job's progress share one place: the taller of the two sets
          its height, so nothing moves when a job starts or ends, and the tally above stays in view.
        -->
        <div class="build-slot">
          <p class="build-with" :class="{ 'is-hidden': build.job }" :aria-hidden="build.job ? 'true' : undefined">
            <Icon name="sliders" :size="12" />{{ choiceLine(build.choice) }} · this universe's settings ·
            <button type="button" class="build-link" :disabled="busy" @click="build.sheetOpen = true">Change…</button>
          </p>
          <div class="build-prog" :class="{ 'is-hidden': !build.job }" :role="build.job ? 'status' : undefined" :aria-hidden="build.job ? undefined : 'true'" :data-build-job="build.job ? '' : undefined">
            <div class="build-prog-line">
              <Spinner :size="14" />
              <!-- The server reports in steps of up to 32, and counts the hexes it leaves empty as checked: hexes checked, then systems so far. -->
              <b>{{ shownJob.done }} of {{ shownJob.total }}<template v-if="shownJob.placed"> hexes checked</template></b>
              <span><template v-if="shownJob.placed">{{ plural(shownJob.placed.length, 'system', 'systems') }} so far · </template><template v-if="shownJob.failed.length">{{ shownJob.failed.length }} failed · </template>{{ shownJob.state === 'running' ? 'generating' : 'stopping' }}</span>
              <button v-if="growUi.undoRunning" type="button" class="ui-btn" data-grow-undo title="Stops the job and removes the new sectors and every system generated in them" @click="growUi.undoRunning()">Undo</button>
              <button type="button" class="ui-btn" :disabled="shownJob.state !== 'running'" @click="stopBuild()">{{ shownJob.state === 'running' ? 'Stop' : 'Stopping…' }}<kbd class="build-key">X</kbd></button>
            </div>
            <div class="build-prog-bar"><i :style="{ width: (shownJob.total ? 100 * shownJob.done / shownJob.total : 0) + '%' }"></i></div>
          </div>
        </div>
        <p v-if="mode === 'removed' && chartRow" class="build-with">Chart: {{ chartRow.name || one }} · <code>{{ chartRow.uwp }}</code></p>
      </div>
      <p v-if="growUi.error && slots.length" class="build-error" role="alert">{{ growUi.error }}</p>
      <p v-if="build.error" class="build-error" role="alert">{{ build.error }}</p>
      <p v-else-if="mode === 'empty' && edit.error && edit.hexKey === one" class="build-error" role="alert">{{ edit.error }}</p>

      <div v-if="mode === 'many'" class="build-acts build-more">
        <button v-if="filled > 0" type="button" class="ui-btn" :disabled="busy" :title="build.job ? JOB_HOLD : 'Choose an engine, and then select “Regenerate them too”'" @click="build.sheetOpen = true">
          <Icon name="wand-magic-sparkles" :size="13" />Regenerate the {{ plural(filled, 'system', 'systems') }}…
        </button>
        <button v-if="canRestore.length > 0" type="button" class="ui-btn" :disabled="busy" :title="build.job ? JOB_HOLD : undefined" @click="restoreHexes(keys)">
          <Icon name="rotate-left" :size="13" />Restore {{ canRestore.length }} to the chart
        </button>
        <button v-if="filled > 0" type="button" class="ui-btn is-danger" :disabled="busy" :title="build.job ? JOB_HOLD : undefined" @click="removeHexes(keys)">
          <Icon name="trash" :size="13" />Remove the {{ plural(filled, 'system', 'systems') }}
        </button>
      </div>

      <p v-if="slots.length" class="build-fine">These systems are saved as they are generated, with no preview. To remove the new {{ slots.length === 1 ? 'sector and its systems' : 'sectors and their systems' }}, select Undo. Undo also works while the job is running.</p>
      <p v-else-if="mode === 'empty'" class="build-fine">Generate a system shows a preview first. The system is saved only when you select Keep. Blank system saves an empty system right away and opens it in the designer, where you add each body yourself. {{ EMPTY_ALONE }}</p>
      <p v-else-if="mode === 'removed'" class="build-fine">While Build is on, a removed hex shows as a faint outline. When Build is off, the hex doesn’t show.</p>
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
        <p v-if="keys.length > rows.length" class="build-fine">Showing the first {{ rows.length }} of {{ keys.length }} hexes.</p>
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

/* Hexes in an empty slot: what generating there will make, and the new sector's name. */
.build-grow {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.build-grow-lead {
  margin: 0;
  padding: 8px 10px;
  border-left: 3px solid var(--attention);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 13.5px/1.5 var(--font-text);
}

.build-grow-name {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.build-grow-box {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  margin: 0;
  padding: 0 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.2 var(--font-text);
}

.build-grow-name small {
  font-size: 12px;
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

/* The act that makes a sector says so in full: at column width it wraps rather than run past the pane. */
.build-big.is-grow {
  max-width: 100%;
  height: auto;
  padding-block: 8px;
  white-space: normal;
  text-align: left;
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

.build-pane[data-mode="many"]:is([data-span="half"], [data-span="full"]) > :is(.build-sheet, .mk-form) {
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
.build-pane {
  position: relative;
}

/* A button at work is not dimmed like one that can't be used: its spinner must read. */
.build-big[aria-busy="true"]:disabled {
  opacity: 1;
  cursor: progress;
}

/* One place, two contents: the hidden one still takes its room, so the slot's height never changes. */
.build-slot {
  display: grid;
}

.build-slot > * {
  grid-area: 1 / 1;
  min-width: 0;
}

.build-slot > .is-hidden {
  visibility: hidden;
}

.build-prog {
  margin-top: 10px;
}

.build-prog-line {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--signal);
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

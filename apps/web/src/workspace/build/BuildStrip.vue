<script setup lang="ts">
/**
 * The build strip on the map while Build is on: which universe is being built, the Select
 * hexes switch, and how many are selected (findings/builder_system_design.md §1). It stands
 * at the top right: the legacy place, right of the search field, holds the campaign date.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import { observeSize, storageGet, storageSet } from '../../platform/browser.ts';
import { hexName, stopBuild, tallyOf } from './acts.ts';
import BuildSpin from './BuildSpin.vue';
import { build, jobLine, SELECTION_CAP, YOURS_KEY, YOURS_NOTE } from './state.ts';

defineProps<{ name: string; truthVersion: string | null }>();
const emit = defineEmits<{ clear: []; width: [px: number] }>();

const root = ref<HTMLElement | null>(null);
/** The selection, counted: how many, how many of them are empty, and whether the cap is reached (§18 item 9). */
const count = computed(() => {
    const keys = build.selection;
    if (keys.length < 2) return null;
    return { n: keys.length.toLocaleString('en'), empty: tallyOf(keys).empty.length, full: keys.length >= SELECTION_CAP };
});
/** What is being generated, in words: "Generating 80 hexes · 12 of 80", or "Generating a system in 0101". */
const inFlight = computed(() => {
    if (build.job) return jobLine(build.job);
    if (build.rolling) return 'Generating a system in ' + hexName(build.rolling);
    return '';
});
const told = ref(storageGet(YOURS_KEY) === '1');
function putAway(): void {
    told.value = true;
    storageSet(YOURS_KEY, '1');
}
let stop: (() => void) | null = null;

onMounted(() => {
    const el = root.value;
    if (el) stop = observeSize(el, () => { emit('width', el.offsetWidth); });
    if (el) emit('width', el.offsetWidth);
});

onBeforeUnmount(() => {
    if (stop) stop();
    emit('width', 0);
});
</script>

<template>
  <div ref="root" class="build-strip" role="group" aria-label="Build">
    <span class="build-strip-who">
      <small>Building</small>
      <b>{{ name }}<em> · {{ truthVersion ? 'on the chart, ' + truthVersion : 'your own map' }}</em></b>
    </span>
    <button
      type="button"
      class="ui-btn"
      data-command="build-select"
      :aria-pressed="build.selecting ? 'true' : 'false'"
      title="Select hexes (S). While this is on, drag to draw a selection box. Shift+drag works at any time"
      @click="build.selecting = !build.selecting"
    >
      <Icon name="table-cells" :size="13" />Select hexes<kbd class="build-key">S</kbd>
    </button>
    <span v-if="build.selecting" class="build-strip-say" role="status">Drag to select · Alt+drag to deselect · Space+drag to move the map · Esc to finish</span>
    <span v-if="count" class="build-strip-tally" role="status">
      <b>{{ count.n }}</b> hexes<template v-if="count.full"> · selection limit reached</template><template v-else> · {{ count.empty }} empty</template>
    </span>
    <button v-if="count" type="button" class="ui-btn build-strip-count" title="Clear the selection (Esc)" @click="$emit('clear')">
      Clear<Icon name="xmark" :size="12" />
    </button>
    <!-- Generation in flight, under the strip whether the pane is open or not. It hangs below: the strip never changes size. -->
    <div v-if="inFlight" class="build-strip-job" role="status" data-build-job>
      <BuildSpin :size="14" />
      <span>{{ inFlight }}</span>
      <button v-if="build.job" type="button" class="ui-btn" :disabled="build.job.state !== 'running'" @click="stopBuild()">{{ build.job.state === 'running' ? 'Stop' : 'Stopping…' }}<kbd class="build-key">X</kbd></button>
    </div>
    <!-- Whose map this is: said once, the first time Build is on, until it is put away. -->
    <div v-else-if="!told" class="build-strip-note" role="note" data-build-yours>
      <p>{{ YOURS_NOTE }}</p>
      <button type="button" class="ui-btn" @click="putAway()">Got it</button>
    </div>
  </div>
</template>

<style>
.build-strip {
  position: absolute;
  top: var(--chrome-top);
  right: var(--chrome-inset);
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  max-width: calc(100% - var(--rail-width) - 2 * var(--chrome-inset));
  height: var(--chrome-height);
  padding: 0 8px 0 14px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-4);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  white-space: nowrap;
}

.build-strip-who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-right: 6px;
  line-height: 1.25;
}

.build-strip-who small {
  color: var(--signal);
  font: 700 10px/1.3 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.build-strip-who b {
  overflow: hidden;
  color: var(--text-0);
  font: 700 13.5px/1.25 var(--font-text);
  text-overflow: ellipsis;
}

.build-strip-who em {
  color: var(--text-muted);
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
}

.build-strip .ui-btn[aria-pressed="true"] {
  border-color: var(--signal);
  background: var(--row-active);
  color: var(--signal);
}

.build-strip-say,
.build-strip-tally {
  overflow: hidden;
  color: var(--text-muted);
  font: 400 12.5px/1.3 var(--font-text);
  text-overflow: ellipsis;
}

.build-strip-job {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  max-width: 100%;
  min-height: 36px;
  padding: 4px 6px 4px 12px;
  border: 1px solid var(--signal);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  color: var(--signal);
}

.build-strip-note {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  box-sizing: border-box;
  width: min(380px, 100%);
  padding: 10px 10px 10px 14px;
  border: 1px solid var(--control-line);
  border-left: 3px solid var(--signal);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  white-space: normal;
}

.build-strip-note p {
  margin: 0;
  color: var(--text-0);
  font: 400 13px/1.45 var(--font-text);
}

.build-strip-note .ui-btn {
  flex: none;
  padding: 3px 9px;
  font-size: 12px;
}

.build-strip-job span {
  overflow: hidden;
  color: var(--text-0);
  font: 600 12.5px/1.3 var(--font-text);
  font-variant-numeric: var(--tabular);
  text-overflow: ellipsis;
}

.build-strip-job .ui-btn {
  padding: 3px 8px;
  font-size: 12px;
}

.build-strip-tally b {
  color: var(--signal);
  font: 700 12.5px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
}

/* A narrow window: the universe's name gives way; the controls stay whole. */
@media (max-width: 900px) {
  .build-strip {
    top: calc(var(--chrome-top) + var(--chrome-height) + 6px);
    right: auto;
    left: calc(var(--rail-width) + var(--chrome-inset));
    z-index: 2;
  }

  .build-strip-who em {
    display: none;
  }

  /* The words for the tool give way first: the switch itself says it is on. */
  .build-strip-say {
    display: none;
  }
}
</style>

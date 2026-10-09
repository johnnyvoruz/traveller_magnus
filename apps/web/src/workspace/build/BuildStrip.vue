<script setup lang="ts">
/**
 * The build strip on the map while Build is on: which universe is being built, the Select
 * hexes switch, and how many are selected (findings/builder_system_design.md §1). It stands
 * at the top right: the legacy place, right of the search field, holds the campaign date.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import { observeSize } from '../../platform/browser.ts';
import { build } from './state.ts';

defineProps<{ name: string; truthVersion: string | null }>();
const emit = defineEmits<{ clear: []; width: [px: number] }>();

const root = ref<HTMLElement | null>(null);
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
      title="Select hexes: drag a box on the chart (S). Shift+drag does the same at any time."
      @click="build.selecting = !build.selecting"
    >
      <Icon name="table-cells" :size="13" />Select hexes<kbd class="build-key">S</kbd>
    </button>
    <button v-if="build.selection.length > 1" type="button" class="ui-btn build-strip-count" title="Clear the selection (Esc)" @click="$emit('clear')">
      <b>{{ build.selection.length }}</b>selected<Icon name="xmark" :size="12" />
    </button>
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

.build-strip-count b {
  color: var(--signal);
  font: 700 12px/1 var(--font-code);
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
}
</style>

<script setup lang="ts">
/**
 * The bar of build acts under the dossier's head when one system is selected, and while a
 * preview is shown (findings/builder_system_design.md §1, §2, §4). Edit has its place and
 * waits for the next step.
 */
import { computed, nextTick, ref, watch } from 'vue';
import Icon from '../../design/Icon.vue';
import { hexState, keepPreview, discardPreview, overChart, removeHexes, restorable, restoreHexes, rollAgain } from './acts.ts';
import BuildMenu, { type MenuItem } from './BuildMenu.vue';
import type { Rect } from '../pop_place.ts';
import { build } from './state.ts';

const props = defineProps<{ hexKey: string; name: string }>();

const preview = computed(() => (build.preview && build.preview.hexKey === props.hexKey ? build.preview : null));
const state = computed(() => hexState(props.hexKey));
const busy = computed(() => build.rolling !== '' || build.job !== null);
const more = ref<HTMLButtonElement | null>(null);
const keep = ref<HTMLButtonElement | null>(null);
const anchor = ref<Rect | null>(null);

const items = computed((): MenuItem[] => {
    const out: MenuItem[] = [];
    if (restorable([props.hexKey]).length) {
        out.push({ id: 'restore', label: 'Restore to the chart', say: 'Drops your changes; the chart’s system returns', icon: 'rotate-left' });
    }
    out.push({
        id: 'remove',
        label: overChart([props.hexKey]) ? 'Remove from my map' : 'Remove',
        say: overChart([props.hexKey]) ? 'The hex is empty on your map; the chart is untouched' : 'The hex is empty again',
        icon: 'trash',
        key: 'Del',
        danger: true,
    });
    return out;
});

function openMore(): void {
    const el = more.value;
    if (!el) return;
    const box = el.getBoundingClientRect();
    anchor.value = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

function closeMore(): void {
    anchor.value = null;
    if (more.value) more.value.focus();
}

function pick(id: string): void {
    anchor.value = null;
    if (id === 'restore') void restoreHexes([props.hexKey]);
    else if (id === 'remove') void removeHexes([props.hexKey]);
}

// A preview has arrived: Keep takes focus, so Enter keeps it and Tab reaches the others.
watch(() => (preview.value ? preview.value.roll : -1), (roll) => {
    if (roll >= 0) void nextTick(() => { if (keep.value) keep.value.focus(); });
}, { immediate: true });
</script>

<template>
  <div class="build-bar">
    <template v-if="preview">
      <button ref="keep" type="button" class="ui-btn is-primary" :disabled="busy" @click="keepPreview()"><Icon name="check" :size="13" />Keep<kbd class="build-key">K</kbd></button>
      <button type="button" class="ui-btn" :disabled="busy" :aria-busy="build.rolling ? 'true' : undefined" @click="rollAgain()">
        <Icon name="wand-magic-sparkles" :size="13" />{{ build.rolling ? 'Rolling…' : 'Roll again' }}<kbd class="build-key">R</kbd>
      </button>
      <span class="build-bar-gap"></span>
      <button type="button" class="ui-btn" @click="discardPreview()">Discard</button>
    </template>
    <template v-else>
      <button type="button" class="ui-btn" disabled title="Editing a system in place is the next step">
        <Icon name="pen-to-square" :size="13" />Edit<span class="build-next">next</span>
      </button>
      <button
        ref="more"
        type="button"
        class="ui-btn is-icon"
        aria-label="More build acts"
        title="More"
        aria-haspopup="true"
        :aria-expanded="anchor ? 'true' : 'false'"
        :disabled="busy"
        @click="openMore"
      >
        <Icon name="ellipsis-vertical" :size="13" />
      </button>
      <span class="build-bar-gap"></span>
      <span class="build-bar-state">
        <span v-if="state === 'truth'" class="build-tag is-chart">Chart</span>
        <span v-else class="build-tag is-yours">Yours</span>
        <span class="build-bar-word">{{ state === 'truth' ? 'as charted' : state === 'override' && overChart([hexKey]) ? 'in place of the chart’s' : 'made here' }}</span>
      </span>
    </template>
    <BuildMenu v-if="anchor" :title="name" :items="items" :anchor="anchor" @pick="pick" @close="closeMore" />
  </div>
</template>

<style>
.build-bar {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.build-bar-gap {
  flex: 1 1 auto;
}

.build-bar-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.build-bar-word {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

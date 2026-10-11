<script setup lang="ts">
/**
 * The bar of build acts under the dossier's head when one system is selected, and while a
 * preview is shown (findings/builder_system_design.md §1, §2, §4). With a draft open it is
 * the draft's bar: how many changes, Discard, Keep, always in view while the form scrolls.
 */
import { computed, nextTick, ref, watch, watchEffect } from 'vue';
import Icon from '../../design/Icon.vue';
import { hexState, keepPreview, discardPreview, overChart, previewAt, removeHexes, restorable, restoreHexes, rollAgain } from './acts.ts';
import BuildMenu, { type MenuItem } from './BuildMenu.vue';
import type { Rect } from '../pop_place.ts';
import { changeLine, discardEdit, edit, editing, holdLeaving, keepEdit, openEdit, draftHandle } from './edit.ts';
import { askDesign, handMode } from './hand_acts.ts';
import { handChangeCount, handUi } from './hand.ts';
import { build, plural } from './state.ts';

const props = defineProps<{ hexKey: string; name: string }>();

const preview = computed(() => (build.preview && build.preview.hexKey === props.hexKey ? build.preview : null));
const state = computed(() => hexState(props.hexKey));
const busy = computed(() => build.rolling !== '' || build.job !== null);
const more = ref<HTMLButtonElement | null>(null);
const keep = ref<HTMLButtonElement | null>(null);
const anchor = ref<Rect | null>(null);
const drafting = computed(() => editing(props.hexKey));
const opening = computed(() => edit.opening && edit.hexKey === props.hexKey);
const dirty = computed(() => drafting.value && draftHandle.value !== null && draftHandle.value.dirty.value);
/** By hand, a move is one change though it renumbers many rows. */
const line = computed(() => {
    if (!draftHandle.value) return '';
    if (edit.mode === 'hand') return plural(handChangeCount(edit.mine, edit.added.map((item) => item.id)), 'change', 'changes');
    return changeLine(edit.mine, edit.rolled, draftHandle.value.messages.value);
});
const held = computed(() => draftHandle.value !== null && draftHandle.value.messages.value.some((item) => item.holds));
/**
 * Whether this system is designed by hand. Read as soon as the bar shows, not when the menu
 * opens: an item that changed under the pointer would take the menu's focus with it.
 */
const mode = computed(() => handMode(props.hexKey));
watchEffect(() => { void mode.value; });
/** Any system can be edited: one as charted becomes yours when the draft is kept. */
const editable = computed(() => state.value === 'truth' || state.value === 'override' || state.value === 'own');

/** Discard asks first when there is something to lose; with nothing changed it just closes. */
function discard(): void {
    if (!holdLeaving(() => { /* the editor is already closed */ }, false)) discardEdit();
}

const items = computed((): MenuItem[] => {
    const out: MenuItem[] = [];
    if (restorable([props.hexKey]).length) {
        out.push({ id: 'restore', label: 'Restore to the chart', say: 'Drops your changes; the chart’s system returns', icon: 'rotate-left' });
    }
    // Hand and generated go both ways: a generated system offers the designer, a system by hand offers Generate.
    // One item under one id, so the menu keeps its place and its focus whichever it says; none until the server has said which.
    if (mode.value === 'hand') out.push({ id: 'other-way', label: 'Generate a system', say: 'A preview first; keeping it replaces the system designed by hand', icon: 'wand-magic-sparkles', key: 'G' });
    else if (mode.value === 'generated') out.push({ id: 'other-way', label: 'Design by hand…', say: 'Every body yours to type and arrange; the engine stops running for this system', icon: 'draw-polygon' });
    out.push({
        id: 'remove',
        label: overChart([props.hexKey]) ? 'Remove from my map' : 'Remove',
        say: overChart([props.hexKey]) ? 'The hex is empty on your map; the chart is untouched' : 'The hex is empty again',
        icon: 'trash',
        key: 'Del',
        danger: true,
        rule: true,
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
    else if (id === 'other-way') void (mode.value === 'hand' ? previewAt(props.hexKey) : askDesign(props.hexKey, props.name));
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
    <template v-else-if="drafting">
      <span class="build-tag is-preview">Draft</span>
      <span class="build-bar-word" role="status">{{ dirty ? line : 'no changes yet' }}</span>
      <span v-if="edit.mode === 'hand'" class="build-tag is-yours" title="Designed by hand: the engine does not roll this system">By hand</span>
      <span class="build-bar-gap"></span>
      <button type="button" class="ui-btn" data-command="build-draft-discard" :disabled="edit.keeping" @click="discard()">{{ dirty ? 'Discard' : 'Close' }}</button>
      <button
        type="button"
        class="ui-btn is-primary"
        data-command="build-draft-keep"
        :disabled="!dirty || edit.keeping || held || handUi.removing !== null"
        :aria-busy="edit.keeping ? 'true' : undefined"
        :title="held ? 'The engine could not build this system: see its message' : handUi.removing ? 'Answer the question about the remove first' : 'Keep (Ctrl+Enter)'"
        @click="keepEdit()"
      >
        <Icon name="check" :size="13" />{{ edit.keeping ? 'Keeping…' : 'Keep' }}<kbd class="build-key">Ctrl+Enter</kbd>
      </button>
    </template>
    <template v-else>
      <button
        type="button"
        class="ui-btn"
        :class="{ 'is-primary': editable }"
        data-command="build-edit"
        :disabled="!editable || opening || busy"
        :aria-busy="opening ? 'true' : undefined"
        :title="state === 'truth' ? 'Edit this system (E). Keeping the draft makes it yours; the chart is untouched' : 'Edit this system (E)'"
        @click="openEdit(hexKey, name)"
      >
        <Icon name="pen-to-square" :size="13" />{{ opening ? 'Opening…' : 'Edit' }}<kbd v-if="editable" class="build-key">E</kbd>
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
  white-space: nowrap;
}

/* A narrow window: the key hints go, so the count, Discard and Keep stay whole. */
@media (max-width: 600px) {
  .build-bar .build-key {
    display: none;
  }
}
</style>

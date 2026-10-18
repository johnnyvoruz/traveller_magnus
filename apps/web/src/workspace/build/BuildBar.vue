<script setup lang="ts">
/**
 * The bar of build acts under the dossier's head when one system is selected, and while a
 * preview is shown (findings/builder_system_design.md §1, §2, §4). With a draft open it is
 * the draft's bar: how many changes, Discard, Keep, always in view while the form scrolls.
 */
import { computed, nextTick, ref, watch, watchEffect } from 'vue';
import Icon from '../../design/Icon.vue';
import { allowanceFor, hexState, keepPreview, discardPreview, overChart, previewAt, removeHexes, restorable, restoreHexes, rollAgain } from './acts.ts';
import BuildMenu, { type MenuItem } from './BuildMenu.vue';
import Spinner from '../../design/Spinner.vue';
import type { Rect } from '../pop_place.ts';
import { changeLine, discardEdit, edit, editing, holdLeaving, keepEdit, openEdit, draftHandle } from './edit.ts';
import { askDesign, handMode } from './hand_acts.ts';
import { handChangeCount, handUi } from './hand.ts';
import { build, JOB_HOLD, plural } from './state.ts';
import { commands } from '../../shell/registry.ts';

const props = defineProps<{ hexKey: string; name: string }>();

const preview = computed(() => (build.preview && build.preview.hexKey === props.hexKey ? build.preview : null));
const state = computed(() => hexState(props.hexKey));
const busy = computed(() => build.rolling !== '' || build.job !== null);
/** Roll again is a new generated system: the daily allowance by it, and the server's refusal in the same place. */
const rollSay = computed(() => (preview.value ? allowanceFor([preview.value.hexKey]) : null));
const rollHeld = computed(() => !!rollSay.value && rollSay.value.blocked);
const rollWord = computed(() => (preview.value && build.error ? build.error : rollSay.value ? rollSay.value.text : ''));
const more = ref<HTMLButtonElement | null>(null);
const keep = ref<HTMLButtonElement | null>(null);
const anchor = ref<Rect | null>(null);
const drafting = computed(() => editing(props.hexKey));
const opening = computed(() => edit.opening && edit.hexKey === props.hexKey);
const dirty = computed(() => drafting.value && draftHandle.value !== null && draftHandle.value.dirty.value);
/** By hand, a move is one change though it renumbers many rows. */
const line = computed(() => {
    if (!draftHandle.value) return '';
    if (edit.mode === 'hand') return plural(handChangeCount(edit.mine, edit.added.map((item) => item.id), edit.rolled), 'change', 'changes');
    return changeLine(edit.mine, edit.rolled, draftHandle.value.messages.value);
});
const held = computed(() => draftHandle.value !== null && draftHandle.value.messages.value.some((item) => item.holds));
/** Why Keep waits: a value the server refused is said at its field; anything else is the engine's word in the form. */
const heldWhy = computed(() => {
    const handle = draftHandle.value;
    const ids = new Set(handle ? handle.form.value.sections.flatMap((section) => section.fields.map((field) => field.id)) : []);
    const atField = handle !== null && handle.messages.value.some((item) => item.holds && item.id !== null && ids.has(item.id));
    return atField
        ? 'To keep the draft, first correct the value the server refused. Its sentence is under that field'
        : 'This system could not be built. To find out why, read the message in the form';
});
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
        out.push({ id: 'restore', label: 'Restore to the chart', say: 'Removes your changes and shows the chart’s system again', icon: 'rotate-left' });
    }
    // Hand and generated go both ways: a generated system offers the designer, a system by hand offers Generate.
    // One item under one id, so the menu keeps its place and its focus whichever it says; none until the server has said which.
    if (mode.value === 'hand') out.push({ id: 'other-way', label: 'Generate a system', say: 'Shows a preview. If you select Keep, it replaces the system designed by hand', icon: 'wand-magic-sparkles', key: 'G' });
    else if (mode.value === 'generated') out.push({ id: 'other-way', label: 'Design by hand…', say: 'You type and arrange every body. Building stops for this system', icon: 'draw-polygon' });
    out.push({
        id: 'remove',
        label: 'Remove',
        say: overChart([props.hexKey]) ? 'Empties the hex on your map. The chart doesn’t change' : 'Empties the hex',
        icon: 'trash',
        key: 'Del',
        danger: true,
        rule: true,
    });
    // What is selected, not this hex: the palette's command knows the selection.
    if (publishCommand.value) out.push({ id: 'publish', label: 'Publish selection…', say: publishSay.value, icon: 'store', rule: true });
    return out;
});

const publishSay = computed(() => {
    if (build.selection.length > 1) return 'Shares the selected hexes and their records as a package';
    return state.value === 'removed' ? 'Shares this hex as a deleted hex in a package' : 'Shares this system and its records as a package';
});
const publishCommand = computed(() => { void build.selection.length; const found = commands().find((item) => item.id === 'build-publish'); return found && (!found.runnable || found.runnable()) ? found : null; });

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
    else if (id === 'publish') { if (publishCommand.value) publishCommand.value.run(); }
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
      <button type="button" class="ui-btn" :disabled="busy || rollHeld" :title="rollHeld && rollSay ? rollSay.text : undefined" :aria-busy="build.rolling ? 'true' : undefined" @click="rollAgain()">
        <Spinner v-if="build.rolling" /><Icon v-else name="wand-magic-sparkles" :size="13" />{{ build.rolling ? 'Rolling…' : 'Roll again' }}<kbd class="build-key">R</kbd>
      </button>
      <span v-if="rollWord" class="build-bar-word build-bar-allowance" :class="{ 'is-held': rollHeld || !!build.error }" :title="rollWord" :role="build.error ? 'alert' : 'status'" data-build-allowance>{{ rollWord }}</span>
      <span class="build-bar-gap"></span>
      <button type="button" class="ui-btn" @click="discardPreview()">Discard</button>
    </template>
    <template v-else-if="drafting">
      <span class="build-tag is-preview">Draft</span>
      <span class="build-bar-word" role="status">{{ dirty ? line : 'no changes yet' }}</span>
      <span v-if="edit.mode === 'hand'" class="build-tag is-yours" title="Designed by hand. Building does not generate this system">By hand</span>
      <span class="build-bar-gap"></span>
      <button type="button" class="ui-btn" data-command="build-draft-discard" :disabled="edit.keeping" @click="discard()">{{ dirty ? 'Discard' : 'Close' }}</button>
      <button
        type="button"
        class="ui-btn is-primary"
        data-command="build-draft-keep"
        :disabled="!dirty || edit.keeping || held || handUi.removing !== null"
        :aria-busy="edit.keeping ? 'true' : undefined"
        :title="held ? heldWhy : handUi.removing ? 'To keep the draft, first select Remove or Cancel in the remove question' : 'Keep (Ctrl+Enter)'"
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
        :title="build.job ? JOB_HOLD : state === 'truth' ? 'Edit this system (E). When you keep your changes, the system becomes yours. The chart doesn’t change' : 'Edit this system (E)'"
        @click="openEdit(hexKey, name)"
      >
        <Icon name="pen-to-square" :size="13" />{{ opening ? 'Opening…' : 'Edit' }}<kbd v-if="editable" class="build-key">E</kbd>
      </button>
      <button
        ref="more"
        type="button"
        class="ui-btn is-icon"
        aria-label="More build actions"
        aria-haspopup="true"
        :aria-expanded="anchor ? 'true' : 'false'"
        :disabled="busy"
        :title="build.job ? JOB_HOLD : 'More'"
        @click="openMore"
      >
        <Icon name="ellipsis-vertical" :size="13" />
      </button>
      <span class="build-bar-gap"></span>
      <span class="build-bar-state">
        <span v-if="state === 'truth'" class="build-tag is-chart">Chart</span>
        <span v-else class="build-tag is-yours">Yours</span>
        <span class="build-bar-word">{{ state === 'truth' ? 'as charted' : state === 'override' && overChart([hexKey]) ? 'replaces the chart’s system' : 'made here' }}</span>
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

/* The allowance by Roll again: muted while some is left; a sentence that holds Roll again wraps, so it's read whole. */
.build-bar-allowance {
  min-width: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.build-bar-allowance.is-held {
  color: var(--text-0);
  white-space: normal;
  line-height: 1.35;
}

/* A narrow window: the key hints go, so the count, Discard and Keep stay whole. */
@media (max-width: 600px) {
  .build-bar .build-key {
    display: none;
  }
}
</style>

<script setup lang="ts">
/**
 * One box of a sheet, built for two people in it at once (the bar is a shared
 * spreadsheet): **a change is one box**, committed when the box is left or Enter is
 * pressed in a one-line box; a value that arrives from outside lands in a box nobody is
 * in, with a brief mark; **the box being typed in keeps its text, its caret and its
 * focus** (the element's text is written only by sheet_fields.ts's box rule, never by a
 * re-render). A box someone else is in is marked with their name, in a place that takes no
 * room. It knows nothing of where the value is kept.
 */
import { onMounted, ref, watch } from 'vue';
import { boxEntered, boxGiven, boxLeft, boxOf, boxTyped, type BoxState } from './sheet_fields.ts';

const props = defineProps<{
    /** The PDF's name for the box: its accessible name unless `label` is given, and what its events name. */
    name: string;
    kind: 'text' | 'checkbox';
    value: string | boolean;
    /** plain: a text well; tag: the rust value tag; tall: several lines. */
    look?: 'plain' | 'tag' | 'tall';
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    /** Someone else is in this box: their name, and the colour token that is theirs. */
    holder?: { name: string; tone: string } | null;
    /** The id a label points at. */
    boxId?: string;
}>();

const emit = defineEmits<{
    /** The box was committed with a new value. */
    commit: [name: string, value: string | boolean];
    enter: [name: string];
    leave: [name: string];
}>();

const el = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
/** Counts the values that arrived from outside: each one restarts the mark. */
const arrived = ref(0);
let state: BoxState = boxOf(typeof props.value === 'string' ? props.value : '');

function write(): void {
    const box = el.value;
    if (box && props.kind === 'text' && box.value !== state.shown) box.value = state.shown;
}

onMounted(() => {
    if (el.value && props.kind === 'checkbox') (el.value as HTMLInputElement).checked = props.value === true;
    write();
});

watch(() => props.value, (given) => {
    if (props.kind === 'checkbox') {
        const box = el.value as HTMLInputElement | null;
        if (box && box.checked !== (given === true)) {
            box.checked = given === true;
            arrived.value += 1;
        }
        return;
    }
    const next = boxGiven(state, typeof given === 'string' ? given : '');
    state = next.state;
    if (next.changed) {
        write();
        arrived.value += 1;
    }
});

function onFocus(): void {
    state = boxEntered(state);
    emit('enter', props.name);
}

function onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) state = boxTyped(state, target.value);
}

function onBlur(): void {
    const left = boxLeft(state, typeof props.value === 'string' ? props.value : '');
    state = left.state;
    write();
    if (left.commit !== null) emit('commit', props.name, left.commit);
    emit('leave', props.name);
}

function onTick(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) emit('commit', props.name, target.checked);
}

/** Enter in a one-line box commits it and leaves it; every other key is the box's own. */
function onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        event.target.blur();
        return;
    }
    event.stopPropagation();
}
</script>

<template>
  <span
    class="sbox"
    :class="['is-' + (kind === 'checkbox' ? 'tick' : look ?? 'plain'), { 'is-held': holder, 'is-arrived': arrived > 0 }]"
    :style="holder ? { '--sbox-holder': 'var(' + holder.tone + ')' } : undefined"
    :data-arrived="arrived"
  >
    <input
      v-if="kind === 'checkbox'"
      :id="boxId"
      ref="el"
      type="checkbox"
      class="sheet-tick"
      :aria-label="label ?? name"
      :title="label ?? name"
      :disabled="disabled"
      @change="onTick"
      @focus="emit('enter', name)"
      @blur="emit('leave', name)"
      @keydown.stop
    >
    <textarea
      v-else-if="look === 'tall'"
      :id="boxId"
      ref="el"
      class="sheet-input is-tall"
      rows="4"
      :aria-label="label ?? name"
      :placeholder="placeholder"
      :disabled="disabled"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKey"
    ></textarea>
    <input
      v-else
      :id="boxId"
      ref="el"
      type="text"
      class="sheet-input"
      :class="{ 'is-tag': look === 'tag' }"
      :aria-label="label ?? name"
      :title="label ?? name"
      :placeholder="placeholder"
      :disabled="disabled"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKey"
    >
    <!-- The mark's key restarts its animation for each arrival. -->
    <i v-if="arrived > 0" :key="arrived" class="sbox-flash" aria-hidden="true"></i>
    <span v-if="holder" class="sbox-holder" :title="holder.name + ' is in this box'"><span class="sbox-sr">In use by </span>{{ holder.name }}</span>
  </span>
</template>

<style>
/* The box's own frame: it takes exactly the room of the box, and the marks stand on it without moving anything. */
.sbox {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}

.sbox.is-tick {
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
}

.sbox.is-tag {
  flex: 0 1 150px;
}

/* A value arrived from outside: a ring that fades, once. */
.sbox-flash {
  position: absolute;
  inset: -2px;
  border: 2px solid var(--signal);
  border-radius: var(--r-1);
  opacity: 0;
  pointer-events: none;
  animation: sbox-arrived var(--t-slow, var(--t-base)) var(--ease-out) 1;
}

@keyframes sbox-arrived {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Someone else is in this box: a dashed ring in their colour and their name on its top edge. The name says it; the colour only helps. */
.sbox.is-held::after {
  position: absolute;
  inset: -2px;
  border: 2px dashed var(--sbox-holder, var(--attention));
  border-radius: var(--r-1);
  content: '';
  pointer-events: none;
}

.sbox-holder {
  position: absolute;
  top: -11px;
  right: 4px;
  z-index: 2;
  max-width: calc(100% - 8px);
  padding: 0 5px;
  overflow: hidden;
  /* The name is light on the well whatever the person's colour is; the colour is its edge. */
  border: 1px solid var(--sbox-holder, var(--attention));
  border-radius: var(--r-1);
  background: var(--bg-2);
  color: var(--text-0);
  font: 700 12px/1.3 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.sbox-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

@media (prefers-reduced-motion: reduce) {
  .sbox-flash {
    animation: none;
  }
}
</style>

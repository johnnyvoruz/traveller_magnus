<script setup lang="ts">
/**
 * The dossier had only title attributes. Those show on hover, and not on a keyboard
 * or a touch. This is the rail's lock sentence: the words sit in the page, on hover,
 * on focus, and after a tap. The pop does not change the row's height.
 */
import { computed, onBeforeUnmount, ref, useId } from 'vue';

const props = withDefaults(defineProps<{
    text: string;
    /** Inside a button the term is not a second tab stop. The button carries the sentence. */
    quiet?: boolean;
    /** Show the sentence while a parent control, such as the row button, has focus. */
    force?: boolean;
    code?: string;
    /** A tile already reads as a control, so it keeps the note without the dotted underline. */
    bare?: boolean;
}>(), { quiet: false, force: false, code: '', bare: false });

const root = ref<HTMLElement | null>(null);
const hover = ref(false);
const focused = ref(false);
const pinned = ref(false);
const open = computed(() => props.force || hover.value || focused.value || pinned.value);
const tipId = useId();
let swallowClick = false;
let removeOutside: (() => void) | null = null;

function clearOutside(): void {
    removeOutside?.();
    removeOutside = null;
}

function armOutside(): void {
    clearOutside();
    const onPointer = (event: PointerEvent) => {
        const el = root.value;
        if (el && event.target instanceof Node && el.contains(event.target)) return;
        pinned.value = false;
        clearOutside();
    };
    document.addEventListener('pointerdown', onPointer, true);
    removeOutside = () => document.removeEventListener('pointerdown', onPointer, true);
}

function onPointerUp(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    swallowClick = true;
    pinned.value = !pinned.value;
    if (pinned.value) armOutside();
    else clearOutside();
}

function onClick(event: MouseEvent): void {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
}

function onBlur(): void {
    focused.value = false;
}

onBeforeUnmount(clearOutside);
</script>

<template>
  <span
    ref="root"
    class="doss-note"
    :class="{ 'is-open': open, 'is-pinned': pinned }"
    :data-code="code || undefined"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
  >
    <span
      class="doss-note-term"
      :class="{ 'doss-note-underline': !props.bare }"
      :tabindex="props.quiet ? undefined : 0"
      :aria-describedby="open ? tipId : undefined"
      @focus="focused = true"
      @blur="onBlur"
      @pointerup="onPointerUp"
      @click="onClick"
    ><slot /></span>
    <span :id="tipId" class="doss-note-pop" role="tooltip" :aria-hidden="open ? undefined : 'true'">{{ text }}</span>
  </span>
</template>

<style>
.doss-note {
  position: relative;
  display: inline;
}

.doss-note-term {
  text-decoration: none;
  cursor: help;
}

.doss-note-underline {
  text-decoration: underline dotted;
  text-decoration-color: var(--text-muted);
  text-underline-offset: 2px;
}

.doss-note-term:focus-visible {
  outline: 2px solid var(--signal);
  outline-offset: 2px;
}

.doss-note-pop {
  position: absolute;
  z-index: 8;
  left: 0;
  top: calc(100% + 4px);
  display: none;
  width: max-content;
  max-width: 260px;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--chrome-bg);
  color: var(--text-1);
  font: 400 12px/1.4 var(--font-text);
  text-align: left;
  text-transform: none;
  letter-spacing: 0;
  white-space: normal;
  box-shadow: var(--shadow-pop);
  cursor: auto;
}

.doss-note.is-open > .doss-note-pop {
  display: block;
}

.doss-code .doss-note-pop,
.doss-value .doss-note-pop,
.doss-row-uwp .doss-note-pop {
  left: auto;
  right: 0;
}
</style>

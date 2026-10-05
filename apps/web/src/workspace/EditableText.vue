<script setup lang="ts">
/**
 * A field edited where it stands (design §3): it reads as text until it is clicked or Enter
 * is pressed on it, then it is a field with the same words. Enter saves a single line,
 * Ctrl+Enter saves a paragraph, leaving the field saves, Esc puts the old words back.
 */
import { nextTick, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
    value: string;
    /** What the field is, for a screen reader and for the empty prompt. */
    label: string;
    /** Shown, muted, while there is nothing in it. */
    prompt?: string;
    /** A paragraph: Enter is a new line. */
    multiline?: boolean;
    max: number;
    /** The record's name: larger, and never left empty. */
    title?: boolean;
    disabled?: boolean;
}>(), { prompt: '', multiline: false, title: false, disabled: false });

const emit = defineEmits<{ save: [text: string] }>();

const editing = ref(false);
const draft = ref('');
const field = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const view = ref<HTMLButtonElement | null>(null);
let leaving = false;

function grow(): void {
    const el = field.value;
    if (!el || !props.multiline) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
}

/** Opens the field. `select` marks all of it, so typing replaces it. */
function edit(select = false): void {
    if (props.disabled || editing.value) return;
    draft.value = props.value;
    editing.value = true;
    void nextTick(() => {
        const el = field.value;
        if (!el) return;
        el.focus();
        if (select) el.select();
        else el.setSelectionRange(el.value.length, el.value.length);
        grow();
    });
}

function close(refocus: boolean): void {
    editing.value = false;
    if (refocus) void nextTick(() => { if (view.value) view.value.focus(); });
}

function save(refocus: boolean): void {
    if (!editing.value || leaving) return;
    leaving = true;
    const text = draft.value;
    close(refocus);
    if (text !== props.value) emit('save', text);
    leaving = false;
}

function cancel(): void {
    leaving = true;
    close(true);
    leaving = false;
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        // The panel's own Esc must not also run.
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
    }
    if (event.key === 'Enter' && (!props.multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        save(true);
        return;
    }
    // Keys typed into the field are the field's: the map's shortcuts must not see them.
    event.stopPropagation();
}

watch(() => props.value, () => {
    // The record changed under an open field (a conflict, another tab): the new words win.
    if (editing.value && !leaving) draft.value = props.value;
});

defineExpose({ edit });
</script>

<template>
  <div class="edit" :class="{ 'is-title': title, 'is-editing': editing, 'is-multiline': multiline }">
    <template v-if="editing">
      <textarea
        v-if="multiline"
        ref="field"
        v-model="draft"
        class="edit-field"
        rows="3"
        :maxlength="max"
        :aria-label="label"
        @input="grow"
        @keydown="onKey"
        @blur="save(false)"
      ></textarea>
      <input
        v-else
        ref="field"
        v-model="draft"
        class="edit-field"
        type="text"
        :maxlength="max"
        :aria-label="label"
        @keydown="onKey"
        @blur="save(false)"
      >
      <p class="edit-hint">
        <span>{{ multiline ? 'Ctrl+Enter saves · Esc puts it back' : 'Enter saves · Esc puts it back' }}</span>
        <span v-if="draft.length > max * 0.8" class="edit-count">{{ draft.length }} / {{ max }}</span>
      </p>
    </template>
    <button
      v-else
      ref="view"
      type="button"
      class="edit-view"
      :class="{ 'is-empty': !value }"
      :disabled="disabled"
      :aria-label="value ? label + ': ' + value + '. Edit' : prompt || 'Add ' + label.toLowerCase()"
      @click="edit(false)"
    >{{ value || prompt }}</button>
  </div>
</template>

<style>
.edit {
  min-width: 0;
}

/* The text as text: a faint outline on hover and focus says it can be changed. */
.edit-view {
  display: block;
  box-sizing: border-box;
  width: calc(100% + 16px);
  margin: 0 -8px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 400 14.5px/1.5 var(--font-text);
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.edit-view:not(:disabled):hover,
.edit-view:focus-visible {
  border-color: var(--line-2);
  background: var(--panel-raised);
}

.edit-view:focus-visible {
  outline-offset: 1px;
}

.edit-view.is-empty {
  color: var(--text-muted);
}

.edit-view:disabled {
  cursor: default;
}

.edit-field {
  display: block;
  box-sizing: border-box;
  width: calc(100% + 16px);
  margin: 0 -8px;
  padding: 5px 8px;
  border: 1px solid var(--signal);
  border-radius: var(--r-2);
  background: var(--bg-2);
  box-shadow: 0 0 0 2px var(--signal-glow);
  color: var(--text-0);
  font: 400 14.5px/1.5 var(--font-text);
  resize: none;
  overflow: hidden;
}

.edit-field:focus-visible {
  outline: none;
}

.edit.is-title .edit-view,
.edit.is-title .edit-field {
  color: var(--text-0);
  font: 700 22px/1.25 var(--font-text);
  letter-spacing: -0.2px;
}

.edit-hint {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 5px 0 0;
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-text);
}

.edit-count {
  font-variant-numeric: var(--tabular);
}

@media (prefers-reduced-motion: reduce) {
  .edit-view {
    transition: none;
  }
}
</style>

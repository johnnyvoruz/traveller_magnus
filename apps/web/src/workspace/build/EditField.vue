<script setup lang="ts">
/**
 * One field of the edit form (packages/shared `FormField`): a box, a list, a switch or plain
 * words, by its kind and its permission. A value the referee may type is a control; the
 * engine's own value is a control with "Roll again" beside it, and says "Locked" once typed
 * over; a value that may only be read is words. Teal marks the referee's change, amber the
 * engine's, with the engine's words and any message beneath.
 */
import { computed, ref, watch } from 'vue';
import type { FormField, FormMessage, FormValue } from '@voyage/shared';
import Icon from '../../design/Icon.vue';
import { numberValue, type FieldMark } from './edit.ts';

const props = defineProps<{
    field: FormField;
    mark: FieldMark;
    /** The value the field had when the draft was opened; shown struck through beside a change. */
    was: FormValue | undefined;
    /** Typed over by the referee: an engine's value that will be kept as typed. */
    locked: boolean;
    why: string;
    messages: FormMessage[];
    /** A compact cell (the mainworld's profile): the label under the control. */
    cell?: boolean;
    busy?: boolean;
    /** Goes up when the form was replaced under the referee: the box drops what was being typed and shows the form's value. */
    resync?: number;
}>();

const emit = defineEmits<{ set: [value: FormValue]; roll: [] }>();

const inputId = computed(() => 'ef-' + props.field.id.replace(/[^a-z0-9]+/gi, '-'));
const readOnly = computed(() => props.field.permission === 'read');
const focused = ref(false);
/** What is in the box while it is being typed in: the server's answer does not overwrite it mid-word. */
const text = ref('');

function said(value: FormValue | undefined): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (props.field.kind === 'choice') {
        const option = props.field.options.find((item) => item.value === String(value));
        if (option) return option.label;
    }
    return String(value);
}

watch(() => props.field.value, (value) => { if (!focused.value) text.value = value === null ? '' : String(value); }, { immediate: true });
watch(() => props.resync, () => { text.value = props.field.value === null ? '' : String(props.field.value); });

/** The list's options, with the present value added when the list does not hold it, so it is never lost by opening the list. */
const options = computed(() => {
    const now = props.field.value === null ? '' : String(props.field.value);
    const held = props.field.options.some((item) => item.value === now);
    // A value typed before the list existed is kept, and said to be outside it; an empty one is "Not set".
    return held ? props.field.options : [{ value: now, label: now ? now + ' (not in the list)' : 'Not set' }, ...props.field.options];
});

function onText(event: Event): void {
    text.value = (event.target as HTMLInputElement).value;
    emit('set', props.field.kind === 'number' ? numberValue(text.value) : text.value);
}

function onBlur(): void {
    focused.value = false;
    text.value = props.field.value === null ? '' : String(props.field.value);
}

const whyLines = computed(() => props.why.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== ''));
const whyRest = computed(() => whyLines.value.slice(1).join('\n'));
const changed = computed(() => props.mark !== 'none' && props.was !== undefined && props.was !== props.field.value);
</script>

<template>
  <div class="ef" :class="['is-' + mark, { 'is-cell': cell, 'is-read': readOnly, 'is-switch': field.kind === 'switch' }]" :data-field="field.id">
    <label v-if="field.kind !== 'switch'" class="ef-label" :for="readOnly ? undefined : inputId">
      <i v-if="mark !== 'none'" class="ef-dot" aria-hidden="true"></i>{{ field.label }}
    </label>
    <div class="ef-control">
      <span v-if="readOnly" class="ef-words">{{ said(field.value) || '—' }}</span>
      <button
        v-else-if="field.kind === 'switch'"
        :id="inputId"
        type="button"
        class="ef-toggle"
        role="switch"
        :aria-checked="field.value === true ? 'true' : 'false'"
        @click="$emit('set', field.value !== true)"
      >
        <i aria-hidden="true"></i><span>{{ field.label }}</span>
      </button>
      <select v-else-if="field.kind === 'choice'" :id="inputId" class="ef-box" :value="field.value === null ? '' : String(field.value)" @change="$emit('set', ($event.target as HTMLSelectElement).value)">
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <input
        v-else
        :id="inputId"
        class="ef-box"
        :class="{ 'is-number': field.kind === 'number' }"
        type="text"
        :inputmode="field.kind === 'number' ? 'decimal' : undefined"
        autocomplete="off"
        spellcheck="false"
        :value="text"
        @focus="focused = true"
        @blur="onBlur"
        @input="onText"
      />
      <span v-if="field.permission === 'roll' && locked" class="ef-locked" title="You typed this value, so rolling the system again doesn’t change it">Locked</span>
      <button
        v-if="field.permission === 'roll'"
        type="button"
        class="ui-btn is-icon ef-roll"
        :disabled="busy"
        :aria-label="'Roll ' + field.label + ' again'"
        :title="locked ? 'Roll again. The engine replaces the value you typed' : 'Roll again'"
        @click="$emit('roll')"
      >
        <Icon name="wand-magic-sparkles" :size="12" />
      </button>
    </div>
    <p v-if="changed" class="ef-was">was <s>{{ said(was) || 'empty' }}</s></p>
    <!-- The engine's own words. A long trace is folded to its first line, so one change does not bury the form. -->
    <p v-if="why && whyLines.length <= 3" class="ef-why">{{ why }}</p>
    <details v-else-if="why" class="ef-why is-long">
      <summary>{{ whyLines[0] }}<em>and {{ whyLines.length - 1 }} more lines from the engine</em></summary>
      <p>{{ whyRest }}</p>
    </details>
    <p v-for="(message, index) in messages" :key="index" class="ef-message" :class="{ 'is-hold': message.holds }" role="status">{{ message.text }}</p>
  </div>
</template>

<style>
/* A row: the label at the left, the control at the right; what is said about it underneath, full width. */
.ef {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
  gap: 2px 12px;
  align-items: center;
  padding: 6px 0 7px;
  border-bottom: 1px solid var(--line-soft);
}

.ef-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.ef-dot {
  flex: 0 0 6px;
  width: 6px;
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--signal);
}

.ef.is-engine .ef-dot {
  background: var(--attention);
}

.ef-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.ef.is-switch .ef-control {
  grid-column: 1 / -1;
  justify-content: flex-start;
}

.ef-box {
  box-sizing: border-box;
  width: 220px;
  max-width: 100%;
  height: 32px;
  margin: 0;
  padding: 0 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 13.5px/1.2 var(--font-text);
}

.ef-box.is-number {
  width: 128px;
  font-family: var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: right;
}

select.ef-box {
  width: auto;
  min-width: 96px;
  max-width: 220px;
  padding-right: 4px;
}

.ef.is-mine .ef-box {
  border-color: var(--signal);
}

.ef.is-engine .ef-box {
  border-color: var(--attention);
}

.ef-words {
  color: var(--text-1);
  font: 400 13.5px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
  text-align: right;
  overflow-wrap: anywhere;
}

.ef.is-engine .ef-words {
  color: var(--attention);
}

.ef-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 3px 0;
  border: 0;
  background: none;
  color: var(--text-1);
  font: 400 13px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.ef-toggle i {
  position: relative;
  flex: 0 0 28px;
  width: 28px;
  height: 16px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-pill);
  background: var(--bg-2);
}

.ef-toggle i::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--text-muted);
  transition: left var(--t-fast) var(--ease-out);
}

.ef-toggle[aria-checked="true"] i {
  border-color: var(--signal);
  background: var(--row-active);
}

.ef-toggle[aria-checked="true"] i::after {
  left: 14px;
  background: var(--signal);
}

.ef.is-mine .ef-toggle span {
  color: var(--signal);
}

.ef-locked {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-pill);
  color: var(--signal);
  font: 700 10px/1.5 var(--font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ef-roll {
  flex: 0 0 auto;
}

.ef-was,
.ef-why,
.ef-message {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

.ef-why {
  padding: 4px 8px;
  border-left: 2px solid var(--attention);
  background: var(--bg-2);
  color: var(--text-1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ef-why.is-long > summary {
  cursor: pointer;
}

.ef-why.is-long em {
  display: block;
  color: var(--text-muted);
  font-style: normal;
}

.ef-why.is-long p {
  margin: 4px 0 0;
}

.ef-message {
  padding: 5px 8px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--attention);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-1);
}

.ef-message.is-hold {
  border-left-color: var(--danger);
}

/* A compact cell: the control over its label, as the profile ribbon reads. */
.ef.is-cell {
  display: flex;
  flex-direction: column-reverse;
  align-items: stretch;
  gap: 3px;
  padding: 0;
  border-bottom: 0;
}

.ef.is-cell .ef-label {
  display: block;
  overflow: hidden;
  font-size: 9.5px;
  text-align: center;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.ef.is-cell .ef-dot {
  display: none;
}

.ef.is-cell .ef-control {
  justify-content: center;
}

.ef.is-cell .ef-box {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 2px;
  color: var(--signal);
  font: 700 18px/1 var(--font-code);
  text-align: center;
}

.ef.is-cell :is(.ef-was, .ef-why, .ef-message) {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .ef-toggle i::after {
    transition: none;
  }
}
</style>

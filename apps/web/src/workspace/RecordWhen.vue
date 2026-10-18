<script setup lang="ts">
/**
 * The date on a record: DDD-YYYY, edited the way a journal entry's fiction date is
 * (click, type, Enter or blur, empty clears, a bad date stays with one sentence),
 * plus "Use the campaign date" and an optional end. It never writes the campaign clock.
 */
import { nextTick, ref } from 'vue';
import type { CampaignRecord } from '@voyage/shared';
import { whenText, whenWeekday } from './journal/list.ts';
import {
    DATE_HINT, NO_CLOCK, ORDER_HINT, endFromClock, whenFromClock, whenFromEnd, whenFromStart,
} from './record_when.ts';

const props = defineProps<{
    when: CampaignRecord['when'];
    /** The campaign clock's day count, or null when the campaign has no date. */
    clockDays: number | null;
    readOnly: boolean;
}>();

const emit = defineEmits<{
    save: [when: CampaignRecord['when']];
}>();

const field = ref<HTMLInputElement | null>(null);
const startBtn = ref<HTMLButtonElement | null>(null);
const endBtn = ref<HTMLButtonElement | null>(null);
const editing = ref<'start' | 'end' | null>(null);
const draft = ref('');
const error = ref<'bad' | 'order' | null>(null);

function close(which: 'start' | 'end'): void {
    editing.value = null;
    error.value = null;
    void nextTick(() => {
        const button = which === 'end' ? endBtn.value : startBtn.value;
        if (button) button.focus();
    });
}

function open(which: 'start' | 'end'): void {
    if (props.readOnly) return;
    const when = props.when;
    draft.value = which === 'end' ? (when && when.end ? whenText(when.end) : '') : (when ? whenText(when.start) : '');
    error.value = null;
    editing.value = which;
    void nextTick(() => {
        if (field.value) {
            field.value.focus();
            field.value.select();
        }
    });
}

function apply(result: { when: CampaignRecord['when'] } | { error: 'bad' | 'order' }, which: 'start' | 'end'): void {
    if ('error' in result) {
        error.value = result.error;
        return;
    }
    emit('save', result.when);
    close(which);
}

function saveDraft(): void {
    const which = editing.value;
    if (!which) return;
    if (which === 'end') {
        const when = props.when;
        if (!when) {
            close('start');
            return;
        }
        apply(whenFromEnd(draft.value, when.start), 'end');
        return;
    }
    apply(whenFromStart(draft.value, props.when ? props.when.end : undefined), 'start');
}

function useClock(): void {
    if (props.readOnly || props.clockDays === null) return;
    const which = editing.value;
    if (which === 'end') {
        const when = props.when;
        if (!when) return;
        apply(endFromClock(props.clockDays, when.start), 'end');
        return;
    }
    apply(whenFromClock(props.clockDays, props.when ? props.when.end : undefined), 'start');
}

function clearAll(): void {
    if (props.readOnly) return;
    emit('save', null);
    close('start');
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        saveDraft();
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (editing.value) close(editing.value);
        return;
    }
    event.stopPropagation();
}
</script>

<template>
  <div class="rec-when">
    <label>
      Date
      <input
        v-if="editing === 'start'"
        ref="field"
        v-model="draft"
        class="clock-field"
        type="text"
        inputmode="numeric"
        aria-label="Date, as DDD-YYYY"
        placeholder="DDD-YYYY"
        :aria-invalid="error ? 'true' : undefined"
        @keydown="onKey"
        @blur="saveDraft"
      >
      <button
        v-else
        ref="startBtn"
        type="button"
        class="clock-date"
        :class="{ 'is-empty': !when }"
        :disabled="readOnly"
        @click="open('start')"
      >
        <template v-if="when"><b class="ui-date">{{ whenText(when.start) }}</b><span>{{ whenWeekday(when.start) }}</span></template>
        <template v-else><span class="clock-none">No date</span><span>Set a date</span></template>
      </button>
    </label>
    <button
      v-if="editing === 'start'"
      type="button"
      class="ui-btn"
      :disabled="readOnly || clockDays === null"
      @mousedown.prevent
      @click="useClock"
    >Use the campaign date</button>
    <button v-else-if="when" type="button" class="ui-btn" aria-label="Clear the date" :disabled="readOnly" @click="clearAll">Clear</button>

    <template v-if="when && editing !== 'start'">
      <template v-if="editing === 'end'">
        <input
          ref="field"
          v-model="draft"
          class="clock-field"
          type="text"
          inputmode="numeric"
          aria-label="End date, as DDD-YYYY"
          placeholder="DDD-YYYY"
          :aria-invalid="error ? 'true' : undefined"
          @keydown="onKey"
          @blur="saveDraft"
        >
        <button type="button" class="ui-btn" :disabled="readOnly || clockDays === null" @mousedown.prevent @click="useClock">Use the campaign date</button>
      </template>
      <template v-else-if="when.end">
        <button ref="endBtn" type="button" class="clock-date" :disabled="readOnly" @click="open('end')">
          <span>to</span><b class="ui-date">{{ whenText(when.end) }}</b><span>{{ whenWeekday(when.end) }}</span>
        </button>
      </template>
      <button v-else ref="endBtn" type="button" class="ui-btn" :disabled="readOnly" @click="open('end')">Add an end date</button>
    </template>

    <p v-if="error === 'bad'" class="edit-hint" role="status">{{ DATE_HINT }}</p>
    <p v-else-if="error === 'order'" class="edit-hint" role="status">{{ ORDER_HINT }}</p>
    <p v-else-if="editing && clockDays === null" class="edit-hint">{{ NO_CLOCK }}</p>
  </div>
</template>

<style>
.rec-when {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin: 6px 0 0;
}

.rec-when label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font: 700 12px/1.4 var(--font-text);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.rec-when .clock-date.is-empty {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

/* The date in the shared date box: the clock line's own bold mono would otherwise win inside the button. */
.rec-when .clock-date b.ui-date {
  color: var(--text-1);
  font: 700 12px/1.4 var(--font-display);
}

.rec-when .edit-hint {
  flex: 1 0 100%;
  margin: 0;
}
</style>

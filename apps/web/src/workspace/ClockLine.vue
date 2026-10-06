<script setup lang="ts">
/**
 * The campaign date in the Campaign panel (K6c): DDD-YYYY and the weekday, edited where it
 * stands. The date is the store's clock (K6b); setting it is one change, the server's
 * revision wins. "Looking is not advancing": only this field and the orbit view's own
 * "Set as campaign date" write it.
 */
import { computed, nextTick, ref } from 'vue';
import { lastError, pending } from '../campaign/commit.ts';
import { campaign, setCampaignDate } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { DEFAULT_START, totalDays } from '../orbit/clock.ts';
import { stardate, withStardate } from './stardate.ts';

const props = defineProps<{
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const field = ref<HTMLInputElement | null>(null);
const button = ref<HTMLElement | null>(null);
const editing = ref(false);
const draft = ref('');
const wrong = ref(false);

const days = computed(() => (campaign.clock ? campaign.clock.days : null));
const said = computed(() => (days.value === null ? null : stardate(days.value)));
const saveState = computed((): 'saving' | 'failed' | 'saved' => (lastError.value ? 'failed' : pending.value ? 'saving' : 'saved'));

function edit(): void {
    if (props.readOnly) return;
    draft.value = said.value ? said.value.date : '';
    wrong.value = false;
    editing.value = true;
    void nextTick(() => {
        if (field.value) {
            field.value.focus();
            field.value.select();
        }
    });
}

function leave(): void {
    editing.value = false;
    void nextTick(() => { if (button.value) button.value.focus(); });
}

function save(): void {
    const base = days.value ?? totalDays(DEFAULT_START.year, DEFAULT_START.day);
    const next = withStardate(base, draft.value);
    if (next === null) {
        wrong.value = true;
        return;
    }
    if (days.value === null || Math.floor(next) !== Math.floor(days.value)) setCampaignDate(next);
    leave();
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        save();
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        leave();
        return;
    }
    event.stopPropagation();
}

defineExpose({ edit });
</script>

<template>
  <div class="clock" :data-set="said ? 'yes' : 'no'">
    <Icon name="calendar-star" :size="14" />
    <template v-if="editing">
      <input
        ref="field"
        v-model="draft"
        class="clock-field"
        type="text"
        inputmode="numeric"
        aria-label="Campaign date, as DDD-YYYY"
        placeholder="DDD-YYYY"
        :aria-invalid="wrong ? 'true' : undefined"
        @keydown="onKey"
        @input="wrong = false"
        @blur="editing && save()"
      >
      <span class="clock-hint" :class="{ 'is-wrong': wrong }" role="status">{{ wrong ? 'A date is DDD-YYYY, day 001 to 365.' : 'Enter saves · Esc puts it back' }}</span>
    </template>
    <template v-else>
      <button ref="button" type="button" class="clock-date" :disabled="readOnly" :title="said ? 'Change the campaign date' : 'Set the campaign date'" @click="edit">
        <template v-if="said"><b>{{ said.date }}</b><span>{{ said.weekday }}</span></template>
        <template v-else><span class="clock-none">No campaign date yet</span><span>Set it</span></template>
      </button>
      <span v-if="saveState !== 'saved'" class="clock-save" :class="'is-' + saveState" role="status">{{ saveState === 'saving' ? 'Saving…' : 'Not saved' }}</span>
    </template>
  </div>
</template>

<style>
.clock {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -2px 0 12px;
  color: var(--text-muted);
  font: 400 13px/1.4 var(--font-text);
}

.clock > .ui-icon {
  flex: 0 0 auto;
  color: var(--signal);
}

.clock-date {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 0 -4px;
  padding: 2px 6px 2px 4px;
  border: 1px solid transparent;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--text-muted);
  font: 400 13px/1.4 var(--font-text);
  cursor: pointer;
}

.clock-date b {
  color: var(--text-0);
  font: 700 15px/1.3 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.clock-date:not(:disabled):hover {
  border-color: var(--line-2);
  background: var(--panel-raised);
  color: var(--text-1);
}

.clock-none {
  color: var(--text-1);
}

.clock-field {
  width: 112px;
  margin: 0;
  padding: 3px 8px;
  border: 1px solid var(--signal);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 700 14px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.clock-field:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--signal-glow);
}

.clock-hint {
  font-size: 12px;
}

.clock-hint.is-wrong {
  color: var(--attention);
}

.clock-save {
  font-size: 12px;
}

.clock-save.is-failed {
  color: var(--danger);
}
</style>

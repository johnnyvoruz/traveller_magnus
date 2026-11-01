<script setup lang="ts">
/**
 * DU39: a days box prefilled from a rolled wait or an arrival, and the button that moves the campaign clock
 * by it (advance_clock.ts). The referee may type any whole number, longer or shorter than the roll, or leave
 * it. Shown to the referee with the clock set and not viewing as players; nothing for anyone else.
 */
import { computed, ref, watch } from 'vue';
import { campaign } from '../campaign/store.ts';
import { canAdvanceClock } from '../dossier/journey_clock.ts';
import { advanceDays, advanceWords, typedDays } from './advance_clock.ts';

const props = defineProps<{
    /** The days the roll or the arrival means; the box starts with it. Null leaves the box empty. */
    days: number | null;
    /** What the box is for, for a screen reader: "Days the search took". */
    label: string;
}>();

const text = ref(props.days === null ? '' : String(props.days));
watch(() => props.days, (next) => { text.value = next === null ? '' : String(next); });
const days = computed(() => typedDays(text.value));
const now = computed(() => (campaign.clock ? campaign.clock.days : null));
const can = computed(() => canAdvanceClock.value && days.value !== null && days.value > 0 && now.value !== null);
const words = computed(() => (can.value && days.value !== null && now.value !== null ? advanceWords(days.value, now.value) : 'Advance'));
const bad = computed(() => text.value.trim() !== '' && days.value === null);

function go(): void {
    if (can.value && days.value !== null) advanceDays(days.value);
}
</script>

<template>
  <form v-if="canAdvanceClock" class="adv" data-advance @submit.prevent="go">
    <label class="adv-field">
      <span class="adv-sr">{{ label }}</span>
      <input v-model="text" class="adv-box" inputmode="numeric" :aria-label="label" data-advance-days />
      <span class="adv-unit" aria-hidden="true">days</span>
    </label>
    <button type="submit" class="ui-btn adv-go" :disabled="!can" data-advance-go>{{ words }}</button>
    <span v-if="bad" class="adv-err" role="alert">Whole days only.</span>
  </form>
</template>

<style>
.adv {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.adv-field {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.adv-box {
  box-sizing: border-box;
  width: 56px;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-0);
  font: 400 13px/1.3 var(--font-text);
  text-align: right;
}

.adv-unit,
.adv-err {
  font: 400 12.5px/1.4 var(--font-text);
}

.adv-unit {
  color: var(--text-muted);
}

.adv-err {
  color: var(--attention);
}

.adv-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>

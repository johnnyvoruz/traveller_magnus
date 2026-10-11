<script setup lang="ts">
/**
 * The time bar under a hybrid surface map: play and pause, speed, a date to jump to, and Now
 * (the campaign date). It steers the one shared clock (orbit/sim_clock.ts): the orbit view's
 * own clock while that view is open, else the store's. It shows the date and, on a turning
 * world, the starport's local time; on a world locked to its star it says the shadow is still.
 */
import { computed, ref } from 'vue';
import Icon from '../design/Icon.vue';
import { dateText, formatLinkDate, parseLinkDate } from '../orbit/clock.ts';
import { MAP_SPEEDS, setClockDays, setClockPlaying, setClockRate, simClock, clockToNow } from '../orbit/sim_clock.ts';

const props = defineProps<{
    /** The campaign date in days (Now), or the view's date when there is no campaign. */
    nowDays: number;
    /** Starport local time, or null on a locked world or one with no day. */
    localTime: string | null;
    /** A world locked to its star: its shadow does not move. */
    locked: boolean;
    /** The clock runs past a local day a second: the map shows day-averaged shading. */
    averaged: boolean;
}>();

const typed = ref('');
const bad = ref(false);

const speedIndex = computed(() => {
    let best = 0;
    for (let i = 0; i < MAP_SPEEDS.length; i += 1) {
        if (Math.abs(Math.log(MAP_SPEEDS[i].rate / simClock.rate)) < Math.abs(Math.log(MAP_SPEEDS[best].rate / simClock.rate))) best = i;
    }
    return best;
});

const dateLine = computed(() => dateText(simClock.days));

function toggle(): void {
    setClockPlaying(!simClock.playing);
}

function onSpeed(event: Event): void {
    const index = Number((event.target as HTMLSelectElement).value);
    const row = MAP_SPEEDS[index];
    if (row) setClockRate(row.rate);
}

function jump(): void {
    const text = typed.value.trim();
    const [date, time] = text.split(/\s+/);
    const days = parseLinkDate(date, time);
    bad.value = days === null;
    if (days === null) return;
    setClockPlaying(false);
    setClockDays(days);
    typed.value = '';
}

function now(): void {
    clockToNow(props.nowDays);
}

const placeholder = computed(() => {
    const link = formatLinkDate(props.nowDays);
    return link.date + (link.time ? ' ' + link.time : '');
});
</script>

<template>
  <div class="doss-timebar" role="group" aria-label="Surface map time">
    <button
      type="button"
      class="ui-btn is-icon"
      :aria-label="simClock.playing ? 'Pause' : 'Play'"
      :title="simClock.playing ? 'Pause' : 'Play'"
      :disabled="locked"
      @click="toggle"
    >
      <Icon :name="simClock.playing ? 'pause' : 'play'" :size="12" />
    </button>
    <label class="doss-timebar-speed">
      <span class="sr-only">Speed</span>
      <select :value="speedIndex" :disabled="locked" aria-label="Speed" @change="onSpeed">
        <option v-for="(row, index) in MAP_SPEEDS" :key="row.label" :value="index">{{ row.label }}</option>
      </select>
    </label>
    <form class="doss-timebar-jump" @submit.prevent="jump">
      <input
        v-model="typed"
        type="text"
        inputmode="numeric"
        :placeholder="placeholder"
        :aria-invalid="bad ? 'true' : undefined"
        aria-label="Jump to date, DDD-YYYY and optional HHMM"
        title="Jump to a date: DDD-YYYY, optionally followed by HHMM"
      />
      <button type="submit" class="ui-btn">Go</button>
    </form>
    <button type="button" class="ui-btn" title="The campaign date" @click="now">
      <Icon name="clock-rotate-left" :size="12" />Now
    </button>
    <p class="doss-timebar-read" aria-live="off">
      <span>{{ dateLine }}</span>
      <span v-if="locked"> · locked to its star: the shadow is still</span>
      <span v-else-if="localTime"> · starport {{ localTime }}</span>
      <span v-if="averaged && !locked"> · day-averaged</span>
    </p>
  </div>
</template>

<style>
.doss-timebar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-top: 6px;
  font-size: 11.5px;
}

.doss-timebar .ui-btn {
  padding: 4px 8px;
  font-size: 12px;
}

.doss-timebar .ui-btn.is-icon {
  width: 26px;
  height: 26px;
  padding: 0;
}

.doss-timebar select,
.doss-timebar input {
  box-sizing: border-box;
  height: 26px;
  padding: 2px 6px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--panel-raised);
  color: var(--text-1);
  font: 500 12px/1.2 var(--font-text);
}

.doss-timebar-jump {
  display: flex;
  gap: 4px;
  margin: 0;
}

.doss-timebar-jump input {
  width: 108px;
}

.doss-timebar-jump input[aria-invalid="true"] {
  border-color: var(--danger);
}

.doss-timebar-read {
  flex: 1 1 100%;
  margin: 0;
  color: var(--text-muted);
}

.doss-timebar :focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.doss-timebar .sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>

<script setup lang="ts">
/**
 * The orbit view's time row (legacy .sv-transport, .sv-timecode, .sv-speed and the Scrub
 * popover; js/system_viewer.js:1555-1601, 1732-1845). It holds no clock: it shows the days it
 * is given and asks the view to move them. The arithmetic is orbit/clock.ts.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { observeSize } from '../platform/browser.ts';
import Icon from '../design/Icon.vue';
import { formatDisplayNumber } from '../dossier/labels.ts';
import {
    isRealTime, REAL_TIME, SCRUB_DAYS, SHUTTLE_DEFAULT_LIMIT, SHUTTLE_LIMITS, SPEED_SLIDER_MAX,
    dateText, shuttleRate, START_HELP, shuttleText, sliderFromSpeed, speedFactorText, speedFromSlider,
    speedText, splitDays, timeFieldValue, withDay, withTime, withYear,
} from './clock.ts';
import OrbitPopover from './OrbitPopover.vue';

const props = defineProps<{
    days: number;
    paused: boolean;
    /** Days per second while playing. */
    speed: number;
    /** The shuttle's rate in days per second; 0 when it is not held. */
    shuttle: number;
    /** The wall clock's text, already formatted. */
    localTime: string;
    scrubOpen: boolean;
}>();

const emit = defineEmits<{
    toggle: [];
    skip: [hours: number];
    /** A date typed into a field. */
    days: [days: number];
    speed: [daysPerSecond: number];
    /** Offset in days from where the drag began; null when the slider is released. */
    scrub: [offset: number | null];
    shuttle: [rate: number];
    pop: [open: boolean];
}>();

const yearText = ref('');
const dayText = ref('');
const timeText = ref('');
const editing = ref('');
const speedSlider = ref(0);
const scrubValue = ref(0);
const shuttleValue = ref(0);
const shuttleLimit = ref<number>(SHUTTLE_DEFAULT_LIMIT);
let shuttleKeyHeld = false;

function syncFields(): void {
    const parts = splitDays(props.days);
    if (editing.value !== 'year') yearText.value = String(parts.year);
    if (editing.value !== 'day') dayText.value = String(Math.floor(parts.day));
    if (editing.value !== 'time') timeText.value = timeFieldValue(props.days);
}

watch(() => props.days, syncFields, { immediate: true });
watch(editing, syncFields);
watch(() => props.speed, (speed) => { speedSlider.value = Math.round(sliderFromSpeed(speed)); }, { immediate: true });

function text(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? target.value : '';
}

function commitYear(event: Event): void { emit('days', withYear(props.days, text(event))); }
function commitDay(event: Event): void { emit('days', withDay(props.days, text(event))); }
function commitTime(event: Event): void { emit('days', withTime(props.days, text(event))); }

function onSpeed(event: Event): void {
    speedSlider.value = Number(text(event));
    emit('speed', speedFromSlider(speedSlider.value));
}

function onScrub(event: Event): void {
    scrubValue.value = Number(text(event));
    emit('scrub', scrubValue.value);
}

function releaseScrub(): void {
    scrubValue.value = 0;
    emit('scrub', null);
}

function onShuttle(event: Event): void {
    shuttleValue.value = Number(text(event));
    emit('shuttle', shuttleRate(shuttleValue.value, shuttleLimit.value));
}

function onLimit(event: Event): void {
    shuttleLimit.value = Number(text(event));
    emit('shuttle', shuttleRate(shuttleValue.value, shuttleLimit.value));
}

function stopShuttle(): void {
    shuttleKeyHeld = false;
    shuttleValue.value = 0;
    emit('shuttle', 0);
}

function onShuttleChange(): void {
    if (!shuttleKeyHeld) stopShuttle();
}

function holdKeys(event: KeyboardEvent): boolean {
    return event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End';
}

function onShuttleKeyDown(event: KeyboardEvent): void {
    if (holdKeys(event)) shuttleKeyHeld = true;
}

function onShuttleKeyUp(event: KeyboardEvent): void {
    if (holdKeys(event)) stopShuttle();
}

function capture(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement) target.setPointerCapture(event.pointerId);
}

/**
 * The row holds the transport, the date fields, the speed and two popovers; below this width
 * they do not fit on one line, so the popovers' buttons drop their labels (legacy does the
 * same at a narrow window, style.css:2656).
 */
const COMPACT_BELOW = 1060;
const rowEl = ref<HTMLElement | null>(null);
const compact = ref(false);
let stopWatching: (() => void) | null = null;

onMounted(() => {
    const row = rowEl.value;
    if (!row) return;
    const measure = (): void => { compact.value = row.clientWidth < COMPACT_BELOW; };
    measure();
    stopWatching = observeSize(row, measure);
});

onBeforeUnmount(() => { if (stopWatching) stopWatching(); });
</script>

<template>
  <div ref="rowEl" class="orbit-time">
    <div class="orbit-transport" role="group" aria-label="Transport">
      <button type="button" class="orbit-btn is-icon" aria-label="Skip back one hour" title="Skip back one hour" @click="$emit('skip', -1)">
        <Icon name="backward" :size="12" />
      </button>
      <button
        type="button"
        class="orbit-btn is-icon orbit-play"
        :aria-label="paused ? 'Play simulation' : 'Pause simulation'"
        :aria-pressed="paused ? 'false' : 'true'"
        title="Play / pause (Space)"
        @click="$emit('toggle')"
      >
        <Icon :name="paused ? 'play' : 'pause'" :size="13" />
      </button>
      <button type="button" class="orbit-btn is-icon" aria-label="Skip forward one hour" title="Skip forward one hour" @click="$emit('skip', 1)">
        <Icon name="forward" :size="12" />
      </button>
    </div>

    <div class="orbit-timecode">
      <label class="orbit-field is-year">
        <span>Year</span>
        <input type="number" step="1" title="Year" :value="yearText" @focus="editing = 'year'" @blur="editing = ''" @change="commitYear">
      </label>
      <label class="orbit-field is-day">
        <span>Day</span>
        <input type="number" min="1" max="365" step="1" title="Day of the year" :value="dayText" @focus="editing = 'day'" @blur="editing = ''" @change="commitDay">
      </label>
      <label class="orbit-field is-time">
        <span>Time</span>
        <input type="time" step="1" title="Time of day" aria-label="Simulation time" :value="timeText" @focus="editing = 'time'" @blur="editing = ''" @change="commitTime">
      </label>
    </div>

    <div class="orbit-speed" title="Simulation speed: game time per real second">
      <button
        type="button"
        class="orbit-btn is-icon orbit-speed-reset"
        aria-label="Real time"
        title="Back to real time: one game second per second"
        :aria-pressed="isRealTime(speed) ? 'true' : 'false'"
        @click="$emit('speed', REAL_TIME)"
      >
        <Icon name="clock" :size="13" />
      </button>
      <input
        class="orbit-jog"
        type="range"
        min="0"
        :max="SPEED_SLIDER_MAX"
        step="1"
        aria-label="Simulation speed"
        :aria-valuetext="speedText(speed)"
        :value="speedSlider"
        @input="onSpeed"
      >
      <output class="orbit-speed-value" :title="speedFactorText(speed)">{{ speedText(speed) }}</output>
    </div>

    <div class="orbit-time-pops">
      <OrbitPopover
        id="orbit-scrub"
        :open="scrubOpen"
        icon="clock-rotate-left"
        label="Scrub"
        :show-label="!compact"
        title="Scrub and shuttle through time"
        @toggle="$emit('pop', !scrubOpen)"
        @close="$emit('pop', false)"
      >
        <div class="orbit-jogs">
          <label class="orbit-jog-row">
            <span>Scrub ±{{ SCRUB_DAYS }} d</span>
            <input
              class="orbit-jog"
              type="range"
              :min="-SCRUB_DAYS"
              :max="SCRUB_DAYS"
              step="0.001"
              aria-label="Scrub time, thirty days backward or forward"
              title="Drag backward or forward up to 30 days. Release to snap back."
              :aria-valuetext="dateText(days)"
              :value="scrubValue"
              @input="onScrub"
              @change="releaseScrub"
              @blur="releaseScrub"
            >
          </label>
          <label class="orbit-jog-row">
            <span>Shuttle</span>
            <input
              class="orbit-jog"
              type="range"
              min="-100"
              max="100"
              step="1"
              aria-label="Time shuttle, reverse or forward"
              title="Hold left to reverse or right to advance. Release to snap back and stop."
              :aria-valuetext="shuttleText(shuttle)"
              :value="shuttleValue"
              @input="onShuttle"
              @change="onShuttleChange"
              @pointerdown="capture"
              @pointerup="stopShuttle"
              @pointercancel="stopShuttle"
              @blur="stopShuttle"
              @keydown="onShuttleKeyDown"
              @keyup="onShuttleKeyUp"
            >
          </label>
          <div class="orbit-jog-row">
            <select class="orbit-select" aria-label="Maximum shuttle speed" :value="shuttleLimit" @change="onLimit">
              <option v-for="limit in SHUTTLE_LIMITS" :key="limit" :value="limit">{{ formatDisplayNumber(limit, 0) }} d/s</option>
            </select>
            <output class="orbit-shuttle-rate">{{ shuttleText(shuttle) }}</output>
          </div>
        </div>
        <p class="orbit-date" aria-live="off" :title="START_HELP">{{ dateText(days) }}</p>
        <time class="orbit-local-clock" title="Your computer’s local time, independent of simulation speed">Local time {{ localTime }}</time>
      </OrbitPopover>
      <slot name="pops" :compact="compact" />
    </div>
  </div>
</template>

<style>
.orbit-time {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 8px 14px;
  background: var(--stage-head);
  border-bottom: 1px solid var(--line-1);
}

.orbit-transport {
  display: flex;
  align-items: center;
  gap: 6px;
}

.orbit-timecode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.orbit-field {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font: 400 13px/1 var(--font-text);
}

.orbit-field input,
.orbit-select {
  box-sizing: border-box;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-3);
  background: var(--bg-2);
  color: var(--signal);
  font: 700 13px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: center;
  color-scheme: dark;
}

.orbit-field.is-year input { width: 112px; }
.orbit-field.is-day input { width: 60px; }
.orbit-field.is-time input { width: 136px; }

.orbit-field input:focus-visible,
.orbit-select:focus-visible {
  outline-offset: 1px;
  border-color: var(--signal);
}

.orbit-speed {
  display: flex;
  align-items: center;
  gap: 10px;
}

.orbit-speed .orbit-jog {
  width: 92px;
}

.orbit-speed-value {
  min-width: 68px;
  color: var(--signal);
  font: 600 12px/1 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.orbit-time-pops {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* Legacy .sv-jog: a hairline track and a teal thumb. */
.orbit-jog {
  appearance: none;
  height: 22px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.orbit-jog::-webkit-slider-runnable-track {
  height: 2px;
  border-radius: 1px;
  background: var(--control-line);
}

.orbit-jog::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -7px;
  border: 0;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 0 2px var(--bg-2);
}

.orbit-jog::-moz-range-track {
  height: 2px;
  border: 0;
  border-radius: 1px;
  background: var(--control-line);
}

.orbit-jog::-moz-range-thumb {
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 0 2px var(--bg-2);
}

.orbit-jogs {
  display: grid;
  gap: 10px;
  min-width: 300px;
}

.orbit-jog-row {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-2);
  font-size: 13px;
}

.orbit-jog-row > span {
  flex: 0 0 92px;
}

.orbit-jog-row .orbit-jog {
  flex: 1 1 auto;
  min-width: 0;
}

.orbit-shuttle-rate {
  color: var(--signal);
  font: 600 12px/1 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.orbit-pop-panel .orbit-date {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--line-1);
  color: var(--text-1);
  font: 700 13px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.orbit-local-clock {
  display: block;
  padding-top: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: var(--tabular);
}
</style>

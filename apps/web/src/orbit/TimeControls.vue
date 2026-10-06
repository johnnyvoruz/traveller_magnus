<script setup lang="ts">
/**
 * The orbit view's time row, pared (findings/orbit_showpiece_design.md §2): play, 1 week,
 * the scrub (its ends shuttle when held; the campaign date marked on its track), the speed,
 * one date readout that opens the date fields, the campaign mark and Set as campaign date.
 * It holds no clock: it shows the days it is given and asks the view to move them. The
 * arithmetic is orbit/clock.ts. Every control names its command (orbit/commands.ts).
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import Icon from '../design/Icon.vue';
import { formatDisplayNumber } from '../dossier/labels.ts';
import {
    dateText, HOUR, isRealTime, REAL_TIME, SCRUB_DAYS, SHUTTLE_DEFAULT_LIMIT, SPEED_SLIDER_MAX, START_HELP,
    sliderFromSpeed, speedFactorText, speedFromSlider, speedText, splitDays, timeFieldValue, WEEK_DAYS, withDay, withTime, withYear,
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
    /** The date fields are open under the readout. */
    dateOpen: boolean;
    /** The campaign date as the panel says it, when a campaign with a date is open; null otherwise. */
    campaignDate?: { date: string; weekday: string; days: number } | null;
    /** The view sits on the campaign date's day. */
    onCampaignDate?: boolean;
    /** Signed in with a campaign open: the view's date can be made the campaign's. */
    canSetDate?: boolean;
    /** The view's date in the campaign's form: "120-1105", "Senday". */
    said: { date: string; weekday: string };
}>();

const emit = defineEmits<{
    toggle: [];
    /** The "1 week" button: seven days on. */
    week: [];
    /** A date typed into a field. */
    days: [days: number];
    speed: [daysPerSecond: number];
    /** Offset in days from where the drag began; null when the slider is released. */
    scrub: [offset: number | null];
    shuttle: [rate: number];
    pop: [open: boolean];
    goCampaign: [];
    setCampaign: [];
}>();

const yearText = ref('');
const dayText = ref('');
const timeText = ref('');
const editing = ref('');
const speedSlider = ref(0);
const scrubValue = ref(0);
const scrubEl = ref<HTMLInputElement | null>(null);
const speedEl = ref<HTMLInputElement | null>(null);

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
    return target instanceof HTMLInputElement ? target.value : '';
}

function commitYear(event: Event): void { emit('days', withYear(props.days, text(event))); }
function commitDay(event: Event): void { emit('days', withDay(props.days, text(event))); }
function commitTime(event: Event): void { emit('days', withTime(props.days, text(event))); }

function onSpeed(event: Event): void {
    speedSlider.value = Number(text(event));
    emit('speed', speedFromSlider(speedSlider.value));
}

// ---- The scrub: drag, or step by key; its ends shuttle while held ---------------------

function onScrub(event: Event): void {
    scrubValue.value = Number(text(event));
    emit('scrub', scrubValue.value);
}

function releaseScrub(): void {
    if (scrubValue.value === 0) return;
    scrubValue.value = 0;
    emit('scrub', null);
}

/** Left and Right move a day; with Shift, an hour. Home and End go to the ends. The scrub springs back on key-up. */
function onScrubKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    event.stopPropagation();
    const by = event.shiftKey ? HOUR : 1;
    let next = event.key === 'Home' ? -SCRUB_DAYS : event.key === 'End' ? SCRUB_DAYS : scrubValue.value + step * by;
    next = Math.max(-SCRUB_DAYS, Math.min(SCRUB_DAYS, next));
    scrubValue.value = next;
    emit('scrub', next);
}

/** The ends: held, the clock shuttles that way, faster the longer the hold, up to the default limit. */
const RAMP = [1, 3, 10, 30, 100, SHUTTLE_DEFAULT_LIMIT];
let shuttleRate = 0;
let ramp: ReturnType<typeof setInterval> | null = null;
let rampAt = 0;
const RAMP_STEP = 500;

function holdEnd(direction: -1 | 1): void {
    stopHold();
    rampAt = 0;
    shuttleRate = direction * RAMP[0];
    emit('shuttle', shuttleRate);
    ramp = setInterval(() => {
        rampAt = Math.min(rampAt + 1, RAMP.length - 1);
        shuttleRate = direction * RAMP[rampAt];
        emit('shuttle', shuttleRate);
    }, RAMP_STEP);
}

function stopHold(): void {
    if (ramp !== null) clearInterval(ramp);
    ramp = null;
    if (shuttleRate !== 0) {
        shuttleRate = 0;
        emit('shuttle', 0);
    }
}

function onEndKey(event: KeyboardEvent, direction: -1 | 1): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'keydown' && !event.repeat) holdEnd(direction);
    else if (event.type === 'keyup') stopHold();
}

/** Where the campaign date falls on the scrub's track, as a share across it; null when out of range. */
function markAt(): number | null {
    const target = props.campaignDate;
    if (!target) return null;
    const offset = target.days - props.days;
    if (Math.abs(offset) > SCRUB_DAYS) return null;
    return (offset + SCRUB_DAYS) / (2 * SCRUB_DAYS);
}

onBeforeUnmount(stopHold);

defineExpose({
    focusScrub: () => { if (scrubEl.value) scrubEl.value.focus(); },
    focusSpeed: () => { if (speedEl.value) speedEl.value.focus(); },
});
</script>

<template>
  <div class="orbit-time">
    <div class="orbit-transport" role="group" aria-label="Transport">
      <button
        type="button"
        class="orbit-btn is-icon orbit-play"
        data-command="orbit-play"
        :aria-label="paused ? 'Play simulation' : 'Pause simulation'"
        :aria-pressed="paused ? 'false' : 'true'"
        title="Play / pause (Space)"
        @click="$emit('toggle')"
      >
        <Icon :name="paused ? 'play' : 'pause'" :size="13" />
      </button>
      <button
        type="button"
        class="orbit-btn orbit-week"
        data-command="orbit-week"
        aria-label="Advance 1 week"
        :title="'Advance 1 week: ' + WEEK_DAYS + ' days on, the same time of day (W)'"
        @click="$emit('week')"
      >
        <Icon name="forward-step" :size="12" />1 week
      </button>
    </div>

    <div class="orbit-scrub" title="Drag up to 30 days backward or forward; it springs back on release. Hold an end to shuttle.">
      <button
        type="button"
        class="orbit-scrub-end"
        aria-label="Shuttle backward while held"
        @pointerdown.prevent="holdEnd(-1)"
        @pointerup="stopHold"
        @pointercancel="stopHold"
        @pointerleave="stopHold"
        @keydown="onEndKey($event, -1)"
        @keyup="onEndKey($event, -1)"
        @blur="stopHold"
      >−{{ SCRUB_DAYS }} d</button>
      <span class="orbit-scrub-track">
        <i v-if="markAt() !== null" class="orbit-scrub-mark" :style="{ left: (markAt() as number) * 100 + '%' }" :title="'Campaign date ' + (campaignDate ? campaignDate.date : '')"></i>
        <input
          ref="scrubEl"
          class="orbit-jog"
          type="range"
          data-command="orbit-scrub"
          :min="-SCRUB_DAYS"
          :max="SCRUB_DAYS"
          step="0.001"
          aria-label="Scrub time, thirty days backward or forward"
          :aria-valuetext="dateText(days)"
          :value="scrubValue"
          @input="onScrub"
          @change="releaseScrub"
          @keydown="onScrubKey"
          @keyup="releaseScrub"
          @blur="releaseScrub"
        >
      </span>
      <button
        type="button"
        class="orbit-scrub-end"
        aria-label="Shuttle forward while held"
        @pointerdown.prevent="holdEnd(1)"
        @pointerup="stopHold"
        @pointercancel="stopHold"
        @pointerleave="stopHold"
        @keydown="onEndKey($event, 1)"
        @keyup="onEndKey($event, 1)"
        @blur="stopHold"
      >+{{ SCRUB_DAYS }} d</button>
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
        ref="speedEl"
        class="orbit-jog"
        type="range"
        data-command="orbit-speed"
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

    <div class="orbit-date-pop" data-command="orbit-date">
      <OrbitPopover
        id="orbit-date"
        :open="dateOpen"
        icon="calendar-star"
        :label="said.date + ' · ' + said.weekday + ' · ' + timeText"
        title="The view’s date and time; press to type one (T)"
        start
        @toggle="$emit('pop', !dateOpen)"
        @close="$emit('pop', false)"
      >
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
        <p class="orbit-date" aria-live="off" :title="START_HELP">{{ dateText(days) }}</p>
        <time class="orbit-local-clock" title="Your computer’s local time, independent of simulation speed">Local time {{ localTime }}</time>
      </OrbitPopover>
    </div>

    <div v-if="canSetDate" class="orbit-campaign" role="group" aria-label="Campaign date">
      <button
        v-if="campaignDate"
        type="button"
        class="orbit-btn orbit-campaign-mark"
        data-command="orbit-go-campaign"
        :class="{ 'is-on': onCampaignDate }"
        :aria-pressed="onCampaignDate ? 'true' : 'false'"
        :title="onCampaignDate ? 'The view is on the campaign date' : 'Go to the campaign date, ' + campaignDate.date + ' (C)'"
        @click="$emit('goCampaign')"
      >
        <Icon name="calendar-star" :size="12" /><b>{{ campaignDate.date }}</b><span>{{ campaignDate.weekday }}</span>
      </button>
      <button v-if="!campaignDate || !onCampaignDate" type="button" class="orbit-btn orbit-campaign-set" data-command="orbit-set-campaign" title="Make this the campaign date (Shift+C)" @click="$emit('setCampaign')">
        <Icon name="check" :size="12" />Set as campaign date
      </button>
    </div>
    <span class="orbit-shuttle-rate" aria-live="polite">{{ shuttle ? formatDisplayNumber(Math.abs(shuttle), 0) + ' d/s ' + (shuttle < 0 ? 'back' : 'on') : '' }}</span>
  </div>
</template>

<style>
.orbit-time {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 8px 14px;
  background: var(--stage-head);
  border-bottom: 1px solid var(--line-1);
}

.orbit-transport {
  display: flex;
  align-items: center;
  gap: 6px;
}

.orbit-btn.orbit-week {
  height: 32px;
  white-space: nowrap;
}

/* The scrub takes the row's spare width; its ends are the shuttle. */
.orbit-scrub {
  display: flex;
  flex: 1 1 200px;
  align-items: center;
  gap: 6px;
  min-width: 160px;
  max-width: 460px;
}

.orbit-scrub-end {
  flex: 0 0 auto;
  height: 26px;
  margin: 0;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-2);
  font: 500 11.5px/1 var(--font-text);
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.orbit-scrub-end:hover,
.orbit-scrub-end:active {
  border-color: var(--signal-dim);
  color: var(--signal);
}

.orbit-scrub-track {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
}

.orbit-scrub-track .orbit-jog {
  width: 100%;
}

/* The campaign date on the track: an amber tick, the colour of the focus of interest. */
.orbit-scrub-mark {
  position: absolute;
  top: 4px;
  width: 2px;
  height: 14px;
  margin-left: -1px;
  background: var(--attention);
  pointer-events: none;
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

.orbit-field input {
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

.orbit-field.is-year input { width: 92px; }
.orbit-field.is-day input { width: 60px; }
.orbit-field.is-time input { width: 128px; }

.orbit-field input:focus-visible {
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

/* The date readout: the campaign's form, in the field's look. */
.orbit-date-pop .orbit-pop-btn {
  height: 32px;
  border-color: var(--control-line);
  background: var(--bg-2);
  color: var(--signal);
  font: 700 13px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
  letter-spacing: 0.02em;
}

.orbit-date-pop .orbit-pop-btn .ui-icon {
  color: var(--text-muted);
}

/* The campaign date: a mark that jumps the view to it, and the one control that writes it. */
.orbit-campaign {
  display: flex;
  align-items: center;
  gap: 6px;
}

.orbit-btn.orbit-campaign-mark {
  height: 32px;
  gap: 7px;
  color: var(--text-1);
}

.orbit-btn.orbit-campaign-mark b {
  color: var(--signal-bright);
  font: 700 13px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.orbit-btn.orbit-campaign-mark span {
  color: var(--text-muted);
  font-weight: 400;
}

.orbit-btn.orbit-campaign-mark.is-on {
  border-color: var(--signal);
  background: var(--row-active);
}

.orbit-btn.orbit-campaign-set {
  height: 32px;
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

.orbit-shuttle-rate {
  color: var(--signal);
  font: 600 12px/1 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.orbit-shuttle-rate:empty {
  display: none;
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

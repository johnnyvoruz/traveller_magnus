<script setup lang="ts">
/**
 * The news ripple's scrubber (spec_xboat_ripples.md §3.3; streams/D.md XD1): "News from Regina · day 18 ·
 * 141-1105", a slider over the days from 0 to the horizon, Play or Pause, Today marked when the campaign
 * has a date, and close. The slider's own keys move it (arrows a day, Home and End); Esc closes. The map
 * view runs the clock and draws the layer; this only says the day and asks for another.
 * In reverse (§3.5, how old the news is where the party is) there is no day to scrub: a legend of
 * ages stands in its place, fresh to the horizon's age, with the same close.
 */
import { computed } from 'vue';
import Icon from '../design/Icon.vue';
import { stardate } from '../workspace/stardate.ts';

const props = defineProps<{
    /** How old the news is here: the legend of ages instead of the slider. */
    reverse?: boolean;
    sourceName: string;
    /** The scrubbed day, after day0. */
    t: number;
    horizonDays: number;
    /** The campaign day the ripple starts on. */
    day0: number;
    playing: boolean;
    /** False with reduced motion: no play, the slider by hand. */
    canPlay: boolean;
    /** Where Today sits on the track, in days after day0; null with no campaign date. */
    todayAt: number | null;
    /** The ripple stopped at the sector cap: the panel says so. */
    capped: boolean;
}>();

const emit = defineEmits<{ seek: [t: number]; play: []; pause: []; close: [] }>();

const day = computed(() => Math.floor(props.t));
const date = computed(() => stardate(props.day0 + props.t).date);
const todayLeft = computed(() => (props.todayAt === null || props.horizonDays <= 0 ? null : Math.min(100, Math.max(0, (props.todayAt / props.horizonDays) * 100))));

function onInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) emit('seek', value);
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    emit('close');
}
</script>

<template>
  <section v-if="reverse" class="news-scrub" role="group" :aria-label="'Age of the news at ' + sourceName" data-news-scrubber data-news-legend @keydown="onKey">
    <p class="news-scrub-say">
      <span>Age of the news at <b>{{ sourceName }}</b></span>
    </p>
    <div class="news-scrub-row">
      <span class="news-legend">
        <span class="news-legend-bar" aria-hidden="true"></span>
        <span class="news-legend-ends">
          <span>Arrived</span>
          <span>{{ horizonDays }} days later</span>
        </span>
      </span>
      <button type="button" class="ui-btn is-icon news-scrub-x" aria-label="Close the age of the news" title="Close" data-news-close @click="emit('close')">
        <Icon name="xmark" :size="13" />
      </button>
    </div>
    <p v-if="capped" class="news-scrub-fine" role="status">The map shows this news as far as nine sectors.</p>
  </section>
  <section v-else class="news-scrub" role="group" :aria-label="'News from ' + sourceName" data-news-scrubber @keydown="onKey">
    <p class="news-scrub-say">
      <span>News from <b>{{ sourceName }}</b></span>
      <span class="news-scrub-sep" aria-hidden="true">·</span>
      <span>day {{ day }}</span>
      <span class="news-scrub-sep" aria-hidden="true">·</span>
      <span class="news-scrub-date">{{ date }}</span>
    </p>
    <div class="news-scrub-row">
      <button
        v-if="canPlay"
        type="button"
        class="ui-btn is-icon news-scrub-play"
        :aria-label="playing ? 'Pause' : 'Play'"
        :title="playing ? 'Pause' : 'Play'"
        data-news-play
        @click="playing ? emit('pause') : emit('play')"
      >
        <Icon :name="playing ? 'pause' : 'play'" :size="13" />
      </button>
      <span class="news-scrub-track">
        <input
          type="range"
          class="news-scrub-range"
          min="0"
          :max="horizonDays"
          step="1"
          :value="day"
          :aria-label="'Days after the news left ' + sourceName"
          :aria-valuetext="'Day ' + day + ', ' + date"
          data-news-range
          @input="onInput"
        />
        <span v-if="todayLeft !== null" class="news-scrub-today" :style="{ left: todayLeft + '%', translate: -todayLeft + '% 0' }" data-news-today>Today</span>
      </span>
      <button type="button" class="ui-btn is-icon news-scrub-x" aria-label="Close the news" title="Close" data-news-close @click="emit('close')">
        <Icon name="xmark" :size="13" />
      </button>
    </div>
    <p v-if="capped" class="news-scrub-fine" role="status">The map shows this news as far as nine sectors.</p>
  </section>
</template>

<style>
/* Over the chart's foot, centred on the part of the chart the panel leaves, on the search field's glass. */
.news-scrub {
  position: absolute;
  bottom: calc(var(--chrome-inset) + 40px);
  left: calc(var(--rail-width) + var(--panel-width, 0px) + (100% - var(--rail-width) - var(--panel-width, 0px)) / 2);
  z-index: 4;
  box-sizing: border-box;
  width: min(480px, calc(100% - var(--rail-width) - var(--panel-width, 0px) - 2 * var(--chrome-inset)));
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome), 0 0 24px var(--frame-glow);
  translate: -50% 0;
}

.news-scrub-say {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 0 0 6px;
  color: var(--text-1);
  font: 400 13px/1.4 var(--font-text);
}

.news-scrub-say b {
  color: var(--text-0);
}

.news-scrub-sep {
  color: var(--text-muted);
}

.news-scrub-date {
  color: var(--text-0);
  font: 700 13px/1.4 var(--font-display);
  font-variant-numeric: var(--tabular);
}

.news-scrub-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.news-scrub-track {
  position: relative;
  flex: 1 1 auto;
  padding-bottom: 14px;
}

.news-scrub-range {
  width: 100%;
  accent-color: var(--chart-news);
}

/*
 * Today stays inside the track's own box, clear of Play (DF16): its left edge at the start, its middle at
 * the middle, its right edge at the end (left X%, moved back X% of its own width).
 */
.news-scrub-today {
  position: absolute;
  bottom: 0;
  color: var(--text-muted);
  font: 600 10px/1 var(--font-text);
  white-space: nowrap;
}

.news-legend {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
}

/* Bright where the news is fresh, faint where it is old: as the layer draws it. */
.news-legend-bar {
  height: 8px;
  border-radius: var(--r-1);
  background: linear-gradient(to right, color-mix(in srgb, var(--chart-news) 95%, transparent), color-mix(in srgb, var(--chart-news) 35%, transparent));
}

.news-legend-ends {
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
  font: 600 10px/1 var(--font-text);
}

.news-scrub-fine {
  margin: 6px 0 0;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

/* Below 680 px the date chip sits under the search: the control goes under the chip, as the hint does. */
@media (max-width: 680px) {
  .news-scrub {
    top: calc(var(--chrome-top) + 2 * (var(--chrome-height) + 8px));
    bottom: auto;
    left: calc(var(--rail-width) + var(--chrome-inset));
    width: calc(100% - var(--rail-width) - 2 * var(--chrome-inset));
    translate: none;
  }

  .news-scrub .ui-btn.is-icon {
    width: 44px;
    height: 44px;
  }
}
</style>

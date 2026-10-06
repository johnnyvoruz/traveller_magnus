<script setup lang="ts">
/**
 * What the header always shows of the clock (follow-up 6; findings/orbit_drawers_design.md
 * §1): Play, the date readout (the view's date, weekday and time; pressed, it opens the Time
 * drawer on the date fields) and the campaign mark (the campaign's date; pressed, the view
 * goes to it; lit when the view is on it). The readout is as wide as its longest reading,
 * so a weekday's name never moves the header (orbit/time_row.ts). Narrow, the readout keeps
 * the date alone and the mark its icon.
 */
import Icon from '../design/Icon.vue';
import { READOUT_CHARS } from './time_row.ts';

defineProps<{
    paused: boolean;
    /** The view's date in the campaign's form: "120-1105", "Senday". */
    said: { date: string; weekday: string };
    /** "12:00:00". */
    time: string;
    /** The Time drawer is open: the readout is pressed. */
    timeOpen: boolean;
    /** The campaign date, when a campaign with a date is open; null otherwise. */
    campaignDate: { date: string; weekday: string; days: number } | null;
    onCampaignDate: boolean;
    narrow: boolean;
}>();

defineEmits<{ toggle: []; date: []; goCampaign: [] }>();
</script>

<template>
  <div class="orbit-clock" :class="{ 'is-narrow': narrow }" role="group" aria-label="Clock">
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
      class="orbit-btn orbit-readout"
      data-command="orbit-date"
      :style="{ '--readout-chars': narrow ? 8 : READOUT_CHARS }"
      :aria-expanded="timeOpen ? 'true' : 'false'"
      aria-controls="orbit-drawer-time"
      :aria-label="'The view’s date and time, ' + said.date + ' ' + said.weekday + ' ' + time + '. Press for the Time drawer'"
      title="The view’s date and time; press to type one (T)"
      @click="$emit('date')"
    >
      <Icon name="calendar-star" :size="12" />
      <b>{{ said.date }}</b>
      <template v-if="!narrow"><span class="orbit-readout-sep">·</span><span>{{ said.weekday }}</span><span class="orbit-readout-sep">·</span><span class="orbit-readout-time">{{ time }}</span></template>
    </button>
    <button
      v-if="campaignDate"
      type="button"
      class="orbit-btn orbit-campaign-mark"
      data-command="orbit-go-campaign"
      :class="{ 'is-on': onCampaignDate }"
      :aria-pressed="onCampaignDate ? 'true' : 'false'"
      :aria-label="'Campaign date ' + campaignDate.date + (onCampaignDate ? ', the view is on it' : '. Go to it')"
      :title="onCampaignDate ? 'The view is on the campaign date' : 'Go to the campaign date, ' + campaignDate.date + ' (C)'"
      @click="$emit('goCampaign')"
    >
      <Icon name="calendar-star" :size="12" /><b v-if="!narrow">{{ campaignDate.date }}</b>
    </button>
  </div>
</template>

<style>
.orbit-clock {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.orbit-btn.orbit-play {
  width: 34px;
  height: 34px;
}

/* The readout: the campaign's form, in the field's look, its width fixed by its longest reading. */
.orbit-btn.orbit-readout {
  box-sizing: border-box;
  justify-content: flex-start;
  gap: 6px;
  width: calc(var(--readout-chars) * 1ch + 44px);
  height: 32px;
  border-color: var(--control-line);
  background: var(--bg-2);
  color: var(--signal);
  font: 700 13px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.orbit-btn.orbit-readout .ui-icon,
.orbit-readout-sep {
  color: var(--text-muted);
}

.orbit-readout-time {
  color: var(--text-1);
  font-weight: 500;
}

.orbit-btn.orbit-readout[aria-expanded='true'] {
  border-color: var(--signal);
}

/* The campaign mark: lit when the view is on the day. */
.orbit-btn.orbit-campaign-mark {
  height: 32px;
  gap: 7px;
  color: var(--text-1);
  white-space: nowrap;
}

.orbit-btn.orbit-campaign-mark b {
  color: var(--signal-bright);
  font: 700 13px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.orbit-btn.orbit-campaign-mark.is-on {
  border-color: var(--signal);
  background: var(--row-active);
}

/* Narrow: tighter, the readout the date alone with less padding, the mark its icon. */
.orbit-clock.is-narrow {
  gap: 4px;
}

.orbit-clock.is-narrow .orbit-btn.orbit-readout {
  width: calc(var(--readout-chars) * 1ch + 30px);
  padding: 0 8px;
}

.orbit-clock.is-narrow .orbit-btn.orbit-campaign-mark {
  padding: 0 8px;
}

.orbit-clock.is-narrow .orbit-btn.orbit-play {
  width: 30px;
  height: 30px;
}
</style>

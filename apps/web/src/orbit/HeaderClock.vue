<script setup lang="ts">
/**
 * What the header always shows of the clock (follow-up 6; findings/orbit_drawers_design.md
 * §1): Play, the date readout (the view's date, weekday and time; pressed, it opens the Time
 * drawer on the date fields). The readout's calendar says, quietly, where the view stands
 * against the campaign date: teal on it, amber off it, muted when there is none; the way
 * back is in the Time drawer and on C (the header's own mark was removed, Johnny
 * 2026-10-06). The readout is as wide as its longest reading, so a weekday's name never
 * moves the header (orbit/time_row.ts). Narrow, the readout keeps the date alone.
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

defineEmits<{ toggle: []; date: [] }>();
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
      :class="{ 'is-on-campaign': campaignDate && onCampaignDate, 'is-off-campaign': campaignDate && !onCampaignDate }"
      data-command="orbit-date"
      :style="{ '--readout-chars': narrow ? 8 : READOUT_CHARS }"
      :aria-expanded="timeOpen ? 'true' : 'false'"
      aria-controls="orbit-drawer-time"
      :aria-label="'The view’s date and time, ' + said.date + ' ' + said.weekday + ' ' + time + (campaignDate ? (onCampaignDate ? ', the campaign date' : ', off the campaign date ' + campaignDate.date) : '') + '. Press for the Time drawer'"
      :title="'The view’s date and time; press to type one (T)' + (campaignDate ? (onCampaignDate ? '. The view is on the campaign date' : '. The campaign date is ' + campaignDate.date + ' (C goes to it)') : '')"
      @click="$emit('date')"
    >
      <Icon name="calendar-star" :size="12" />
      <b>{{ said.date }}</b>
      <template v-if="!narrow"><span class="orbit-readout-sep">·</span><span>{{ said.weekday }}</span><span class="orbit-readout-sep">·</span><span class="orbit-readout-time">{{ time }}</span></template>
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
  /* The allowance is the icon, the gaps and the same 14 px at each end of the longest reading (measured). */
  width: calc(var(--readout-chars) * 1ch + 45px);
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

/* Where the view stands against the campaign date: the calendar teal on it, amber off it. */
.orbit-btn.orbit-readout.is-on-campaign .ui-icon {
  color: var(--signal);
}

.orbit-btn.orbit-readout.is-off-campaign .ui-icon {
  color: var(--attention);
}

/* Narrow: tighter, the readout the date alone with less padding. */
.orbit-clock.is-narrow {
  gap: 4px;
}

.orbit-clock.is-narrow .orbit-btn.orbit-readout {
  width: calc(var(--readout-chars) * 1ch + 37px);
  padding: 0 8px;
}

.orbit-clock.is-narrow .orbit-btn.orbit-play {
  width: 30px;
  height: 30px;
}
</style>

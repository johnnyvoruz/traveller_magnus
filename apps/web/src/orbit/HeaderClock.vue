<script setup lang="ts">
/**
 * What the header always shows of the clock (follow-up 6; findings/orbit_drawers_design.md
 * §1): Play, the date readout (the view's date, weekday and time; pressed, it opens the Time
 * drawer on the date fields), and before Play the reset (Johnny, 2026-10-06): one button
 * that brings the view back to the campaign date. Off the date it is the live control, its
 * icon amber; on the date it is quiet and disabled and says so; with no campaign date it is
 * not there (orbit/time_row.ts resetState). The readout's calendar is teal while the view is
 * on the campaign date and quiet otherwise: the amber is the reset's. The readout is as
 * wide as its longest reading, so a weekday's name never moves the header. Narrow, the
 * readout keeps the date alone.
 */
import Icon from '../design/Icon.vue';
import { READOUT_CHARS, resetState } from './time_row.ts';

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

const emit = defineEmits<{ toggle: []; date: []; goCampaign: [] }>();

/** The reset does nothing on the campaign date: it is disabled there, and still holds focus and its place. */
function reset(on: boolean): void {
    if (!on) emit('goCampaign');
}
</script>

<template>
  <div class="orbit-clock" :class="{ 'is-narrow': narrow }" role="group" aria-label="Clock">
    <button
      v-if="campaignDate"
      type="button"
      class="orbit-btn is-icon orbit-reset"
      :class="'is-' + resetState({ hasCampaignDate: true, onCampaignDate })"
      data-command="orbit-go-campaign"
      :aria-disabled="onCampaignDate ? 'true' : 'false'"
      :aria-label="onCampaignDate ? 'The view is on the campaign date, ' + campaignDate.date : 'Return the view to the campaign date, ' + campaignDate.date"
      :title="onCampaignDate ? 'The view is on the campaign date, ' + campaignDate.date : 'Back to the campaign date, ' + campaignDate.date + ' (C)'"
      @click="reset(onCampaignDate)"
    >
      <Icon name="rotate-left" :size="13" />
    </button>
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
      :class="{ 'is-on-campaign': campaignDate && onCampaignDate }"
      data-command="orbit-date"
      :style="{ '--readout-chars': narrow ? 8 : READOUT_CHARS }"
      :aria-expanded="timeOpen ? 'true' : 'false'"
      aria-controls="orbit-drawer-time"
      :aria-label="'The view’s date and time, ' + said.date + ' ' + said.weekday + ' ' + time + (campaignDate ? (onCampaignDate ? ', the campaign date' : ', off the campaign date ' + campaignDate.date) : '') + '. Press for the Time drawer'"
      :title="'The view’s date and time; press to type one (T)' + (campaignDate ? (onCampaignDate ? '. The view is on the campaign date' : '. The campaign date is ' + campaignDate.date) : '')"
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

/* On the campaign date the readout's calendar is teal; off it, quiet: the amber belongs to the reset. */
.orbit-btn.orbit-readout.is-on-campaign .ui-icon {
  color: var(--signal);
}

/* The reset: the size of Play, before it. Live, its icon is the one amber thing in the header. */
.orbit-btn.orbit-reset {
  width: 34px;
  height: 34px;
}

.orbit-btn.orbit-reset.is-live .ui-icon {
  color: var(--attention);
}

.orbit-btn.orbit-reset.is-live:hover {
  border-color: var(--attention);
}

/* Quiet: no edge, a muted icon, no hand. It keeps its place and its focus. */
.orbit-btn.orbit-reset.is-quiet {
  border-color: transparent;
  background: transparent;
  cursor: default;
}

.orbit-btn.orbit-reset.is-quiet .ui-icon {
  color: var(--text-muted);
  opacity: 0.6;
}

/* Narrow: tighter, the readout the date alone with less padding. */
.orbit-clock.is-narrow {
  gap: 4px;
}

.orbit-clock.is-narrow .orbit-btn.orbit-readout {
  width: calc(var(--readout-chars) * 1ch + 37px);
  padding: 0 8px;
}

.orbit-clock.is-narrow .orbit-btn.orbit-play,
.orbit-clock.is-narrow .orbit-btn.orbit-reset {
  width: 30px;
  height: 30px;
}
</style>

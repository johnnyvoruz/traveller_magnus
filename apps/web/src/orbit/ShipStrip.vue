<script setup lang="ts">
/**
 * The ships in this system and the status strip (K12 points 1, 2b, 5; K6d; the K15 reserved
 * place at the picture's upper right). The strip reads the selected ship's state from its
 * track and ends in Jump; under it the ship list (the party's first), and, while a flight
 * is being plotted, the leg preview with its estimate (distance, time, fuel); while a jump
 * is being marked, the jump preview (parsecs, fuel, the rolled hours). Every figure is an
 * estimate and says so; nothing warns and nothing refuses (K12, the measuring pass).
 * It writes nothing itself: the view owns the clock, the plotting mode and the track.
 */
import { computed, nextTick, ref } from 'vue';
import type { CampaignRecord } from '@voyage/shared';
import Icon from '../design/Icon.vue';
import { ACCEL_CHOICES, whenWords, type Leg, type ShipState } from './ship_list.ts';
import type { PickedSystem } from '../workspace/pick.ts';

const props = defineProps<{
    ships: readonly CampaignRecord[];
    selected: string | null;
    partyVesselId: string | null;
    status: { state: ShipState; text: string } | null;
    /** The selected ship's mark lies outside every 100D circle (null: not on the picture). */
    outside: boolean | null;
    plotting: boolean;
    /** The flight being plotted: the destination's name and the leg as it would be written. */
    preview: { toName: string; leg: Leg | null } | null;
    /** The flight's hours as the field holds them: the estimate, or what was typed; null when neither. */
    hours: number | null;
    /** The hours are the referee's, not the estimate. */
    hoursTyped: boolean;
    /** The flight's estimate in words; `distance` is empty where it is not known. */
    estimate: { distance: string; time: string; fuel: { manoeuvre: string; reaction: string } | null } | null;
    accelG: number;
    /** The jump's marked destination, and the system the map last opened, offered as one. */
    jumpTarget: PickedSystem | null;
    lastOpened: PickedSystem | null;
    /** The jump's hours as the field holds them: the roll, or what was typed; null when emptied. */
    jumpHours: number | null;
    /** The roll in words ("148 + 23 = 171 h"); empty once the referee has typed over it. */
    jumpRoll: string;
    /** "2 parsecs · about 20 tons · 100-ton hull assumed"; empty while the parsecs are not known. */
    jumpEstimate: string;
    narrow: boolean;
}>();

const emit = defineEmits<{
    select: [id: string];
    plot: [on: boolean];
    hours: [hours: number | null];
    useEstimate: [];
    accel: [g: number];
    addLeg: [];
    cancelPreview: [];
    pickOnMap: [];
    useLast: [];
    clearTarget: [];
    jumpHours: [hours: number | null];
    rollAgain: [];
    jump: [];
}>();

const canJump = computed(() => props.outside === true && props.jumpTarget !== null && props.jumpHours !== null && props.status !== null && props.status.state !== 'jump');

/** A field's number, or null when it is empty or not a duration. */
function typedHours(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.value.trim() === '') return null;
    const value = Number(target.value);
    return Number.isFinite(value) && value > 0 ? value : null;
}

const plotHoursEl = ref<HTMLInputElement | null>(null);

/** Back to the estimate: the control goes with the typed hours, so focus moves to the field it filled. */
function useEstimate(): void {
    emit('useEstimate');
    void nextTick(() => { if (plotHoursEl.value) plotHoursEl.value.focus(); });
}

/** The reason Jump is not yet possible, in a word or two. */
const jumpNote = computed(() => {
    if (!props.status) return '';
    if (props.status.state === 'jump') return 'In jump';
    if (props.outside !== true) return 'Inside a 100D limit';
    if (!props.jumpTarget) return 'No destination marked';
    if (props.jumpHours === null) return 'No duration';
    return '';
});
</script>

<template>
  <div class="orbit-ships" :class="{ 'is-narrow': narrow }">
    <!-- The strip: the selected ship's state, then Jump. -->
    <div v-if="status" class="orbit-strip" :class="'is-' + status.state" role="status" aria-live="polite">
      <span class="orbit-strip-dot" aria-hidden="true"></span>
      <span class="orbit-strip-text">{{ status.text }}</span>
      <button
        type="button"
        class="orbit-btn orbit-jump"
        :class="{ 'is-ready': canJump }"
        data-command="orbit-jump"
        :disabled="!canJump"
        :title="canJump ? 'Jump to ' + (jumpTarget ? jumpTarget.name : '') + ', ' + jumpHours + ' hours' : 'Jump: ' + jumpNote"
        @click="emit('jump')"
      >
        <Icon name="forward" :size="12" />Jump
      </button>
    </div>

    <!-- The ship list, the party's first. -->
    <ul v-if="ships.length" class="orbit-ship-list" role="listbox" aria-label="Ships in this system">
      <li v-for="ship in ships" :key="ship.id">
        <button
          type="button"
          class="orbit-ship"
          :class="{ 'is-selected': ship.id === selected, 'is-party': ship.id === partyVesselId }"
          role="option"
          :aria-selected="ship.id === selected ? 'true' : 'false'"
          :title="ship.id === partyVesselId ? ship.name + ' (the party’s ship)' : ship.name"
          @click="emit('select', ship.id)"
        >
          <span class="orbit-ship-mark" :class="ship.id === partyVesselId ? 'is-triangle' : 'is-circle'" aria-hidden="true"></span>
          <span class="orbit-ship-name">{{ ship.name }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="orbit-ships-none">No ships here</p>

    <!-- Marking a jump: where to. -->
    <div v-if="status && ships.length && status.state !== 'jump'" class="orbit-jump-to" :class="{ 'is-marked': jumpTarget }" role="group" aria-label="Jump destination">
      <template v-if="jumpTarget">
        <div class="orbit-jump-head">
          <span class="orbit-jump-to-label"><Icon name="location-dot" :size="11" />Jump to <b>{{ jumpTarget.name }}</b> {{ jumpTarget.hex }}</span>
          <button type="button" class="orbit-btn is-icon orbit-jump-clear" aria-label="Clear the destination" title="Clear the destination" @click="emit('clearTarget')"><Icon name="xmark" :size="11" /></button>
        </div>
        <p v-if="jumpEstimate" class="orbit-est">Estimate: {{ jumpEstimate }}</p>
        <div class="orbit-jump-time">
          <label class="orbit-field is-hours">
            <span>Hours</span>
            <input type="number" min="1" step="1" required :value="jumpHours ?? ''" title="How long the jump lasts: the roll, or type your own" @input="emit('jumpHours', typedHours($event))" @keydown.stop>
          </label>
          <span class="orbit-roll" :class="{ 'is-typed': !jumpRoll }">{{ jumpRoll || 'set by hand' }}</span>
          <button type="button" class="orbit-btn orbit-roll-again" data-command="orbit-jump-roll" title="Roll the jump’s duration again" @click="emit('rollAgain')"><Icon name="rotate-left" :size="11" />Roll again</button>
        </div>
      </template>
      <template v-else>
        <span class="orbit-jump-to-label">Destination:</span>
        <button type="button" class="orbit-btn orbit-jump-pick" title="Choose the next system on the map" @click="emit('pickOnMap')"><Icon name="map" :size="12" />Pick on the map</button>
        <button v-if="lastOpened" type="button" class="orbit-btn orbit-jump-last" :title="'Use ' + lastOpened.name + ' ' + lastOpened.hex" @click="emit('useLast')"><Icon name="location-dot" :size="12" />Use {{ lastOpened.name }}</button>
      </template>
    </div>

    <!-- Plotting a flight: the leg before it is written. -->
    <div v-if="plotting" class="orbit-plot-card" role="group" aria-label="Plot a flight">
      <p v-if="!preview" class="orbit-plot-hint"><Icon name="arrows-to-dot" :size="11" />Plotting: press a body on the picture to set the destination.</p>
      <template v-else>
        <p class="orbit-plot-line" :title="preview.toName"><b>{{ preview.toName }}</b></p>
        <p class="orbit-plot-when">
          <template v-if="preview.leg">departs {{ whenWords(preview.leg.departs) }} · arrives {{ whenWords(preview.leg.arrives) }}</template>
          <template v-else>No arrival until the hours are set</template>
        </p>
        <p v-if="estimate" class="orbit-est">
          <template v-if="estimate.distance">Estimate: {{ estimate.distance }}<template v-if="estimate.time"> · {{ estimate.time }} at {{ accelG }} G</template></template>
          <template v-else>Distance unknown: type the hours.</template>
        </p>
        <div class="orbit-plot-fields">
          <label class="orbit-field is-hours">
            <span>Hours</span>
            <input ref="plotHoursEl" type="number" min="0.1" step="0.1" required :value="hours ?? ''" :title="hoursTyped ? 'The flight’s duration, as typed' : 'The flight’s duration: the estimate, or type your own'" @input="emit('hours', typedHours($event))" @keydown.stop>
          </label>
          <button
            type="button"
            class="orbit-btn is-icon orbit-use-estimate"
            :class="{ 'is-off': !hoursTyped || !estimate || !estimate.time }"
            data-command="orbit-plot-estimate"
            :disabled="!hoursTyped || !estimate || !estimate.time"
            aria-label="Return to the estimate"
            title="Return to the estimate"
            @click="useEstimate"
          >
            <Icon name="rotate-left" :size="11" />
          </button>
          <div class="orbit-accel" role="radiogroup" aria-label="Acceleration">
            <button v-for="g in ACCEL_CHOICES" :key="g" type="button" class="orbit-accel-g" :class="{ 'is-on': g === accelG }" role="radio" :aria-checked="g === accelG ? 'true' : 'false'" :title="g + ' G'" @click="emit('accel', g)">{{ g }}<small>G</small></button>
          </div>
        </div>
        <p v-if="estimate && estimate.fuel" class="orbit-est is-fuel">
          <span v-if="estimate.fuel.manoeuvre">{{ estimate.fuel.manoeuvre }}</span>
          <span>{{ estimate.fuel.reaction }}</span>
        </p>
        <div class="orbit-plot-acts">
          <button type="button" class="orbit-btn is-primary orbit-add-leg" data-command="orbit-add-leg" :disabled="!preview.leg" @click="emit('addLeg')"><Icon name="check" :size="12" />Add leg</button>
          <button type="button" class="orbit-btn orbit-plot-cancel" @click="emit('cancelPreview')">Cancel</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style>
/* The reserved place: the picture's upper right, under the header. A column of small cards. */
.orbit-ships {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: min(420px, calc(100% - 28px));
  pointer-events: auto;
}

.orbit-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  height: 34px;
  padding: 0 4px 0 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  backdrop-filter: blur(8px);
  color: var(--text-1);
  font: 500 12.5px/1 var(--font-text);
  white-space: nowrap;
}

.orbit-strip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The state in its colour: teal under way, amber in jump, quiet at rest. */
.orbit-strip-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}

.orbit-strip.is-flight .orbit-strip-dot,
.orbit-strip.is-orbit .orbit-strip-dot {
  background: var(--signal);
  box-shadow: 0 0 6px var(--signal);
}

.orbit-strip.is-jump .orbit-strip-dot {
  background: var(--attention);
  box-shadow: 0 0 6px var(--attention);
}

.orbit-strip.is-jump .orbit-strip-text {
  color: var(--attention);
}

/* Jump: quiet until the ship is past every limit with a destination marked, then the one filled control. */
.orbit-btn.orbit-jump {
  height: 26px;
  padding: 0 10px;
  border-color: transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
}

.orbit-btn.orbit-jump:disabled {
  opacity: 1;
  cursor: default;
}

.orbit-btn.orbit-jump.is-ready {
  border-color: var(--signal);
  background: var(--signal);
  color: var(--on-signal);
}

.orbit-btn.orbit-jump.is-ready .ui-icon {
  color: var(--on-signal);
}

/* The ship list: a chip per ship, the selected one in the signal colour, the party's a triangle. */
.orbit-ship-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.orbit-ship {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  margin: 0;
  padding: 0 10px 0 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: var(--chrome-glass);
  color: var(--text-1);
  font: 500 12px/1 var(--font-text);
  cursor: pointer;
}

.orbit-ship:hover {
  border-color: var(--signal-dim);
}

.orbit-ship.is-selected {
  border-color: var(--signal);
  color: var(--signal);
}

.orbit-ship-mark {
  display: inline-block;
  width: 9px;
  height: 9px;
  border: 1px solid currentColor;
  border-radius: 50%;
}

.orbit-ship-mark.is-triangle {
  border: 0;
  border-radius: 0;
  background: currentColor;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

/* One line at any width: it stands at the strip's right edge, where the strip's own row would be. */
.orbit-ships-none {
  flex: 0 0 auto;
  margin: 0;
  padding: 4px 10px;
  white-space: nowrap;
  border: 1px dashed var(--line-2);
  border-radius: var(--r-pill);
  color: var(--text-muted);
  font: 500 12px/1.4 var(--font-text);
}

/* The jump destination row, the plot card: small glass cards under the list. */
.orbit-jump-to,
.orbit-plot-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  max-width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
  backdrop-filter: blur(8px);
  color: var(--text-1);
  font: 400 12.5px/1.3 var(--font-text);
}

.orbit-jump-to-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

.orbit-jump-to-label b {
  color: var(--text-0);
}

.orbit-btn.orbit-jump-pick,
.orbit-btn.orbit-jump-last {
  height: 28px;
  font-size: 12px;
}

.orbit-btn.orbit-jump-clear {
  width: 26px;
  height: 26px;
}

/* A destination marked: the row becomes the jump's preview, a small card like the plot's. */
.orbit-jump-to.is-marked {
  flex-direction: column;
  align-items: stretch;
  width: 384px;
  max-width: 100%;
}

/* Narrow: "Roll again" goes under the field before anything is squeezed. */
.orbit-jump-time {
  flex-wrap: wrap;
}

.orbit-jump-head,
.orbit-jump-time {
  display: flex;
  align-items: center;
  gap: 8px;
}

.orbit-jump-head .orbit-jump-to-label {
  flex: 1 1 auto;
  min-width: 0;
}

/* An estimate: quiet words, the figures as an instrument reads them. */
.orbit-est {
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.orbit-est.is-fuel {
  display: flex;
  flex-direction: column;
}

/* The roll beside its field: the width is held at its longest, so "Roll again" never moves under the pointer. */
.orbit-roll {
  flex: 1 1 auto;
  min-width: 16ch;
  color: var(--text-1);
  font: 600 12px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
}

.orbit-roll.is-typed {
  color: var(--text-muted);
  font-weight: 400;
}

.orbit-btn.orbit-roll-again {
  height: 28px;
  font-size: 12px;
}

/* Back to the estimate: its place is held while there is nothing to go back to. */
.orbit-btn.orbit-use-estimate {
  width: 28px;
  height: 28px;
}

.orbit-btn.orbit-use-estimate.is-off {
  visibility: hidden;
}

/* One width, whatever the words say: a figure that changes must not move the controls under the pointer. */
.orbit-plot-card {
  flex-direction: column;
  align-items: stretch;
  width: 360px;
  max-width: 100%;
}

.orbit-plot-hint,
.orbit-plot-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-muted);
}

/* The destination's name is never broken: one line, cut with an ellipsis if it must be. The dates have the line beneath, always there, so nothing shifts when the destination or the hours change. */
.orbit-plot-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.orbit-plot-when {
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.orbit-plot-line b {
  color: var(--text-0);
}

.orbit-plot-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.orbit-field.is-hours input {
  width: 72px;
}

.orbit-accel {
  display: flex;
  gap: 2px;
}

.orbit-accel-g {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  height: 28px;
  margin: 0;
  padding: 0 7px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: transparent;
  color: var(--text-1);
  font: 600 12px/1 var(--font-code);
  cursor: pointer;
}

.orbit-accel-g small {
  color: var(--text-muted);
  font-size: 9px;
}

.orbit-accel-g.is-on {
  border-color: var(--signal);
  background: var(--row-active);
  color: var(--signal);
}

.orbit-plot-acts {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.orbit-btn.orbit-add-leg,
.orbit-btn.orbit-plot-cancel {
  height: 28px;
  font-size: 12px;
}

/* Narrow: the strip's words give way to the dot and Jump. */
.orbit-ships.is-narrow {
  max-width: calc(100% - 20px);
}

.orbit-ships.is-narrow .orbit-strip {
  padding-left: 8px;
}
</style>

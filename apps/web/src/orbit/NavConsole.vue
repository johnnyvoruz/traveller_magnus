<script setup lang="ts">
/**
 * The ship's navigation console (follow-up 29; findings/orbit_nav_console_design.md): what
 * the plot card became. It opens when a ship is taken in hand, on the thrust; once a thrust
 * is set the plotter is live, and the console reads what is under the pointer (its range,
 * its time, its arrival), then the course as it is laid, leg by leg. It is the picture's
 * overlay card in the view's own language: the ship sheet's chamfered panel and cyan tab,
 * its rust value tag for the thrust, the Scout readout's mono figures on the well, the
 * arrival the largest thing on it. Every figure is an estimate; nothing warns or refuses.
 * It holds one width, and its readouts are as wide as their longest reading, so nothing
 * shifts under a sweeping pointer. It writes nothing itself: the view owns the course.
 */
import { nextTick, ref } from 'vue';
import Icon from '../design/Icon.vue';
import { ACCEL_CHOICES } from './ship_list.ts';

/** One leg of the course, in words. */
export type CourseRow = {
    n: number;
    /** The body's key, or empty for a point in open space. */
    to: string;
    name: string;
    /** What the hours field shows: the estimate to a tenth, or what was typed; null when neither. */
    hours: number | null;
    typed: boolean;
    /** "31.4 AU · about 11 d 5 h", "Distance unknown: type the hours", "Waiting on the leg before". */
    estimate: string;
    /** "148-1105 05:15", or empty. */
    arrives: string;
    title: string;
};

/** One leg of the ship's stored route. */
export type RouteRow = {
    n: number;
    to: string;
    name: string;
    /** "2 G · 5 d 4 h" as stored, or the estimate while it is being moved. */
    estimate: string;
    arrives: string;
    /** Under way (history), planned, or being moved on the picture. */
    state: 'underway' | 'planned' | 'moving';
    editable: boolean;
};

const props = defineProps<{
    /** The ship in hand. */
    ship: string;
    party: boolean;
    /** The thrust for the course; null until it is set (none is assumed). */
    accelG: number | null;
    /** What is under the pointer, measured from the ship or the last waypoint; null when nothing is. */
    here: { name: string; distance: string; time: string; arrives: string } | null;
    /** What to say in place of the live figures. */
    hereNote: string;
    /** "Under the pointer", or "Stepped to" from the keyboard. */
    hereLabel: string;
    /** There are bodies to step through from the keyboard. */
    canStep: boolean;
    /** Laying waypoints. Off, the console is editing: the arrow, and Lay from here starts laying again. */
    laying: boolean;
    /** Every body of the system, in the body list's order: what a waypoint's destination can be changed to from here. */
    bodies: readonly { key: string; name: string }[];
    /** The ship's stored route from the date on; null when it has none here. */
    route: { rows: readonly RouteRow[]; note: string } | null;
    /** What follows the route on the track (a jump and the legs after it): shown with their dates, never picked up. */
    onward: { rows: readonly { n: number; name: string; estimate: string; arrives: string; moved: boolean }[]; note: string } | null;
    course: {
        rows: readonly CourseRow[];
        /** "50.0 AU · about 23 d 9 h" for the whole course, or what is missing. */
        total: string;
        /** The last arrival, "160-1105 08:55", or empty. */
        arrives: string;
        fuel: { manoeuvre: string; reaction: string } | null;
        ready: boolean;
        typed: boolean;
    } | null;
}>();

const emit = defineEmits<{
    accel: [g: number];
    legHours: [index: number, hours: number | null];
    useEstimate: [];
    addCourse: [];
    removeLast: [];
    clearCourse: [];
    /** A plotted waypoint removed, or sent to another body. */
    legRemove: [index: number];
    legTarget: [index: number, key: string];
    /** A stored waypoint removed, or sent to another body: written at once, with an Undo. */
    routeRemove: [index: number];
    routeTarget: [index: number, key: string];
    /** The waypoint under the pointer (or stepped to from the keyboard) is laid. */
    commit: [];
    /** Laying again from the last waypoint. */
    lay: [];
    /** Laying ends. The course stays uncommitted and the ship stays in hand. */
    stop: [];
    /** The body list, a step on or back, as the place under the plotter. */
    step: [by: 1 | -1];
    release: [];
}>();

const rootEl = ref<HTMLElement | null>(null);

/** A field's number, or null when it is empty or not a duration. */
function typedHours(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.value.trim() === '') return null;
    const value = Number(target.value);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function chosen(event: Event): string {
    const target = event.target;
    return target instanceof HTMLSelectElement ? target.value : '';
}

/** After a row goes, focus stays in the console: the row that took its place, the one before, or the throttle. */
function afterRemove(list: 'route' | 'course', index: number): void {
    void nextTick(() => {
        const root = rootEl.value;
        if (!root) return;
        const rows = root.querySelectorAll<HTMLElement>('.nav-legs.is-' + list + ' .nav-dest');
        const next = rows[Math.min(index, rows.length - 1)] ?? root.querySelector<HTMLElement>('.nav-dest') ?? root.querySelector<HTMLElement>('.nav-notch[aria-checked="true"]');
        if (next) next.focus();
    });
}

function removeRow(list: 'route' | 'course', index: number): void {
    if (list === 'route') emit('routeRemove', index);
    else emit('legRemove', index);
    afterRemove(list, index);
}

/** A destination's own keys stay its own; Delete (or Backspace) on it removes the waypoint. */
function onDestKey(event: KeyboardEvent, list: 'route' | 'course', index: number): void {
    event.stopPropagation();
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault();
    removeRow(list, index);
}

/** The throttle is a radio group: Left and Right, Down and Up move the thrust a G; Home and End go to its ends. */
function onThrottleKey(event: KeyboardEvent): void {
    const first = ACCEL_CHOICES[0];
    const last = ACCEL_CHOICES[ACCEL_CHOICES.length - 1];
    const now = props.accelG ?? first - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(last, now + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(first, now - 1);
    else if (event.key === 'Home') next = first;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    emit('accel', next);
    void nextTick(() => {
        const el = rootEl.value ? rootEl.value.querySelector<HTMLElement>('.nav-notch[aria-checked="true"]') : null;
        if (el) el.focus();
    });
}

/** Back to the estimates: the control goes with the typed hours, so focus moves to the first field it filled. */
function useEstimate(): void {
    emit('useEstimate');
    void nextTick(() => {
        const el = rootEl.value ? rootEl.value.querySelector<HTMLInputElement>('.nav-leg input') : null;
        if (el) el.focus();
    });
}

defineExpose({
    /** Removes the waypoint whose row has focus; false when focus is on no row. */
    removeFocused: (): boolean => {
        const root = rootEl.value;
        const el = root ? root.ownerDocument.activeElement : null;
        const row = el instanceof HTMLElement ? el.closest('.nav-leg') : null;
        const list = row ? row.closest('.nav-legs') : null;
        if (!root || !row || !list || !root.contains(row) || !row.querySelector('.nav-x')) return false;
        removeRow(list.classList.contains('is-route') ? 'route' : 'course', [...list.children].indexOf(row));
        return true;
    },
    focusThrottle: () => {
        const root = rootEl.value;
        const el = root ? root.querySelector<HTMLElement>('.nav-notch[aria-checked="true"]') ?? root.querySelector<HTMLElement>('.nav-notch') : null;
        if (el) el.focus();
    },
});
</script>

<template>
  <section ref="rootEl" class="nav" :class="{ 'is-idle': accelG === null }" role="group" :aria-label="'Navigation console, ' + ship">
    <header class="nav-head">
      <h3 class="nav-tab"><span>Nav</span><b :title="ship">{{ ship }}</b></h3>
      <button type="button" class="nav-release" data-command="orbit-release" title="Release the ship: leave plotting (Esc)" aria-label="Release the ship and leave plotting" @click="emit('release')">
        <Icon name="xmark" :size="11" />Release
      </button>
    </header>

    <!-- The thrust first: a throttle of six notches. -->
    <div class="nav-thrust">
      <span class="nav-label" id="nav-thrust-label">Thrust</span>
      <div class="nav-throttle" role="radiogroup" aria-labelledby="nav-thrust-label" data-command="orbit-thrust" @keydown="onThrottleKey">
        <button
          v-for="g in ACCEL_CHOICES"
          :key="g"
          type="button"
          class="nav-notch"
          :class="{ 'is-lit': accelG !== null && g <= accelG }"
          role="radio"
          :aria-checked="g === accelG ? 'true' : 'false'"
          :tabindex="g === accelG || (accelG === null && g === ACCEL_CHOICES[0]) ? 0 : -1"
          :aria-label="g + ' G'"
          :title="g + ' G'"
          @click="emit('accel', g)"
        ><i aria-hidden="true"></i>{{ g }}</button>
      </div>
      <output class="nav-g" :class="{ 'is-unset': accelG === null }" aria-live="polite">{{ accelG === null ? '– G' : accelG + ' G' }}</output>
    </div>
    <p v-if="accelG === null" class="nav-ask">Set the thrust to start plotting. Nothing is assumed.</p>

    <template v-else>
      <!-- The live plotter: what is under the pointer. -->
      <div class="nav-live">
        <p class="nav-target"><span class="nav-label">{{ hereLabel }}</span><b :title="here ? here.name : ''">{{ here ? here.name : hereNote }}</b></p>
        <dl class="nav-figs">
          <dt>Range</dt><dd>{{ here ? here.distance : '–' }}</dd>
          <dt>Time</dt><dd>{{ here ? here.time : '–' }}</dd>
        </dl>
        <div class="nav-foot">
        <p class="nav-arrival">
          <span class="nav-label">{{ here ? 'Arrival here' : course && course.arrives ? 'Arrival, course' : 'Arrival' }}</span>
          <output>{{ here ? here.arrives : course && course.arrives ? course.arrives : '–––-–––– ––:––' }}</output>
        </p>
        <div class="nav-aim" role="group" aria-label="Plotter">
          <button type="button" class="orbit-btn is-icon" data-command="orbit-plot-prev-body" :disabled="!canStep" aria-label="Plot to the body before" title="The body before (,)" @click="emit('step', -1)"><Icon name="chevron-left" :size="11" /></button>
          <button type="button" class="orbit-btn is-icon" data-command="orbit-plot-next-body" :disabled="!canStep" aria-label="Plot to the next body" title="The next body (.)" @click="emit('step', 1)"><Icon name="chevron-right" :size="11" /></button>
          <button type="button" class="orbit-btn nav-lay" data-command="orbit-plot-commit" :disabled="!here" title="Lay a waypoint here (M, or press the picture)" @click="emit('commit')">
            <Icon name="plus" :size="11" />Waypoint
          </button>
        </div>
        </div>
      </div>

      <!-- The stored route: the leg under way is history; the rest can be changed here or dragged on the picture. -->
      <template v-if="route">
        <h4 class="nav-rule"><span>Route</span></h4>
        <ol class="nav-legs is-route">
          <li v-for="(row, index) in route.rows" :key="row.n" class="nav-leg" :class="'is-' + row.state">
            <span class="nav-n" aria-hidden="true">{{ String(row.n).padStart(2, '0') }}</span>
            <template v-if="row.editable">
              <span class="nav-dest-wrap">
                <select class="nav-dest" :value="row.to" :aria-label="'Waypoint ' + row.n + ' of the route: ' + row.name + '. Choose another body, or Delete to remove it'" :title="row.name" @change="emit('routeTarget', index, chosen($event))" @keydown="onDestKey($event, 'route', index)">
                  <option v-if="!row.to" value="" disabled>{{ row.name }}</option>
                  <option v-for="body in bodies" :key="body.key" :value="body.key">{{ body.name }}</option>
                </select>
                <Icon name="caret-down" :size="9" />
              </span>
              <button type="button" class="nav-x" data-command="orbit-waypoint-remove" :aria-label="'Remove waypoint ' + row.n + ' from the route'" title="Remove this waypoint (Delete)" @click="removeRow('route', index)"><Icon name="xmark" :size="11" /></button>
            </template>
            <template v-else>
              <b class="nav-leg-name" :title="row.name">{{ row.name }}</b>
              <span v-if="row.state === 'underway'" class="nav-state">Under way</span>
            </template>
            <span class="nav-leg-est">{{ row.estimate }}</span>
            <span class="nav-leg-arr">{{ row.arrives }}</span>
          </li>
        </ol>
        <p v-if="route.note" class="nav-quiet">{{ route.note }}</p>
      </template>
      <!-- What follows the route: with no course being plotted it stands here; with one, after the course's legs. -->
      <template v-if="onward && !course">
        <h4 v-if="!route" class="nav-rule"><span>Route</span></h4>
        <ol class="nav-legs is-onward" aria-label="After the course">
          <li v-for="row in onward.rows" :key="row.n" class="nav-leg is-follows" :class="{ 'is-moving': row.moved }">
            <span class="nav-n" aria-hidden="true">{{ String(row.n).padStart(2, '0') }}</span>
            <b class="nav-leg-name" :title="row.name">{{ row.name }}</b>
            <span class="nav-leg-est">{{ row.estimate }}</span>
            <span class="nav-leg-arr">{{ row.arrives }}</span>
          </li>
        </ol>
        <p class="nav-quiet">{{ onward.note }}</p>
      </template>

      <!-- The course being plotted: a readout of legs. -->
      <template v-if="course">
        <h4 class="nav-rule"><span>{{ route ? 'Then' : 'Course' }}</span></h4>
        <ol class="nav-legs is-course">
          <li v-for="(row, index) in course.rows" :key="row.n" class="nav-leg" :title="row.title || undefined">
            <span class="nav-n" aria-hidden="true">{{ String(row.n).padStart(2, '0') }}</span>
            <span class="nav-dest-wrap">
              <select class="nav-dest" :value="row.to" :aria-label="'Waypoint ' + row.n + ': ' + row.name + '. Choose another body, or Delete to remove it'" :title="row.name" @change="emit('legTarget', index, chosen($event))" @keydown="onDestKey($event, 'course', index)">
                <option v-if="!row.to" value="" disabled>{{ row.name }}</option>
                <option v-for="body in bodies" :key="body.key" :value="body.key">{{ body.name }}</option>
              </select>
              <Icon name="caret-down" :size="9" />
            </span>
            <label class="nav-hours">
              <span class="nav-sr">Hours for leg {{ row.n }}</span>
              <input type="number" min="0.1" step="0.1" required :value="row.hours ?? ''" :class="{ 'is-typed': row.typed }" :title="row.typed ? 'This leg’s hours, as typed' : 'This leg’s hours: the estimate, or type your own'" @input="emit('legHours', index, typedHours($event))" @keydown.stop>
              <span aria-hidden="true">h</span>
            </label>
            <button type="button" class="nav-x" data-command="orbit-waypoint-remove" :aria-label="'Remove waypoint ' + row.n" title="Remove this waypoint (Delete)" @click="removeRow('course', index)"><Icon name="xmark" :size="11" /></button>
            <span class="nav-leg-est">{{ row.estimate }}</span>
            <span class="nav-leg-arr">{{ row.arrives }}</span>
          </li>
        </ol>
        <template v-if="onward">
          <ol class="nav-legs is-onward" aria-label="After the course">
            <li v-for="row in onward.rows" :key="row.n" class="nav-leg is-follows" :class="{ 'is-moving': row.moved }">
              <span class="nav-n" aria-hidden="true">{{ String(row.n).padStart(2, '0') }}</span>
              <b class="nav-leg-name" :title="row.name">{{ row.name }}</b>
              <span class="nav-leg-est">{{ row.estimate }}</span>
              <span class="nav-leg-arr">{{ row.arrives }}</span>
            </li>
          </ol>
          <p class="nav-quiet">{{ onward.note }}</p>
        </template>
        <p class="nav-total"><span class="nav-label">Total</span>{{ course.total }}</p>
        <p v-if="course.fuel" class="nav-quiet">
          <span v-if="course.fuel.manoeuvre">{{ course.fuel.manoeuvre }}</span>
          <span>{{ course.fuel.reaction }}</span>
        </p>
        <p class="nav-quiet">Each leg is flown from rest to rest.</p>
        <div class="nav-acts">
          <button type="button" class="orbit-btn is-primary nav-add" data-command="orbit-add-leg" :disabled="!course.ready" @click="emit('addCourse')"><Icon name="check" :size="12" />Add course</button>
          <button type="button" class="orbit-btn nav-last" data-command="orbit-course-undo" title="Remove the last waypoint (Esc)" @click="emit('removeLast')"><Icon name="rotate-left" :size="12" />Last</button>
          <button type="button" class="orbit-btn nav-clear" data-command="orbit-course-clear" title="Clear the whole course" @click="emit('clearCourse')">Clear</button>
          <button
            type="button"
            class="orbit-btn is-icon nav-estimates"
            :class="{ 'is-off': !course.typed }"
            data-command="orbit-plot-estimate"
            :disabled="!course.typed"
            aria-label="Return every leg’s hours to its estimate"
            title="Return to the estimates"
            @click="useEstimate"
          ><Icon name="rotate-left" :size="11" /></button>
        </div>
      </template>
      <p v-if="laying && !(route || course)" class="nav-quiet nav-how">Press the picture to lay a waypoint: a body, or open space for a point. A body ends laying. Right-click stops plotting. A point in open space needs the pointer; the bodies can be stepped through with , and . and laid with M. <button type="button" class="orbit-btn nav-stop-lay" data-command="orbit-stop-plotting" @click="emit('stop')">Stop laying</button></p>
      <p v-else-if="laying" class="nav-quiet nav-how">Press the picture to lay the next waypoint. A body ends laying; right-click stops plotting. Drag a waypoint to move it. The course stays until Add course. <button type="button" class="orbit-btn nav-stop-lay" data-command="orbit-stop-plotting" @click="emit('stop')">Stop laying</button></p>
      <p v-else class="nav-quiet nav-how">Editing. Nothing new is laid under the pointer. Drag a waypoint to move it, or change it here. <button type="button" class="orbit-btn nav-lay-again" data-command="orbit-plot" @click="emit('lay')">Lay from here</button> (P) lays on from the last waypoint.</p>
    </template>
  </section>
</template>

<style>
/* The console: the ship sheet's chamfered panel on the picture's glass, one width whatever it reads. */
.nav {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 1 auto;
  width: 384px;
  max-width: 100%;
  min-height: 0;
  padding: 0 12px 12px;
  /* A short picture: the legs give way first (below), then the console itself scrolls. */
  overflow-y: auto;
  scrollbar-width: thin;
  background: var(--chrome-glass);
  box-shadow: inset 0 0 0 1px var(--signal-line);
  backdrop-filter: blur(8px);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  color: var(--text-1);
  font: 400 12px/1.4 var(--font-text);
  pointer-events: auto;
}

/* The cyan tab, as the sheet's sections have it, with the ship's name; Release at the far end. */
.nav-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 -12px;
  padding-right: 6px;
  border-bottom: 1px solid var(--signal-line);
}

.nav-tab {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 4px 18px 4px 14px;
  background: var(--signal);
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  color: var(--on-signal);
  font: 700 11px/1.5 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nav-tab b {
  min-width: 0;
  overflow: hidden;
  font: 700 11px/1.5 var(--font-code);
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-release {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 0 auto;
  padding: 3px 6px;
  border: 0;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--text-muted);
  font: 600 12px/1 var(--font-text);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}

.nav-release:hover {
  color: var(--text-0);
}

/* A label on an instrument: small capitals, quiet. */
.nav-label {
  color: var(--text-muted);
  font: 700 12px/1.3 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* The thrust: a throttle of six notches that light up to the one chosen, and the value on the sheet's rust tag. */
.nav-thrust {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 58px;
  align-items: center;
  gap: 10px;
}

.nav-throttle {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 3px;
}

.nav-notch {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: 700 12px/1 var(--font-code);
  text-align: center;
  cursor: pointer;
}

.nav-notch i {
  display: block;
  height: 14px;
  border: 1px solid var(--control-line);
  background: var(--bg-2);
  transition: background var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out);
}

.nav-notch:first-child i {
  clip-path: polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px);
}

.nav-notch:hover i {
  border-color: var(--signal-dim);
}

.nav-notch.is-lit i {
  border-color: var(--signal);
  background: var(--signal);
}

.nav-notch.is-lit,
.nav-notch[aria-checked='true'] {
  color: var(--signal);
}

.nav-notch:focus-visible {
  outline-offset: 2px;
}

.nav-g {
  box-sizing: border-box;
  padding: 3px 8px;
  border: 1px solid var(--sheet-rust-line);
  background: var(--sheet-rust);
  clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
  color: var(--text-0);
  font: 700 13px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: center;
}

.nav-g.is-unset {
  border-color: var(--control-line);
  background: var(--bg-2);
  color: var(--text-muted);
}

.nav-ask {
  margin: 0;
  color: var(--attention);
  font: 600 12px/1.4 var(--font-text);
}

/* The live readout: the Scout readout's well, mono figures, each as wide as its longest reading. */
.nav-live {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 4px 10px;
  padding: 8px 10px 9px;
  border: 1px solid var(--line-1);
  border-left: 2px solid var(--signal-dim);
  border-radius: var(--r-2);
  background: var(--bg-2);
}

.nav-target {
  display: flex;
  grid-column: 1 / -1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  margin: 0;
}

.nav-target b {
  overflow: hidden;
  color: var(--text-0);
  font: 700 13px/1.4 var(--font-code);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-figs {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: baseline;
  gap: 1px 8px;
  margin: 0;
}

.nav-figs dt {
  color: var(--text-muted);
  font: 700 12px/1.3 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nav-figs dd {
  margin: 0;
  overflow: hidden;
  color: var(--signal);
  font: 700 13px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
}

/* The arrival and the plotter's controls share a line; when a scrollbar takes the room (a short picture), the controls go under. */
.nav-foot {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 6px 8px;
}

/* The arrival is the largest thing on the console. */
.nav-arrival {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  margin: 2px 0 0;
}

.nav-arrival output {
  display: block;
  width: 14ch;
  color: var(--signal-bright);
  font: 700 20px/1.2 var(--font-code);
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
}

.nav-aim {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.nav-aim .orbit-btn {
  height: 28px;
  padding: 0 9px;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
}

.nav-aim .orbit-btn.is-icon {
  width: 26px;
  padding: 0;
}

/* The course: a rule with its name, then the legs as a readout. The list scrolls past five. */
.nav-rule {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 0;
  color: var(--text-muted);
  font: 700 12px/1.3 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nav-rule::after {
  flex: 1 1 auto;
  height: 1px;
  background: var(--line-1);
  content: '';
}

/* In the ships' column the console is the one thing that gives way. */
.orbit-ships > .nav {
  flex: 0 1 auto;
}

.nav > * {
  flex: 0 0 auto;
}

.nav > .nav-legs {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  gap: 6px;
  min-height: 44px;
  max-height: 232px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.nav-leg {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 22px;
  align-items: center;
  gap: 1px 6px;
}

/* A waypoint's destination: it reads as the leg's name, and opens as a list of the bodies. */
.nav-dest-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}

.nav-dest-wrap .ui-icon {
  position: absolute;
  right: 6px;
  color: var(--text-muted);
  pointer-events: none;
}

.nav-dest {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 24px;
  margin: 0;
  padding: 0 20px 0 6px;
  overflow: hidden;
  border: 1px solid var(--control-line);
  border-radius: var(--r-1);
  background: var(--bg-2);
  color: var(--text-0);
  font: 700 12px/1 var(--font-code);
  text-overflow: ellipsis;
  white-space: nowrap;
  appearance: none;
  color-scheme: dark;
  cursor: pointer;
}

.nav-dest:hover {
  border-color: var(--signal-dim);
}

.nav-x {
  display: inline-flex;
  grid-column: 4;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.nav-x:hover {
  color: var(--attention);
}

/* The leg under way is history, and a jump and what follows it are not picked up: quieter, and nothing on them can be pressed. */
.nav-leg.is-underway .nav-n,
.nav-leg.is-underway .nav-leg-name,
.nav-leg.is-follows .nav-n,
.nav-leg.is-follows .nav-leg-name {
  color: var(--text-muted);
}

.nav-leg.is-follows .nav-leg-name {
  grid-column: 2 / -1;
}

.nav > .nav-legs.is-onward {
  flex: 0 0 auto;
  min-height: 0;
  max-height: none;
  overflow: visible;
}

.nav-state {
  grid-column: 3 / -1;
  color: var(--signal);
  font: 700 12px/1.4 var(--font-text);
  letter-spacing: 0.08em;
  text-align: right;
  text-transform: uppercase;
}

/* A waypoint in hand on the picture: its row and those after it read the figures as they change. */
.nav-leg.is-moving .nav-n,
.nav-leg.is-moving .nav-leg-arr {
  color: var(--attention);
}

.nav-n {
  color: var(--attention);
  font: 700 12px/1 var(--font-code);
}

.nav-leg-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-0);
  font: 700 12px/1.4 var(--font-code);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-hours {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font: 400 12px/1 var(--font-code);
}

.nav-hours input {
  box-sizing: border-box;
  width: 72px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-1);
  background: var(--bg-2);
  color: var(--signal);
  font: 700 12px/1 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: right;
  color-scheme: dark;
}

.nav-hours input.is-typed {
  border-color: var(--attention);
  color: var(--attention);
}

.nav-leg-est {
  grid-column: 2;
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-leg-arr {
  grid-column: 3 / -1;
  color: var(--text-1);
  font: 400 12px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: right;
  white-space: nowrap;
}

.nav-total {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding-top: 6px;
  border-top: 1px solid var(--line-soft);
  color: var(--text-0);
  font: 700 12px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.nav-quiet {
  display: flex;
  flex-direction: column;
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.nav-acts {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-acts .orbit-btn {
  height: 28px;
  font-size: 12px;
}

/* The one filled control. */
.nav-acts .nav-add {
  border-color: var(--signal);
  background: var(--signal);
  color: var(--on-signal);
}

.nav-acts .nav-add .ui-icon {
  color: inherit;
}

.nav-acts .nav-add:hover:not(:disabled) {
  border-color: var(--signal-bright);
  background: var(--signal-bright);
}

.nav-acts .nav-estimates {
  width: 28px;
  margin-left: auto;
}

.nav-acts .nav-estimates.is-off {
  visibility: hidden;
}

.nav-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

@media (prefers-reduced-motion: reduce) {
  .nav-notch i {
    transition: none;
  }
}
</style>

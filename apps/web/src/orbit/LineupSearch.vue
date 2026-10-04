<script setup lang="ts">
/**
 * The Line up popover (legacy .sv-alignment, js/system_viewer.js:1459-1548): jump to the next
 * time the planets sit on one line through the star, then to the one after. It only binds:
 * the search is orbit/alignment.ts, run by orbit/alignment_runner.ts on a worker; the words
 * are alignmentReport.
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { formatDisplayNumber } from '../dossier/labels.ts';
import { startAlignmentWorker } from '../platform/browser.ts';
import {
    ALIGNMENT_HORIZON_YEARS, alignmentBodies, alignmentReport, type AlignmentReport, type Lineup,
} from './alignment.ts';
import { AlignmentRunner } from './alignment_runner.ts';
import type { Plan } from './layout.ts';
import OrbitPopover from './OrbitPopover.vue';

const props = defineProps<{
    plan: Plan | null;
    open: boolean;
    /** The clock's date when a search starts. */
    now: () => number;
    /** The row is narrow: the button shows its icon only. */
    compact?: boolean;
}>();

const emit = defineEmits<{
    pop: [open: boolean];
    /** Jump the clock to a line-up and show it on the orbits layout. */
    show: [days: number];
}>();

const runner = new AlignmentRunner(startAlignmentWorker);
const busy = ref(false);
const status = ref('');
const report = ref<AlignmentReport | null>(null);
/** The closeness of the line-up shown, which the next search must match (legacy `bar`). */
let bar: number | undefined;
let ticket = 0;

/** js/system_viewer.js:1481: a new system, or a cancel, clears what was found. */
function reset(): void {
    ticket += 1;
    runner.cancel();
    busy.value = false;
    status.value = '';
    report.value = null;
}

/** js/system_viewer.js:1526-1543. `shown` is the line-up on screen when asking for the one after it. */
async function search(startDays: number, shown: Lineup | null, matchSpread?: number): Promise<void> {
    const plan = props.plan;
    if (!plan) return;
    const mine = ++ticket;
    busy.value = true;
    report.value = null;
    status.value = shown ? 'Looking for the lineup after this one…' : 'Searching ahead for a lineup…';
    try {
        const result = await runner.run(
            alignmentBodies(plan, false),
            shown ? { startDays, tolerance: matchSpread, strict: true } : { startDays },
        );
        if (mine !== ticket) return;
        const words = alignmentReport(result, shown);
        report.value = words;
        status.value = '';
        bar = result ? result.tolerance : undefined;
        if (words.land !== null) emit('show', words.land);
    } catch (error) {
        if (mine !== ticket) return;
        status.value = 'Search failed: ' + (error instanceof Error ? error.message : String(error));
    } finally {
        if (mine === ticket) busy.value = false;
    }
}

function first(): void {
    void search(props.now() + 1 / 86400, null);
}

function next(): void {
    const upcoming = report.value ? report.value.upcoming : null;
    if (upcoming) void search(upcoming.days + 1 / 86400, upcoming, bar);
}

function cancel(): void {
    reset();
    report.value = alignmentReport(null, null);
}

watch(() => props.plan, reset);
onBeforeUnmount(() => runner.dispose());
</script>

<template>
  <OrbitPopover
    id="orbit-lineup"
    :open="open"
    icon="arrows-to-dot"
    label="Line up"
    :show-label="!compact"
    title="Jump to the next time the planets sit on one line"
    @toggle="emit('pop', !open)"
    @close="emit('pop', false)"
  >
    <div class="orbit-lineup">
      <p class="orbit-lineup-intro">
        Jumps to the next time every planet sits on one line through the star. Companion stars are included. Moons,
        belts, and rings are left out. The search follows these circular orbits and looks
        {{ formatDisplayNumber(ALIGNMENT_HORIZON_YEARS, 0) }} years ahead.
      </p>
      <div class="orbit-lineup-controls">
        <button type="button" class="orbit-btn orbit-lineup-go" :disabled="busy || !plan" @click="first">Line up the planets</button>
        <button v-if="busy" type="button" class="orbit-btn" @click="cancel">Cancel</button>
      </div>
      <div class="orbit-lineup-results" role="status">
        <p v-if="status">{{ status }}</p>
        <template v-if="report">
          <p v-if="report.date" class="orbit-lineup-date">{{ report.date }}</p>
          <p v-for="line in report.lines" :key="line">{{ line }}</p>
          <p v-for="note in report.notes" :key="note" class="orbit-lineup-note">{{ note }}</p>
          <button v-if="report.upcoming" type="button" class="orbit-btn" :disabled="busy" @click="next">Show the next lineup</button>
        </template>
      </div>
    </div>
  </OrbitPopover>
</template>

<style>
.orbit-lineup {
  width: min(320px, 70vw);
  color: var(--text-1);
  font: 400 12px/1.6 var(--font-text);
}

.orbit-lineup p {
  margin: 3px 0;
}

.orbit-lineup-intro,
.orbit-lineup-note {
  color: var(--text-muted);
}

.orbit-lineup .orbit-lineup-intro {
  margin-top: 0;
}

.orbit-lineup-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}

.orbit-lineup-go {
  flex: 1 1 auto;
}

.orbit-lineup-go:disabled {
  cursor: progress;
}

.orbit-lineup-results {
  display: grid;
  gap: 6px;
}

.orbit-lineup-results .orbit-btn {
  width: 100%;
}

.orbit-lineup-date {
  color: var(--text-0);
  font: 600 13px/1.45 var(--font-code);
  font-variant-numeric: var(--tabular);
}
</style>

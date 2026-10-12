/**
 * A many-hex job as one toast (prompts/d_star_numbers.md part 3): it comes at the click, its
 * words follow the job ("Generating 80 hexes · 12 of 80"), it offers Stop, and it stays while the
 * person does other things: the pane closed, another hex, another route. When the job ends it
 * gives way to the result toast with Undo, so there is one toast at a time.
 *
 * It uses the app's toast strip as it is (shell/toast.ts): a toast's words can be changed in place,
 * and its time is set long enough to outlast any job. The strip closes a toast when its action is
 * pressed, so Stop is followed by a "Stopping" toast that follows the job the same way.
 */
import { reactive, watch } from 'vue';
import { dismissToast, showToast, toasts } from '../../shell/toast.ts';
import { buildStore } from './seam.ts';
import { build, jobLine } from './state.ts';

/** Longer than any job: the toast leaves when the job ends, not on a clock. */
const HELD_MS = 2 ** 31 - 1;

let shown: number | null = null;
let stopRun: (() => void) | null = null;

/** Stop was pressed: said at once, before the store's next answer says so. */
const asked = reactive({ stop: false });

function words(): string {
    const job = build.job;
    if (!job) return '';
    return job.state === 'running' && !asked.stop ? jobLine(job) : 'Stopping. ' + jobLine(job);
}

function stopPressed(): void {
    asked.stop = true;
    shown = null;
    if (stopRun) stopRun();
    // The strip has closed the toast it was pressed on: the job is still saying where it is.
    if (build.job) shown = showToast(words(), { ms: HELD_MS });
}

/** At the click: the job's toast, with Stop. */
export function startJobToast(stop: () => void): void {
    endJobToast();
    asked.stop = false;
    stopRun = stop;
    shown = showToast(words(), { action: { label: 'Stop', run: stopPressed }, ms: HELD_MS });
}

/** When the job ends, just before its result toast. */
export function endJobToast(): void {
    if (shown !== null) dismissToast(shown);
    shown = null;
    stopRun = null;
}

/**
 * Leaving the map closes the builder store, which clears every toast; the job itself goes on
 * (the closed store keeps following it and ends it as usual). Each time the store changes while
 * the job runs, its toast is put back.
 */
watch(() => buildStore(), () => {
    if (!build.job || shown === null || toasts.some((item) => item.id === shown)) return;
    shown = asked.stop ? showToast(words(), { ms: HELD_MS }) : showToast(words(), { action: { label: 'Stop', run: stopPressed }, ms: HELD_MS });
});

// The words follow the job; a toast the person closed with its X stays closed.
watch(() => words(), (text) => {
    if (shown === null || !text) return;
    const toast = toasts.find((item) => item.id === shown);
    if (toast) toast.message = text;
});

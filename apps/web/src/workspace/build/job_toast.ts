/**
 * A many-hex job as one toast (prompts/d_star_numbers.md part 3; prompts/d_density_sheet.md
 * part 3): it comes at the click with the strip's ring (`busy`, announced once), its words follow
 * the job ("Generating 80 hexes · 12 of 80"), and it offers Stop, which leaves the toast up and
 * turns its words to "Stopping." When the job ends it gives way to the result toast with Undo.
 *
 * Across routes: the strip lives in the app shell, and the builder store follows a running job
 * after the store that started it closes (findings/builder_density_ready.md). The next store's
 * `job` carries the counts and an Undo token it knows; the result offers that token. A job this
 * screen did not start (Build opened after a route change with nothing of its own running) is
 * picked up from `job`, so the pane's progress and the toast go on.
 */
import { reactive, watch } from 'vue';
import { dismissToast, showToast, toasts } from '../../shell/toast.ts';
import { offerUndo } from './acts.ts';
import { endFlight, noteFlight } from './flight.ts';
import { buildStore, type BuildStore, type JobProgress, type JobState, type UndoToken } from './seam.ts';
import { build, errorOf, jobError, jobLine, jobToast, plural } from './state.ts';

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

function show(): number {
    if (asked.stop) return showToast(words(), { busy: true, ms: HELD_MS });
    return showToast(words(), { busy: true, ms: HELD_MS, action: { label: 'Stop', close: false, run: stopPressed } });
}

function stopPressed(): void {
    asked.stop = true;
    if (stopRun) stopRun();
    // The same toast says so, and Stop is not offered twice.
    const toast = toasts.find((item) => item.id === shown);
    if (toast) {
        toast.message = words();
        toast.action = null;
    }
}

/** At the click: the job's toast, with Stop. */
export function startJobToast(stop: () => void): void {
    endJobToast();
    asked.stop = false;
    if (!following) taken = false;
    stopRun = stop;
    shown = show();
}

/** When the job ends, just before its result toast. */
export function endJobToast(): void {
    if (shown !== null) dismissToast(shown);
    shown = null;
    stopRun = null;
}

/**
 * The token the result offers. The same store: its own. The store changed while the job ran: the
 * one the current store knows, or none when it does not follow this job (it opened before the
 * job's request was answered), since the first store's token means nothing to it.
 */
export function jobUndo(token: UndoToken, from: BuildStore | null): UndoToken | null {
    const now = buildStore();
    if (now === from) return token;
    return now && now.job && now.job.value ? now.job.value.undo : null;
}

/** Said with a job's result when no store here can take it back. */
export const NO_JOB_UNDO = 'Undo isn’t available, because you left the map while the job ran. To take these systems back, select them, and then select Remove.';

// The words follow the job.
watch(() => words(), (text) => {
    if (shown === null || !text) return;
    const toast = toasts.find((item) => item.id === shown);
    if (toast) toast.message = text;
});

// ---- a job followed across a route change ----------------------------------------------------------

const ENDED = new Set(['done', 'stopped', 'failed']);
let following: BuildStore | null = null;
let stopFollow: (() => void) | null = null;

function screenState(state: string): JobState {
    return state === 'running' || state === 'stopping' || state === 'stopped' || state === 'done' ? state : 'stopped';
}

/**
 * A job this screen started, taken over by the store that follows it after a route change: the
 * store that started it may stop answering once closed, so its end is said from here, and a late
 * answer from it is ignored (`takenOver`).
 */
let taken = false;

export function takenOver(): boolean {
    return taken;
}

/** A new job from this screen, at the click: one taken over before is over. Said also when its toast waits for the server. */
export function newJob(): void {
    if (!following) taken = false;
}

function follow(store: BuildStore): void {
    const ref = store.job;
    if (!ref || !ref.value) return;
    const ours = build.job !== null;
    // A job that ended before this screen saw it has nothing to say here.
    if (!ours && ENDED.has(ref.value.progress.state)) return;
    following = store;
    taken = ours;
    const label = build.job ? build.job.label : 'Generating ' + plural(ref.value.progress.total, 'hex', 'hexes');
    const counts = (now: NonNullable<typeof ref.value>): JobProgress => {
        const out: JobProgress = { total: now.progress.total, done: now.progress.done, failed: [...now.progress.failed], state: screenState(now.progress.state) };
        if (now.progress.leftEmpty !== undefined) out.leftEmpty = now.progress.leftEmpty;
        if (now.progress.placed) out.placed = [...now.progress.placed];
        const lost = errorOf(now.progress);
        if (lost) out.error = lost;
        return out;
    };
    const apply = (): void => {
        const now = ref.value;
        if (!now) return;
        build.job = { ...counts(now), label };
        noteFlight(now.progress);
    };
    const finish = (now: NonNullable<typeof ref.value>): void => {
        const progress = counts(now);
        unfollow();
        build.job = null;
        endFlight();
        endJobToast();
        const lost = jobError(progress);
        if (lost) {
            build.error = lost;
            showToast(lost);
            return;
        }
        offerUndo(jobToast(progress, ''), now.undo);
    };
    if (ENDED.has(ref.value.progress.state)) {
        finish(ref.value);
        return;
    }
    apply();
    if (!ours) startJobToast(() => { if (store.stopJob) store.stopJob(); });
    else stopRun = () => { if (store.stopJob) store.stopJob(); };
    stopFollow = watch(() => ref.value, (now) => {
        if (!now) return;
        if (ENDED.has(now.progress.state)) finish(now);
        else apply();
    });
}

function unfollow(): void {
    if (stopFollow) stopFollow();
    stopFollow = null;
    following = null;
}

/**
 * When Build's store changes: a job this screen started keeps its toast (closing the map store
 * clears every toast), and a running job it knows nothing of is picked up from the store.
 */
watch(() => buildStore(), (store) => {
    // The store that was being followed closed: the next one follows the job again.
    if (following && following !== store) unfollow();
    if (build.job && shown !== null && !toasts.some((item) => item.id === shown)) shown = show();
    if (store) follow(store);
});

/** Stop for a job this screen knows only from the store. */
export function stopFollowed(): boolean {
    if (!following || !following.stopJob) return false;
    following.stopJob();
    return true;
}

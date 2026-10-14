/**
 * The build acts (findings/builder_system_design.md §1, §2, §4): each is one function, run by
 * a registered command, a button and the right-click menu alike. Every act that changes the
 * map ends in the one toast with Undo. No act asks first.
 */
import type { SectorHex, Settings } from '@voyage/shared';
import { showToast, TOAST_ACTION_MS } from '../../shell/toast.ts';
import { parseHexKey } from '../places.ts';
import { endFlight, noteFlight, startFlight } from './flight.ts';
import { endJobToast, jobUndo, newJob, NO_JOB_UNDO, startJobToast, stopFollowed, takenOver } from './job_toast.ts';
import { isHandHex } from './hand_acts.ts';
import { runUndo } from './undo_words.ts';
import { buildStore, type HexState, type UndoToken } from './seam.ts';
import { build, errorOf, generateTargets, jobError, jobLabel, jobToast, plural, readDensity, removeTargets, restoreTargets, stateOf, tally, type Tally } from './state.ts';
import { oneSectorSay } from './one_sector.ts';
import { actError, allowanceNow, allowanceSay, writesOf, type AllowanceSay } from './allowance_words.ts';
import type { Density } from './seam.ts';
import { allowanceCovers } from '../../builder/allowance.ts';
import { watch } from 'vue';

// The density is remembered per universe: read it whenever Build's universe changes.
watch(() => {
    const store = buildStore();
    const universe = store && typeof store.universe === 'function' ? store.universe() : null;
    return universe ? universe.id : '';
}, (id) => { if (id) build.density = readDensity(id); }, { immediate: true });

/** What the acts ask of the map view: the chart under a hex, and names. */
export type BuildMap = {
    truth: (hexKey: string) => SectorHex | null;
    sectorName: (slug: string) => string;
    subsectorName: (hexKey: string) => string;
    /** The universe's generation settings, once known. */
    settings: () => Settings | null;
    /** Select these hexes on the map, as a click or a box would (a new sector's hexes, once it is made). */
    select?: (keys: string[]) => void;
};

export function selectOnMap(keys: string[]): void {
    if (map && map.select) map.select(keys);
}

let map: BuildMap | null = null;
let stopJob: (() => void) | null = null;
/** A roll that was asked for and then overtaken does not land. */
let rollTicket = 0;

export function setBuildMap(source: BuildMap | null): void {
    map = source;
}

export function buildSettings(): Settings | null {
    return map ? map.settings() : null;
}

export function placeNames(hexKey: string): { sector: string; subsector: string } {
    const place = parseHexKey(hexKey);
    return { sector: map && place ? map.sectorName(place.slug) : '', subsector: map ? map.subsectorName(hexKey) : '' };
}

export function truthAt(hexKey: string): SectorHex | null {
    return map ? map.truth(hexKey) : null;
}

export function hexState(hexKey: string): HexState {
    const store = buildStore();
    // Read the store's tick, so a screen that shows a hex's state follows every change of the map.
    if (store) void store.tick();
    return stateOf(store ? store.row(hexKey) : null, truthAt(hexKey));
}

/** The system's name on this map, else its hex number. */
export function hexName(hexKey: string): string {
    const store = buildStore();
    if (store) void store.tick();
    const row = store ? store.row(hexKey) : null;
    const truth = truthAt(hexKey);
    const place = parseHexKey(hexKey);
    const name = row && row.entry ? row.entry.name : (truth ? truth.name : '');
    return name || (place ? place.hex : hexKey);
}

export function tallyOf(keys: readonly string[]): Tally {
    return tally(keys, hexState);
}

/** Build can run: the switch is on and a universe is open. */
export function buildReady(): boolean {
    const store = buildStore();
    return build.on && !!store && store.universe() !== null;
}

/** The chart has a system under one of these hexes: removing it hides the chart's, and it can be restored. */
export function overChart(keys: readonly string[]): boolean {
    return keys.some((key) => truthAt(key) !== null);
}

/** Where these hexes are, in words: their subsector, else their sector ("Subsector C", "Spinward Marches"). */
export function placeWords(keys: readonly string[]): string {
    return where(keys);
}

function where(keys: readonly string[]): string {
    if (!map || keys.length === 0) return '';
    const names = new Set(keys.map((key) => map ? map.subsectorName(key) : ''));
    if (names.size === 1) return [...names][0];
    const place = parseHexKey(keys[0]);
    return place ? map.sectorName(place.slug) : '';
}

/** A toast with Undo. What the Undo did is said when it answers (undo_words.ts); a refused one is offered again. */
export function offerUndo(message: string, token: UndoToken): void {
    const again = (): void => { void runUndo(token, { again, name: hexName }); };
    showToast(message, { action: { label: 'Undo', run: again } });
}

function fail(err: unknown): void {
    // The allowance's refusal is the server's sentence plus the reset in the person's time zone.
    build.error = actError(err, 'That action failed. Try again.');
}

/**
 * The allowance for generating these hexes (allowance_words.ts): what to say by the control, and
 * whether it is off. One hex costs one system; many cost what the density roll writes.
 */
export function allowanceFor(keys: readonly string[], density: Density | null = build.density, filledToo = build.filledToo): AllowanceSay | null {
    if (keys.length <= 1) return allowanceSay(allowanceNow(), 1, 1);
    const count = tallyOf(keys);
    const targets = generateTargets(count, filledToo);
    const writes = writesOf(count.empty.length, targets.length - count.empty.length, density);
    return allowanceSay(allowanceNow(), writes.least, writes.most);
}

/** A request the allowance is sure to refuse is not sent: its sentence goes where the refusal would. */
function heldByAllowance(say: AllowanceSay | null): boolean {
    if (!say || !say.blocked) return false;
    build.error = say.text;
    return true;
}

// ---- one hex: a preview, then keep ---------------------------------------------------------------

export async function previewAt(hexKey: string, roll = 0): Promise<void> {
    const store = buildStore();
    if (!store || build.job) return;
    // A preview is a generated system: it counts (Keep does not).
    if (heldByAllowance(allowanceFor([hexKey]))) return;
    const ticket = ++rollTicket;
    build.error = '';
    build.sheetOpen = false;
    build.rolling = hexKey;
    try {
        const made = await store.preview(hexKey, build.choice, roll, truthAt(hexKey));
        if (ticket === rollTicket) build.preview = made;
    } catch (err) {
        if (ticket === rollTicket) fail(err);
    } finally {
        if (ticket === rollTicket) build.rolling = '';
    }
}

export function rollAgain(): void {
    const held = build.preview;
    if (held) void previewAt(held.hexKey, held.roll + 1);
}

export function discardPreview(): void {
    rollTicket += 1;
    build.rolling = '';
    build.preview = null;
}

export async function keepPreview(): Promise<void> {
    const store = buildStore();
    const held = build.preview;
    if (!store || !held) return;
    // Read before the keep: afterwards the hex holds the generated system.
    const replaced = isHandHex(held.hexKey);
    try {
        const token = await store.keep(held, truthAt(held.hexKey));
        build.preview = null;
        offerUndo('Generated ' + (held.entry.name || 'a system') + (replaced ? '. It replaces the system designed by hand.' : '.'), token);
    } catch (err) {
        fail(err);
    }
}

// ---- many hexes: counted, with Stop --------------------------------------------------------------

/**
 * The hexes a Generate on this selection would send name two sectors: the sentence that says what
 * to do instead, or empty. Judged on what would be sent (the empty hexes, and the filled ones when
 * they are regenerated too), so a selection across a border whose empty hexes are all on one side goes.
 */
export function oneSectorFor(keys: readonly string[]): string {
    if (keys.length < 2) return '';
    return oneSectorSay(generateTargets(tallyOf(keys), build.filledToo));
}

/** Many hexes, kept as they land. Hexes in an empty slot go through grow_acts.ts instead. */
export function generateMany(keys: readonly string[]): void {
    const store = buildStore();
    if (!store || build.job) return;
    const targets = generateTargets(tallyOf(keys), build.filledToo);
    if (targets.length === 0) return;
    // The server refuses two sectors in one request: nothing is sent, and the pane says what to do instead.
    const two = oneSectorSay(targets);
    if (two) {
        build.sheetOpen = false;
        build.error = two;
        return;
    }
    const say = allowanceFor(keys);
    if (heldByAllowance(say)) return;
    build.error = '';
    build.sheetOpen = false;
    build.preview = null;
    // The density roll only ever leaves an empty hex empty; a hex that holds a system is always written (packages/generation density.ts).
    const density = build.density;
    const label = jobLabel(targets.length, density);
    build.job = { total: targets.length, done: 0, failed: [], state: 'running', label };
    // When the roll might pass what is left, the server may refuse the request whole: the map's marks and the
    // toast wait until it accepts the job, so a refusal starts neither.
    const shown = { on: false, stop: null as (() => void) | null };
    const show = (): void => {
        if (shown.on) return;
        shown.on = true;
        if (shown.stop) shown.stop();
        startFlight(targets);
        startJobToast(stopBuild);
    };
    const followed = store.job;
    newJob();
    if (allowanceCovers(allowanceNow(), targets.length) || !followed) show();
    else shown.stop = watch(() => followed.value, (now) => { if (now) show(); });
    const settle = (): void => {
        if (shown.stop) shown.stop();
        shown.stop = null;
    };
    const run = store.generateMany(
        targets.map((hexKey) => ({ hexKey, truth: truthAt(hexKey) })),
        build.choice,
        (progress) => {
            noteFlight(progress);
            if (build.job) build.job = { ...progress, label, error: errorOf(progress) };
        },
        density,
    );
    stopJob = run.stop;
    void run.finished.then(
        ({ token, progress }) => {
            settle();
            stopJob = null;
            // Taken over by the store that follows it after a route change: its end was said there.
            if (takenOver()) return;
            build.job = null;
            endFlight();
            endJobToast();
            // A job that failed whole: its sentence stays beside Generate after the toast has gone.
            const lost = jobError({ failed: progress.failed, error: errorOf(progress) });
            if (lost) {
                build.error = lost;
                showToast(lost, { ms: TOAST_ACTION_MS });
                return;
            }
            // After a route change the store that started the job has closed: the current one's token is the one that works.
            const undo = jobUndo(token, store);
            if (undo) offerUndo(jobToast(progress, where(targets)), undo);
            else showToast(jobToast(progress, where(targets)) + ' ' + NO_JOB_UNDO, { ms: TOAST_ACTION_MS });
        },
        (err) => {
            settle();
            stopJob = null;
            if (takenOver()) return;
            build.job = null;
            endFlight();
            endJobToast();
            fail(err);
        },
    );
}

/** Another act's running job: Stop (the X key, the bar's button) reaches it. Null when it ends. */
export function holdJob(stop: (() => void) | null): void {
    stopJob = stop;
}

export function stopBuild(): void {
    // A job followed by the current store is stopped through it: the store that started it may have closed.
    if (stopFollowed()) return;
    if (stopJob) stopJob();
}

// ---- remove and restore --------------------------------------------------------------------------

export async function removeHexes(keys: readonly string[]): Promise<void> {
    const store = buildStore();
    if (!store || build.job) return;
    const targets = removeTargets(tallyOf(keys));
    if (targets.length === 0) return;
    const named = targets.length === 1 ? hexName(targets[0]) : plural(targets.length, 'system', 'systems');
    try {
        if (build.preview && targets.includes(build.preview.hexKey)) build.preview = null;
        const token = await store.remove(targets.map((hexKey) => ({ hexKey, truth: truthAt(hexKey) })));
        offerUndo(named + (overChart(targets) ? ' removed from your map.' : ' removed.'), token);
    } catch (err) {
        fail(err);
    }
}

export function restorable(keys: readonly string[]): string[] {
    return restoreTargets(keys, hexState, truthAt);
}

export async function restoreHexes(keys: readonly string[]): Promise<void> {
    const store = buildStore();
    if (!store || build.job) return;
    const targets = restorable(keys);
    if (targets.length === 0) return;
    // The name the chart has for it, which is what comes back.
    const truth = truthAt(targets[0]);
    const named = targets.length === 1 ? ((truth && truth.name) || hexName(targets[0])) : plural(targets.length, 'hex', 'hexes');
    try {
        const token = await store.restore(targets);
        offerUndo(named + ' restored to the chart.', token);
    } catch (err) {
        fail(err);
    }
}

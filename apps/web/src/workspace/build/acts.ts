/**
 * The build acts (findings/builder_system_design.md §1, §2, §4): each is one function, run by
 * a registered command, a button and the right-click menu alike. Every act that changes the
 * map ends in the one toast with Undo. No act asks first.
 */
import type { SectorHex, Settings } from '@voyage/shared';
import { showToast } from '../../shell/toast.ts';
import { parseHexKey } from '../places.ts';
import { buildStore, type HexState, type UndoToken } from './seam.ts';
import { build, generateTargets, jobToast, plural, removeTargets, restoreTargets, stateOf, tally, type Tally } from './state.ts';

/** What the acts ask of the map view: the chart under a hex, and names. */
export type BuildMap = {
    truth: (hexKey: string) => SectorHex | null;
    sectorName: (slug: string) => string;
    subsectorName: (hexKey: string) => string;
    /** The universe's generation settings, once known. */
    settings: () => Settings | null;
};

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

function where(keys: readonly string[]): string {
    if (!map || keys.length === 0) return '';
    const names = new Set(keys.map((key) => map ? map.subsectorName(key) : ''));
    if (names.size === 1) return [...names][0];
    const place = parseHexKey(keys[0]);
    return place ? map.sectorName(place.slug) : '';
}

function offerUndo(message: string, token: UndoToken): void {
    showToast(message, {
        action: {
            label: 'Undo',
            run: () => {
                const store = buildStore();
                if (store) void store.undo(token);
            },
        },
    });
}

function fail(err: unknown): void {
    build.error = err instanceof Error ? err.message : 'That did not work.';
}

// ---- one hex: a preview, then keep ---------------------------------------------------------------

export async function previewAt(hexKey: string, roll = 0): Promise<void> {
    const store = buildStore();
    if (!store || build.job) return;
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
    try {
        const token = await store.keep(held, truthAt(held.hexKey));
        build.preview = null;
        offerUndo('Generated ' + (held.entry.name || 'a system') + '.', token);
    } catch (err) {
        fail(err);
    }
}

// ---- many hexes: counted, with Stop --------------------------------------------------------------

export function generateMany(keys: readonly string[]): void {
    const store = buildStore();
    if (!store || build.job) return;
    const targets = generateTargets(tallyOf(keys), build.filledToo);
    if (targets.length === 0) return;
    build.error = '';
    build.sheetOpen = false;
    build.preview = null;
    const label = 'Generating ' + plural(targets.length, 'hex', 'hexes');
    build.job = { total: targets.length, done: 0, failed: [], state: 'running', label };
    const run = store.generateMany(
        targets.map((hexKey) => ({ hexKey, truth: truthAt(hexKey) })),
        build.choice,
        (progress) => { if (build.job) build.job = { ...progress, label }; },
    );
    stopJob = run.stop;
    void run.finished.then(
        ({ token, progress }) => {
            stopJob = null;
            build.job = null;
            offerUndo(jobToast(progress, where(targets)), token);
        },
        (err) => {
            stopJob = null;
            build.job = null;
            fail(err);
        },
    );
}

export function stopBuild(): void {
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

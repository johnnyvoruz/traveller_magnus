import { storageGet, storageSet } from '../platform/browser.ts';

/**
 * The released chart version this device last saw, so the map can start loading the chart at once
 * instead of waiting for the versions list (a Worker and D1 call).
 *
 * The files of one version never change, so loading the remembered version is safe. It is not
 * always the current one: the fresh answer comes back beside the load, and when it names another
 * version `bootChart` loads that one and the map swaps to it.
 */

const KEY = 'voyage.chart.version';

/** A version is part of a URL, so only URL-safe words are kept or trusted. */
const SHAPE = /^[A-Za-z0-9._-]{1,32}$/;

/** The version stored by an earlier visit, or null when none, or when storage holds something else. */
export function rememberedVersion(get: (key: string) => string | null = storageGet): string | null {
    const held = get(KEY);
    return held && SHAPE.test(held) ? held : null;
}

/** Keeps the version the versions list named. A blocked store is left as it is. */
export function rememberVersion(version: string, set: (key: string, value: string) => void = storageSet): void {
    if (SHAPE.test(version)) set(KEY, version);
}

export type ChartBoot = {
    /** The version stored by an earlier visit, or null on a first visit. */
    remembered: string | null;
    /** The fresh answer: the versions list, asked past the browser's cache. */
    ask: () => Promise<string>;
    /**
     * Loads and shows the chart of one version. It runs for the remembered version as soon as there is
     * one, and again for the fresh version when that is another. A later call replaces an earlier one:
     * the caller drops the result of a load that has been replaced.
     */
    load: (version: string) => Promise<void>;
    /** The load for a newer version failed after the remembered chart was already on screen. */
    late?: (err: unknown) => void;
};

/**
 * Starts the chart without waiting for the versions list when a version is remembered.
 *
 * - No remembered version: waits for the list, then loads that version, as before.
 * - Remembered: the list is asked at once and the remembered version loads beside it. Resolves when
 *   that first load is done; it does not wait for the list. When the list names another version,
 *   `load` runs again for it. That load's failure goes to `late`, and the chart already shown stays.
 * - The remembered version cannot be read (released rows can be withdrawn): the list decides.
 *   When it names another version, that load's result is the result. Otherwise the first error stands.
 */
export async function bootChart(opts: ChartBoot): Promise<void> {
    const { remembered, ask, load } = opts;
    const fresh = ask();
    if (!remembered) {
        await load(await fresh);
        return;
    }
    const held: { newer: Promise<void> | null } = { newer: null };
    const follow = fresh.then((latest) => {
        if (latest === remembered) return;
        held.newer = load(latest);
        return held.newer;
    }, () => undefined);
    // Handled here so a failure that lands before the first load ends is not reported as unhandled.
    follow.catch(() => undefined);
    try {
        await load(remembered);
    } catch (err) {
        try {
            await follow;
        } catch {
            // The newer version's own failure is thrown below.
        }
        if (!held.newer) throw err;
        await held.newer;
        return;
    }
    if (opts.late) follow.then(undefined, opts.late);
}
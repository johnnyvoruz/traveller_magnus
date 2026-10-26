/**
 * The zod schemas of @voyage/shared, loaded when the first one is needed (ZP2, Johnny 2026-10-22 20:08).
 *
 * The schemas were the biggest piece of the first paint that the first paint did not use. They are one
 * chunk now, fetched on first need, not with the page. Nothing a person sees or does waits on it:
 * every caller that reads a server answer starts `loadSchemas()` before it sends its request and awaits
 * it where it parses, so the chunk comes down while the answer does.
 *
 * `schemas()` is for code that runs after a parse has already happened (a held row, a leg being
 * validated for a record that is open). It throws before the load rather than guess.
 *
 * Under Node (the tests and scripts) the load finishes before this module does, so a sync caller there
 * never sees it unloaded. A browser never awaits at the top: the check is on `process.versions.node`.
 */
import type * as Shared from '@voyage/shared';

export type Schemas = typeof Shared;

let held: Schemas | null = null;
let pending: Promise<Schemas> | null = null;

/** Starts the load once and returns it. Safe to call again and again. A failed load tries again next call. */
export function loadSchemas(): Promise<Schemas> {
    if (!pending) {
        pending = import('@voyage/shared').then(
            (module) => {
                held = module;
                return module;
            },
            (error: unknown) => {
                pending = null;
                throw error;
            },
        );
    }
    return pending;
}

/** The schemas, once loaded. */
export function schemas(): Schemas {
    if (!held) throw new Error('The schemas are not loaded yet. Await loadSchemas() first.');
    return held;
}

export function schemasLoaded(): boolean {
    return held !== null;
}

const underNode = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node !== undefined;
if (underNode) await loadSchemas();
/**
 * The painted hexes of each body this page has looked at (DW2): read once per body through the
 * one store seam (platform/surface_store.ts), held for every view that shows the surface (the
 * stage, the soft globe, the print image), and replaced when the referee keeps a map. Reactive,
 * so a view that reads a handle follows a save made elsewhere on the page. A body read before
 * the universe was known (a player's campaign still loading) is read again once it is.
 */
import { shallowReactive, watch } from 'vue';
import { campaign } from '../campaign/store.ts';
import { createSurfaceStore, SurfaceStoreError } from '../platform/surface_store.ts';
import { buildStore } from '../workspace/build/seam.ts';
import type { HexEditStore, HexEdits } from './hybrid/serialize.ts';

export type SurfaceEditsHandle = {
    readonly hexKey: string;
    readonly dossierKey: string;
    /** What the store holds; null for the generated map, and until the first read lands. */
    edits: HexEdits | null;
    /** The first read has landed (or failed). */
    loaded: boolean;
    /** A read or a save is on its way. */
    busy: boolean;
    /** The store's last refusal, in its words; '' when none. */
    error: string;
    /** The universe the last read was for; null when none was open (this page's memory). */
    universe: string | null;
};

/** The universe whose paint is shown: the one being built, else the open campaign's. */
function universeIdNow(): string | null {
    const store = buildStore();
    const built = store ? store.universe() : null;
    if (built) return built.id;
    return campaign.universeId;
}

const realStore = (): HexEditStore => createSurfaceStore({ fetch: (...args) => fetch(...args), universeId: universeIdNow });
let store: HexEditStore = realStore();
/** Shallow on purpose: the edits are plain data and cross to the surface worker as they are. */
const held = shallowReactive(new Map<string, SurfaceEditsHandle>());
const loading = new Map<string, Promise<void>>();

const slot = (hexKey: string, dossierKey: string): string => hexKey + '|' + dossierKey;

/** Tests hand over their own store; `null` puts the real one back. Both forget what was held. */
export function useSurfaceStore(next: HexEditStore | null): void {
    store = next ?? realStore();
    resetSurfaceEdits();
}

export function resetSurfaceEdits(): void {
    held.clear();
    loading.clear();
}

function read(handle: SurfaceEditsHandle): Promise<void> {
    const key = slot(handle.hexKey, handle.dossierKey);
    const universe = universeIdNow();
    handle.busy = true;
    handle.universe = universe;
    const job = store.load(handle.hexKey, handle.dossierKey).then((edits) => {
        if (held.get(key) !== handle) return;
        handle.edits = edits;
        handle.error = '';
    }, (err: unknown) => {
        if (held.get(key) !== handle) return;
        handle.error = err instanceof Error ? err.message : '';
    }).then(() => {
        handle.loaded = true;
        handle.busy = false;
        if (loading.get(key) === job) loading.delete(key);
    });
    loading.set(key, job);
    return job;
}

/** The handle for a body, reading it once. The same object every time. */
export function surfaceEdits(hexKey: string, dossierKey: string): SurfaceEditsHandle {
    const key = slot(hexKey, dossierKey);
    let handle = held.get(key);
    if (!handle) {
        handle = shallowReactive({ hexKey, dossierKey, edits: null, loaded: false, busy: false, error: '', universe: null });
        held.set(key, handle);
        void read(handle);
    } else if (handle.loaded && !handle.busy && handle.universe !== universeIdNow()) {
        void read(handle);
    }
    return handle;
}

/** The universe became known after a body was read: those bodies are read again, from the universe this time. */
watch(universeIdNow, (id) => {
    for (const handle of held.values()) {
        if (handle.loaded && !handle.busy && handle.universe !== id) void read(handle);
    }
});

/** The read of a body on its way, for a caller that wants to wait for it. */
export function surfaceEditsLoaded(hexKey: string, dossierKey: string): Promise<void> {
    surfaceEdits(hexKey, dossierKey);
    return loading.get(slot(hexKey, dossierKey)) ?? Promise.resolve();
}

/** What is held for a body: the edits, null for none, or undefined when nothing has asked yet. */
export function editsHeld(hexKey: string, dossierKey: string): HexEdits | null | undefined {
    const handle = held.get(slot(hexKey, dossierKey));
    return handle ? handle.edits : undefined;
}

/**
 * Keeps a map: `null` clears it. The handle shows the kept edits when the store has them.
 * Throws the store's sentence on a refusal (a conflict, no server), with nothing changed here.
 */
export async function saveSurfaceEdits(hexKey: string, dossierKey: string, edits: HexEdits | null): Promise<void> {
    const handle = surfaceEdits(hexKey, dossierKey);
    handle.busy = true;
    handle.error = '';
    try {
        if (edits && edits.edits.length) await store.save(hexKey, dossierKey, edits);
        else await store.clear(hexKey, dossierKey);
        handle.edits = edits && edits.edits.length ? edits : null;
        handle.universe = universeIdNow();
    } catch (err) {
        handle.error = err instanceof SurfaceStoreError ? err.message : err instanceof Error && err.message ? err.message : 'The map wasn’t kept. Try again.';
        throw err;
    } finally {
        handle.busy = false;
    }
}

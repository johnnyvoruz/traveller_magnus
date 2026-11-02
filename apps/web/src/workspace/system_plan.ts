/**
 * A system's orbit plan for a screen that is not the orbit view (Lane D's DT7: the Track block measures the
 * flight to the 100-diameter limit on the same picture the orbit view draws). The tree is asked for the way
 * OrbitView.vue asks (orbit/tree_source.ts treeAsk): the universe's own row when it has one, else the chart's
 * hash from the sector index the markets list reads; presented as the orbit view presents it, normalised and
 * planned with the same functions, so the two never disagree. Plans are kept by hex for the session.
 */
import { presentTree } from '../orbit/hand_present.ts';
import { planSystem, type Plan } from '../orbit/layout.ts';
import { normalizeSystem } from '../orbit/system.ts';
import { treeAsk, type TreeAsk } from '../orbit/tree_source.ts';
import { buildStore } from './build/seam.ts';
import { entryAt, treeOf } from './markets_near.ts';
import { parseHexKey } from './places.ts';

/**
 * Where the plan would come from, now: reactive through `entryAt` (the index arrives) and the build store's
 * tick. `wait` while the index is on its way; `none` for a hex with no tree.
 */
export function planAsk(hexKey: string): TreeAsk {
    const place = parseHexKey(hexKey);
    if (!place) return { kind: 'none' };
    const store = buildStore();
    if (store) void store.tick();
    const universe = store ? store.universe() : null;
    const row = store ? store.row(hexKey) : null;
    // The universe's own row (built or overridden here): its tree is the store's, by the row's revision.
    if (row && row.state !== 'removed') return { kind: 'private', hash: row.rev + ':' + row.hexKey };
    const listed = entryAt(hexKey);
    return treeAsk({
        universeId: universe ? universe.id : null,
        sectorLoaded: true,
        row: row ? { state: row.state, treeHash: null } : null,
        chartHash: listed && typeof listed.tree === 'string' ? listed.tree : null,
    });
}

const plans = new Map<string, Promise<Plan | null>>();

function planOf(doc: unknown, hexKey: string): Plan | null {
    const presented = presentTree(doc);
    const body = presented && typeof presented === 'object' ? (presented as { body?: unknown }).body : null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const system = normalizeSystem(body as Record<string, unknown>);
    return system ? planSystem(system, hexKey) : null;
}

/** The plan for a tree the ask names; null when there is none to read. One fetch per hex and hash. */
export function loadPlan(hexKey: string, ask: TreeAsk): Promise<Plan | null> {
    if (ask.kind !== 'private' && ask.kind !== 'public') return Promise.resolve(null);
    const key = hexKey + ' ' + ask.kind + ' ' + ask.hash;
    const held = plans.get(key);
    if (held) return held;
    const store = buildStore();
    const fetched = (ask.kind === 'private' && store ? store.tree(hexKey) : treeOf(ask.hash))
        .then((doc) => planOf(doc, hexKey))
        .catch(() => { plans.delete(key); return null; });
    plans.set(key, fetched);
    return fetched;
}

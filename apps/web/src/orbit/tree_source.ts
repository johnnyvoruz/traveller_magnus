/**
 * Where the orbit view reads a system's tree.
 * A universe row's object is private. The chart's hash is public.
 * The two are never mixed: a private hash is not requested from the CDN.
 */

export type TreeRowRef = { state: string; treeHash: string | null };

export type TreeAsk =
    | { kind: 'wait' }
    | { kind: 'removed' }
    | { kind: 'none' }
    | { kind: 'private'; hash: string }
    | { kind: 'public'; hash: string };

/**
 * universeId set and the sector page not loaded yet: wait. Do not use the chart hash
 * in that gap, or a cold orbit address fetches the public object and paints the chart.
 * A loaded row with a treeHash is the private object. No such row uses the chart hash.
 */
export function treeAsk(input: {
    universeId: string | null;
    sectorLoaded: boolean;
    row: TreeRowRef | null;
    chartHash: string | null;
}): TreeAsk {
    if (input.universeId) {
        if (!input.sectorLoaded) return { kind: 'wait' };
        if (input.row && input.row.state === 'removed') return { kind: 'removed' };
        if (input.row && input.row.treeHash) return { kind: 'private', hash: input.row.treeHash };
    }
    if (input.chartHash) return { kind: 'public', hash: input.chartHash };
    return { kind: 'none' };
}

/** The private object route. The hash is the row's treeHash, already lowercase hex. */
export function privateTreeUrl(universeId: string, hash: string): string {
    return `/api/universes/${encodeURIComponent(universeId)}/objects/${hash}`;
}

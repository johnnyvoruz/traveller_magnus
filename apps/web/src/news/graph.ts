/**
 * The X-boat graph (spec_xboat_ripples.md §1.1 and §5 A1).
 * Nodes are systems. Edges are two-way. Weights are days, using the likely
 * jump (the mean of the cited dice). Off-network edges are omitted while
 * offNetworkWaitHours is null: the picture is X-boat only until that wait exists.
 */
import { fromGlobal, hexDistance, parseHex, SECTOR_COLS, SECTOR_ROWS, toGlobal } from '../map/geometry.ts';
import { jumpSpan, NEWS_PARAMS, type NewsParams } from './params.ts';

export type NewsIndex = {
    slug: string;
    x: number;
    y: number;
    hexes: Readonly<Record<string, unknown>>;
    metadata: { routes?: readonly unknown[] };
};

/** One overview sector that has no index loaded. '.' is an empty hex. */
export type NewsCells = {
    slug: string;
    x: number;
    y: number;
    cells: string;
};

export type NewsNode = {
    key: string;
    slug: string;
    hex: string;
    q: number;
    r: number;
    /** False when the node comes from overview cells and the index is not loaded. */
    loaded: boolean;
};

export type NewsGraph = {
    nodes: NewsNode[];
    /** CSR over directed arcs. Each undirected edge is stored twice. */
    offsets: Uint32Array;
    targets: Uint32Array;
    /** 0 X-boat, 1 off-network. One entry per directed arc. */
    kinds: Uint8Array;
    /** Days. One entry per directed arc. */
    weights: Float32Array;
    xboatEdges: number;
    offEdges: number;
};

const XBOAT = 0;
const OFF = 1;

type EndKey = string;

function asRecord(value: unknown): Record<string, string> | null {
    if (!value || typeof value !== 'object') return null;
    const out: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string') out[key] = item;
    }
    return out;
}

function offsetOf(record: Record<string, string>, which: 'Start' | 'End', axis: 'X' | 'Y'): number {
    const raw = record[which + 'Offset' + axis];
    if (raw === undefined || raw === '') return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
}

/** Johnny 20:27: bare records plus Type "Xboat". `chart` and `allegiances:` are the other settings. */
export function routeIsXboat(record: Record<string, string>, rule: string): boolean {
    const type = record.Type ?? '';
    const allegiance = record.Allegiance ?? '';
    const color = record.Color ?? '';
    const bare = type === 'Xboat' || (type === '' && allegiance === '' && color === '');
    if (rule === 'bare') return bare;
    if (rule === 'chart') return allegiance === '' && color === '';
    if (rule.startsWith('allegiances:')) {
        const codes = rule.slice('allegiances:'.length).split(',');
        return bare || codes.includes(allegiance);
    }
    return false;
}

function endKey(index: NewsIndex, record: Record<string, string>, which: 'Start' | 'End'): EndKey | null {
    const hex = record[which];
    if (!hex || !parseHex(hex)) return null;
    const sx = index.x + offsetOf(record, which, 'X');
    const sy = index.y + offsetOf(record, which, 'Y');
    return sx + ',' + sy + ',' + hex;
}

function xboatDays(params: NewsParams): number {
    return (jumpSpan(params.xboatLegHours).likely + params.stationHoldHours) / 24;
}

function offDays(params: NewsParams): number {
    const wait = params.offNetworkWaitHours;
    if (wait === null) return 0;
    return (wait + jumpSpan(params.jumpHours).likely) / 24;
}

/**
 * Sectors still wanted by a settled frontier. A node within max(offNetworkParsecs, 5)
 * parsecs of a sector edge names the sector across that edge (spec §2). At sectorCap, none.
 */
export function sectorsWanted(
    nodes: readonly { q: number; r: number }[],
    loaded: readonly { sx: number; sy: number }[],
    params: NewsParams = NEWS_PARAMS,
): { sx: number; sy: number }[] {
    if (loaded.length >= params.sectorCap) return [];
    const have = new Set(loaded.map((sector) => sector.sx + ',' + sector.sy));
    const reach = Math.max(params.offNetworkParsecs, 5);
    const want = new Map<string, { sx: number; sy: number }>();
    for (const node of nodes) {
        const here = fromGlobal(node.q, node.r);
        const west = here.col <= reach;
        const east = here.col > SECTOR_COLS - reach;
        const north = here.row <= reach;
        const south = here.row > SECTOR_ROWS - reach;
        const steps: [number, number][] = [];
        if (west) steps.push([-1, 0]);
        if (east) steps.push([1, 0]);
        if (north) steps.push([0, -1]);
        if (south) steps.push([0, 1]);
        if (west && north) steps.push([-1, -1]);
        if (east && north) steps.push([1, -1]);
        if (west && south) steps.push([-1, 1]);
        if (east && south) steps.push([1, 1]);
        for (const [dx, dy] of steps) {
            const sx = here.sx + dx;
            const sy = here.sy + dy;
            const key = sx + ',' + sy;
            if (!have.has(key)) want.set(key, { sx, sy });
        }
    }
    return [...want.values()].sort((a, b) => a.sx - b.sx || a.sy - b.sy);
}

type Arc = { to: number; kind: number; days: number };

function addUndirected(lists: Arc[][], a: number, b: number, kind: number, days: number): boolean {
    if (a === b) return false;
    const from = lists[a];
    for (const arc of from) {
        if (arc.to === b && arc.kind === kind) return false;
    }
    from.push({ to: b, kind, days });
    lists[b].push({ to: a, kind, days });
    return true;
}

/** Pairs within `parsecs`, by a spatial hash on global hexes. Not an all-pairs scan. */
function offNetworkPairs(nodes: readonly NewsNode[], parsecs: number): [number, number][] {
    const buckets = new Map<string, number[]>();
    const cellOf = (q: number, r: number) => Math.floor(q / parsecs) + ',' + Math.floor(r / parsecs);
    for (let i = 0; i < nodes.length; i++) {
        const key = cellOf(nodes[i].q, nodes[i].r);
        const list = buckets.get(key);
        if (list) list.push(i);
        else buckets.set(key, [i]);
    }
    const pairs: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
        const cx = Math.floor(nodes[i].q / parsecs);
        const cy = Math.floor(nodes[i].r / parsecs);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const list = buckets.get((cx + dx) + ',' + (cy + dy));
                if (!list) continue;
                for (const j of list) {
                    if (j <= i) continue;
                    if (hexDistance(nodes[i], nodes[j]) <= parsecs) pairs.push([i, j]);
                }
            }
        }
    }
    return pairs;
}

export function buildNewsGraph(
    indexes: readonly NewsIndex[],
    overviews: readonly NewsCells[] = [],
    params: NewsParams = NEWS_PARAMS,
): NewsGraph {
    const loadedAt = new Set(indexes.map((index) => index.x + ',' + index.y));
    const byEnd = new Map<EndKey, number>();
    const nodes: NewsNode[] = [];

    function addNode(slug: string, sx: number, sy: number, hex: string, loaded: boolean): void {
        const local = parseHex(hex);
        if (!local) return;
        const end = sx + ',' + sy + ',' + hex;
        if (byEnd.has(end)) return;
        const global = toGlobal(sx, sy, local.col, local.row);
        byEnd.set(end, nodes.length);
        nodes.push({ key: slug + '/' + hex, slug, hex, q: global.q, r: global.r, loaded });
    }

    for (const index of indexes) {
        const hexes = Object.keys(index.hexes).sort();
        for (const hex of hexes) addNode(index.slug, index.x, index.y, hex, true);
    }
    for (const overview of overviews) {
        if (loadedAt.has(overview.x + ',' + overview.y)) continue;
        const cells = overview.cells;
        for (let i = 0; i < cells.length; i++) {
            if (cells[i] === '.') continue;
            const col = Math.floor(i / SECTOR_ROWS) + 1;
            const row = (i % SECTOR_ROWS) + 1;
            const hex = String(col).padStart(2, '0') + String(row).padStart(2, '0');
            addNode(overview.slug, overview.x, overview.y, hex, false);
        }
    }

    const lists: Arc[][] = nodes.map(() => []);
    let xboatEdges = 0;
    let offEdges = 0;
    const boatDays = xboatDays(params);

    for (const index of indexes) {
        const routes = index.metadata.routes ?? [];
        for (const raw of routes) {
            const record = asRecord(raw);
            if (!record || !routeIsXboat(record, params.xboatRouteRule)) continue;
            const start = endKey(index, record, 'Start');
            const end = endKey(index, record, 'End');
            if (!start || !end) continue;
            const a = byEnd.get(start);
            const b = byEnd.get(end);
            if (a === undefined || b === undefined) continue;
            if (hexDistance(nodes[a], nodes[b]) > params.xboatMaxParsecs) continue;
            if (addUndirected(lists, a, b, XBOAT, boatDays)) xboatEdges += 1;
        }
    }

    const wait = params.offNetworkWaitHours;
    if (params.offNetworkOn && wait !== null && params.offNetworkParsecs > 0) {
        const days = offDays(params);
        for (const [a, b] of offNetworkPairs(nodes, params.offNetworkParsecs)) {
            if (addUndirected(lists, a, b, OFF, days)) offEdges += 1;
        }
    }

    let arcCount = 0;
    for (const list of lists) arcCount += list.length;
    const offsets = new Uint32Array(nodes.length + 1);
    const targets = new Uint32Array(arcCount);
    const kinds = new Uint8Array(arcCount);
    const weights = new Float32Array(arcCount);
    let cursor = 0;
    for (let i = 0; i < nodes.length; i++) {
        offsets[i] = cursor;
        const list = lists[i].sort((a, b) => a.to - b.to || a.kind - b.kind);
        for (const arc of list) {
            targets[cursor] = arc.to;
            kinds[cursor] = arc.kind;
            weights[cursor] = arc.days;
            cursor += 1;
        }
    }
    offsets[nodes.length] = cursor;
    return { nodes, offsets, targets, kinds, weights, xboatEdges, offEdges };
}

/** Undirected edges of one kind, as "slug/hex slug/hex" with the keys sorted, then the list sorted. */
export function edgePairs(graph: NewsGraph, kind: 0 | 1): string[] {
    const out: string[] = [];
    for (let i = 0; i < graph.nodes.length; i++) {
        for (let k = graph.offsets[i]; k < graph.offsets[i + 1]; k++) {
            const j = graph.targets[k];
            if (j < i || graph.kinds[k] !== kind) continue;
            const a = graph.nodes[i].key;
            const b = graph.nodes[j].key;
            out.push(a < b ? a + ' ' + b : b + ' ' + a);
        }
    }
    out.sort();
    return out;
}
